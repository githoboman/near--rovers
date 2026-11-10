import { extractJsonObject, NearAiCloudClient, sha256Hex } from "../ai/nearAiClient.ts";
import type { PerpetuaServiceConfig } from "../config.ts";
import type { PerpetuaDatabase } from "../db/index.ts";
import type { PerpetuaNearClient } from "../near/client.ts";
import type {
  ClaimView,
  JuryModelVoteRecord,
  JuryRulingRecord,
  MarketView,
  Outcome,
  PriceHistoryPoint,
  Verdict,
} from "../types.ts";

export interface JuryEvidencePacket {
  claim_id: number;
  epoch: number;
  claim_text: string;
  text_hash: string;
  category: string;
  evidence_uris: string[];
  challenger_side: Outcome | null;
  counter_side: Outcome | null;
  snap_yes_price_e6: number | null;
  escalated_at: string | null;
  recent_price_history: PriceHistoryPoint[];
}

interface ParsedModelVote {
  vote?: string;
  confidence?: number;
  reasoning?: string;
}

export function normalizeVerdictVote(raw?: string): Verdict | "Abstain" {
  if (!raw) return "Abstain";
  const upper = raw.trim().toUpperCase();
  if (upper === "TRUE" || upper === "YES") return "True";
  if (upper === "FALSE" || upper === "NO") return "False";
  if (upper === "UNRESOLVED" || upper === "UNKNOWN" || upper === "UNCERTAIN") {
    return "Unresolved";
  }
  return "Abstain";
}

export function computeRequiredSupermajority(
  totalModels: number,
  numerator: number,
  denominator: number,
): number {
  if (totalModels <= 0) return 1;
  return Math.max(1, Math.ceil((totalModels * numerator) / denominator));
}

export function tallySupermajority(
  votes: Array<Pick<JuryModelVoteRecord, "vote">>,
  totalModels: number,
  numerator: number,
  denominator: number,
): { verdict: Verdict; supermajorityCount: number; requiredMajority: number } {
  const requiredMajority = computeRequiredSupermajority(
    totalModels,
    numerator,
    denominator,
  );
  let trueCount = 0;
  let falseCount = 0;
  let unresolvedCount = 0;

  for (const v of votes) {
    if (v.vote === "True") trueCount += 1;
    else if (v.vote === "False") falseCount += 1;
    else if (v.vote === "Unresolved") unresolvedCount += 1;
  }

  if (trueCount >= requiredMajority && trueCount > falseCount) {
    return {
      verdict: "True",
      supermajorityCount: trueCount,
      requiredMajority,
    };
  }
  if (falseCount >= requiredMajority && falseCount > trueCount) {
    return {
      verdict: "False",
      supermajorityCount: falseCount,
      requiredMajority,
    };
  }
  return {
    verdict: "Unresolved",
    supermajorityCount: unresolvedCount,
    requiredMajority,
  };
}

export class JuryService {
  private readonly config: PerpetuaServiceConfig;
  private readonly db: PerpetuaDatabase;
  private readonly nearClient: PerpetuaNearClient;
  private readonly aiClient: NearAiCloudClient;

  constructor(
    config: PerpetuaServiceConfig,
    db: PerpetuaDatabase,
    nearClient: PerpetuaNearClient,
    aiClient: NearAiCloudClient,
  ) {
    this.config = config;
    this.db = db;
    this.nearClient = nearClient;
    this.aiClient = aiClient;
  }

  buildEvidencePacket(claim: ClaimView, market: MarketView): JuryEvidencePacket {
    const history = this.db.getPriceHistory(claim.id, market.epoch);
    const recentHistory = history.slice(-20);
    return {
      claim_id: claim.id,
      epoch: market.epoch,
      claim_text: claim.text,
      text_hash: claim.text_hash,
      category: claim.category,
      evidence_uris: claim.evidence_uris,
      challenger_side: market.challenger_side,
      counter_side: market.counter_side,
      snap_yes_price_e6: market.snap_yes_price_e6,
      escalated_at: market.escalated_at,
      recent_price_history: recentHistory,
    };
  }

  async resolveEscalatedClaim(
    claim: ClaimView,
    market: MarketView,
    opts?: { submitOnChain?: boolean },
  ): Promise<JuryRulingRecord> {
    const existing = this.db.getJuryRuling(claim.id, market.epoch);
    if (existing) {
      if (
        opts?.submitOnChain !== false &&
        !existing.submitted_tx_hash &&
        market.status === "Escalated" &&
        this.nearClient.isConfigured() &&
        this.nearClient.hasResolverSigner()
      ) {
        const txHash = await this.nearClient.submitRuling({
          claimId: claim.id,
          verdict: existing.verdict,
          attestationHash: existing.attestation_hash,
        });
        this.db.markJuryRulingSubmitted(claim.id, market.epoch, txHash);
        existing.submitted_tx_hash = txHash;
      }
      return existing;
    }

    const packet = this.buildEvidencePacket(claim, market);
    const evidencePacketJson = JSON.stringify(packet);
    const evidenceHash = sha256Hex(evidencePacketJson);

    const systemPrompt = [
      "You are an impartial Web3 fact-checking juror on the Perpetua protocol.",
      "Evaluate the disputed factual claim strictly against the cited evidence URIs, claim text, and timeline.",
      "If evidence in the packet is insufficient, ambiguous, or depends on live off-chain verification you cannot establish with high confidence, vote UNRESOLVED rather than guessing.",
      'Return ONLY valid JSON with this exact shape: {"vote":"TRUE"|"FALSE"|"UNRESOLVED","confidence":0-100,"reasoning":"concise 2-4 sentence factual rationale citing specific URIs or ambiguity"}',
    ].join(" ");

    const userPrompt = [
      `Claim #${packet.claim_id} (Epoch ${packet.epoch}, Category: ${packet.category}):`,
      `"${packet.claim_text}"`,
      `Claim SHA-256: ${packet.text_hash}`,
      `Challenger Assertion: ${packet.challenger_side ?? "contrarian"}${
        packet.counter_side ? ` (Counter-challenger side: ${packet.counter_side})` : ""
      } (Market YES snapshot: ${
        packet.snap_yes_price_e6 !== null
          ? `${(packet.snap_yes_price_e6 / 10000).toFixed(2)}%`
          : "N/A"
      })`,
      `Cited Evidence URIs (${packet.evidence_uris.length}):`,
      ...packet.evidence_uris.map((u, idx) => `  [${idx + 1}] ${u}`),
      `Recent Price Trajectory (${packet.recent_price_history.length} samples):`,
      JSON.stringify(
        packet.recent_price_history.map((p) => ({
          t: p.timestamp_ms,
          yes_pct: Number((p.yes_price_e6 / 10000).toFixed(2)),
          event: p.trigger_event,
        })),
      ),
    ].join("\n");

    const models = this.config.juryModels;
    if (models.length < 3) {
      throw new Error(
        `Perpetua jury requires at least 3 models configured (got ${models.length})`,
      );
    }

    const votes: JuryModelVoteRecord[] = await Promise.all(
      models.map(async (model): Promise<JuryModelVoteRecord> => {
        if (!this.aiClient.hasApiKey()) {
          if (!this.config.allowUnverifiedFallback) {
            return {
              model,
              vote: "Abstain",
              confidence: 0,
              reasoning: "NEAR_AI_API_KEY not configured",
              rawRequest: "",
              rawResponse: "",
              requestHash: "",
              responseHash: "",
              chatId: null,
              signatureKind: null,
              signatureValid: false,
              signingAddress: null,
              signingAlgo: null,
              attestationNonce: null,
              gatewayNonceMatched: false,
              modelAttestationPresent: false,
              error: "NEAR_AI_API_KEY missing",
            };
          }
          const req = JSON.stringify({ model, fallback: true, evidenceHash });
          const snap = market.snap_yes_price_e6 ?? 500_000;
          const fallbackVote: Verdict =
            snap >= 650_000 ? "True" : snap <= 350_000 ? "False" : "Unresolved";
          return {
            model,
            vote: fallbackVote,
            confidence: 55,
            reasoning:
              "Unverified local fallback vote generated because ALLOW_UNVERIFIED_FALLBACK=true and NEAR_AI_API_KEY is unset.",
            rawRequest: req,
            rawResponse: JSON.stringify({ vote: fallbackVote, fallback: true }),
            requestHash: sha256Hex(req),
            responseHash: sha256Hex(fallbackVote),
            chatId: null,
            signatureKind: null,
            signatureValid: false,
            signingAddress: null,
            signingAlgo: null,
            attestationNonce: null,
            gatewayNonceMatched: false,
            modelAttestationPresent: false,
            error: "ALLOW_UNVERIFIED_FALLBACK active",
          };
        }

        try {
          const completion = await this.aiClient.chatCompletionWithAttestation({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature: 0.1,
            maxTokens: 500,
          });
          const parsed = extractJsonObject<ParsedModelVote>(completion.content);
          const vote = normalizeVerdictVote(parsed?.vote);
          const confidence = Math.max(
            0,
            Math.min(100, Math.round(Number(parsed?.confidence ?? 50))),
          );
          const reasoning =
            typeof parsed?.reasoning === "string" && parsed.reasoning.trim()
              ? parsed.reasoning.trim()
              : completion.content.slice(0, 400);

          return {
            model,
            vote,
            confidence,
            reasoning,
            rawRequest: completion.rawRequest,
            rawResponse: completion.rawResponse,
            requestHash: completion.requestHash,
            responseHash: completion.responseHash,
            chatId: completion.chatId,
            signatureKind: completion.signatureKind,
            signatureValid: completion.signatureValid,
            signingAddress: completion.signingAddress,
            signingAlgo: completion.signingAlgo,
            attestationNonce: completion.attestationNonce,
            gatewayNonceMatched: completion.gatewayNonceMatched,
            modelAttestationPresent: completion.modelAttestationPresent,
            error: parsed ? null : "Could not parse strict JSON; mapped vote conservatively",
          };
        } catch (err) {
          return {
            model,
            vote: "Abstain",
            confidence: 0,
            reasoning: "",
            rawRequest: "",
            rawResponse: "",
            requestHash: "",
            responseHash: "",
            chatId: null,
            signatureKind: null,
            signatureValid: false,
            signingAddress: null,
            signingAlgo: null,
            attestationNonce: null,
            gatewayNonceMatched: false,
            modelAttestationPresent: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );

    const tally = tallySupermajority(
      votes,
      models.length,
      this.config.jurySupermajorityNumerator,
      this.config.jurySupermajorityDenominator,
    );

    const attestationBundle = {
      claim_id: claim.id,
      epoch: market.epoch,
      evidence_hash: evidenceHash,
      verdict: tally.verdict,
      required_majority: tally.requiredMajority,
      total_models: models.length,
      votes: votes.map((v) => ({
        model: v.model,
        vote: v.vote,
        confidence: v.confidence,
        chat_id: v.chatId,
        request_hash: v.requestHash,
        response_hash: v.responseHash,
        signature_kind: v.signatureKind,
        signature_valid: v.signatureValid,
        signing_address: v.signingAddress,
        signing_algo: v.signingAlgo,
        attestation_nonce: v.attestationNonce,
        gateway_nonce_matched: v.gatewayNonceMatched,
        model_attestation_present: v.modelAttestationPresent,
      })),
    };
    const attestationBundleJson = JSON.stringify(attestationBundle);
    const attestationHash = sha256Hex(attestationBundleJson);

    const record: JuryRulingRecord = {
      claim_id: claim.id,
      epoch: market.epoch,
      verdict: tally.verdict,
      supermajority_count: tally.supermajorityCount,
      total_models: models.length,
      required_majority: tally.requiredMajority,
      evidence_packet_json: evidencePacketJson,
      evidence_hash: evidenceHash,
      attestation_bundle_json: attestationBundleJson,
      attestation_hash: attestationHash,
      submitted_tx_hash: null,
      mode: this.aiClient.hasApiKey()
        ? "near-ai-cloud-tee"
        : "fallback-unverified",
      created_at: Date.now(),
      votes,
    };

    this.db.saveJuryRuling(record);

    if (
      opts?.submitOnChain !== false &&
      market.status === "Escalated" &&
      this.nearClient.isConfigured() &&
      this.nearClient.hasResolverSigner()
    ) {
      const txHash = await this.nearClient.submitRuling({
        claimId: claim.id,
        verdict: record.verdict,
        attestationHash: record.attestation_hash,
      });
      this.db.markJuryRulingSubmitted(claim.id, market.epoch, txHash);
      record.submitted_tx_hash = txHash;
    }

    return record;
  }
}
