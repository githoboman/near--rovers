import { priceE6, yoctoToNearNumber } from "../amm.ts";
import { extractJsonObject, NearAiCloudClient, sha256Hex } from "../ai/nearAiClient.ts";
import type { PerpetuaServiceConfig } from "../config.ts";
import type { PerpetuaDatabase } from "../db/index.ts";
import type { PerpetuaNearClient } from "../near/client.ts";
import type {
  AnnotatedSentence,
  ClaimView,
  GeneratedPageRecord,
  MarketView,
} from "../types.ts";

export interface MarketSnapshotPayload {
  claim_id: number;
  epoch: number;
  claim_text: string;
  category: string;
  evidence_uris: string[];
  status: MarketView["status"];
  yes_price_e6: number;
  no_price_e6: number;
  yes_reserve: string;
  no_reserve: string;
  fee_pool: string;
  verdict: MarketView["verdict"];
}

export function confidenceBand(confidenceE6: number): AnnotatedSentence["band"] {
  if (confidenceE6 >= 650_000) return "high";
  if (confidenceE6 <= 350_000) return "low";
  return "contested";
}

export function buildMarketSnapshot(
  claim: ClaimView,
  market: MarketView,
): MarketSnapshotPayload {
  const prices = priceE6(BigInt(market.yes_reserve), BigInt(market.no_reserve));
  return {
    claim_id: claim.id,
    epoch: market.epoch,
    claim_text: claim.text,
    category: claim.category,
    evidence_uris: claim.evidence_uris,
    status: market.status,
    yes_price_e6: prices.yes,
    no_price_e6: prices.no,
    yes_reserve: market.yes_reserve,
    no_reserve: market.no_reserve,
    fee_pool: market.fee_pool,
    verdict: market.verdict,
  };
}

export function computeDeterministicPageHash(
  snapshotJson: string,
  prompt: string,
  model: string,
): string {
  return sha256Hex(`${snapshotJson}\n---\n${prompt}\n---\n${model}`);
}

export function buildPagePrompt(snapshot: MarketSnapshotPayload): string {
  const yesPct = (snapshot.yes_price_e6 / 10_000).toFixed(1);
  const reserveDepthNear = (
    yoctoToNearNumber(snapshot.yes_reserve) + yoctoToNearNumber(snapshot.no_reserve)
  ).toFixed(2);

  return [
    `Write an encyclopedia entry for Perpetua Claim #${snapshot.claim_id} (${snapshot.category}, Epoch ${snapshot.epoch}).`,
    `Claim under evaluation: "${snapshot.claim_text}"`,
    `Market confidence in YES: ${yesPct}% (yes_price_e6=${snapshot.yes_price_e6}, no_price_e6=${snapshot.no_price_e6}, status=${snapshot.status}, pool_depth≈${reserveDepthNear} NEAR).`,
    `Verdict state: ${snapshot.verdict ?? "none"}.`,
    `Primary evidence URIs: ${snapshot.evidence_uris.join(", ")}`,
    "Requirements:",
    "- Reflect the exact epistemological tone implied by the market confidence (>= 65% YES -> affirmative with caveats; 36-64% -> actively contested dispute; <= 35% -> likely contradicted / skeptical).",
    "- Produce a one-sentence summary plus 3 to 5 standalone analytical sentences with per-sentence confidence integers in [0, 1000000].",
    '- Return JSON ONLY: {"summary":"...", "markdown":"...", "sentences":[{"text":"...","confidenceE6":750000,"citation":"optional URI"}]}',
  ].join("\n");
}

function synthesizeTemplatePage(
  snapshot: MarketSnapshotPayload,
): { summary: string; markdown: string; sentences: AnnotatedSentence[] } {
  const yesPct = (snapshot.yes_price_e6 / 10_000).toFixed(1);
  const band = confidenceBand(snapshot.yes_price_e6);
  const depth = (
    yoctoToNearNumber(snapshot.yes_reserve) + yoctoToNearNumber(snapshot.no_reserve)
  ).toFixed(2);

  const stanceLead =
    band === "high"
      ? `Current Epoch ${snapshot.epoch} market pricing (${yesPct}% YES) assigns high confidence that the claim holds:`
      : band === "contested"
        ? `Epoch ${snapshot.epoch} pricing (${yesPct}% YES) marks this statement as actively contested without firm market consensus:`
        : `Epoch ${snapshot.epoch} pricing (${yesPct}% YES) indicates strong market skepticism toward this claim:`;

  const summary =
    band === "high"
      ? `Market-implied confidence stands at ${yesPct}% YES (${snapshot.status}).`
      : band === "contested"
        ? `Market sentiment remains divided at ${yesPct}% YES (${snapshot.status}).`
        : `Market pricing leans against the claim at ${yesPct}% YES (${snapshot.status}).`;

  const s1: AnnotatedSentence = {
    text: `${stanceLead} "${snapshot.claim_text}"`,
    confidenceE6: snapshot.yes_price_e6,
    band,
  };

  const primaryUri = snapshot.evidence_uris[0];
  const s2Text =
    snapshot.evidence_uris.length > 0
      ? `Primary verification relies on ${snapshot.evidence_uris.length} cited source URI(s) anchored by ${primaryUri}, which remain open to challenge.`
      : "No primary evidence URIs have been attached to this claim.";
  const s2Conf = Math.max(150_000, Math.min(900_000, snapshot.yes_price_e6));
  const s2: AnnotatedSentence = {
    text: s2Text,
    confidenceE6: s2Conf,
    band: confidenceBand(s2Conf),
    citation: primaryUri,
  };

  const s3Conf =
    snapshot.verdict === "True" || snapshot.verdict === "False" ? 920_000 : 500_000;
  const s3Text =
    snapshot.status === "Open"
      ? `Liquidity across YES and NO reserves totals approximately ${depth} NEAR in an open constant-product market; anyone disputing the prevailing odds can escalate with the contract bond.`
      : `Market status is ${snapshot.status} (verdict: ${snapshot.verdict ?? "pending"}).`;
  const s3: AnnotatedSentence = {
    text: s3Text,
    confidenceE6: s3Conf,
    band: confidenceBand(s3Conf),
  };

  const sentences = [s1, s2, s3];
  const markdown = sentences.map((s) => s.text).join("\n\n");
  return { summary, markdown, sentences };
}

export class PageGeneratorService {
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

  async generateAndPublishPage(
    claim: ClaimView,
    market: MarketView,
    opts?: { submitOnChain?: boolean },
  ): Promise<GeneratedPageRecord> {
    const snapshot = buildMarketSnapshot(claim, market);
    const snapshotJson = JSON.stringify(snapshot);
    const prompt = buildPagePrompt(snapshot);
    const promptHash = sha256Hex(prompt);
    const model = this.aiClient.hasApiKey()
      ? this.config.pageModel
      : "local-template-fallback";
    const pageHash = computeDeterministicPageHash(snapshotJson, prompt, model);

    const existing = this.db.getLatestGeneratedPage(claim.id);
    if (existing && existing.page_hash === pageHash) {
      if (
        opts?.submitOnChain !== false &&
        claim.page_hash !== pageHash &&
        this.nearClient.isConfigured() &&
        this.nearClient.hasResolverSigner()
      ) {
        const txHash = await this.nearClient.setPageHash(claim.id, pageHash);
        existing.submitted_tx_hash = txHash;
      }
      return existing;
    }

    let summary = "";
    let markdown = "";
    let sentences: AnnotatedSentence[] = [];
    let signatureKind: string | null = null;
    let signatureValid = false;
    let chatId: string | null = null;
    let mode: GeneratedPageRecord["mode"] = "local-template-fallback";

    if (this.aiClient.hasApiKey()) {
      try {
        const res = await this.aiClient.chatCompletionWithAttestation({
          model: this.config.pageModel,
          messages: [
            {
              role: "system",
              content:
                "You write neutral, rigorous encyclopedia articles whose tone and epistemic hedging mirror prediction-market odds. Output strictly valid JSON.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.2,
          maxTokens: 900,
        });

        chatId = res.chatId;
        signatureKind = res.signatureKind;
        signatureValid = res.signatureValid;
        mode = "near-ai-cloud-tee";

        const parsed = extractJsonObject<{
          summary?: string;
          markdown?: string;
          sentences?: Array<{
            text?: string;
            confidenceE6?: number;
            citation?: string;
          }>;
        }>(res.content);

        if (parsed?.markdown && Array.isArray(parsed.sentences) && parsed.sentences.length > 0) {
          summary =
            typeof parsed.summary === "string" && parsed.summary.trim()
              ? parsed.summary.trim()
              : `Market-implied YES probability ${(snapshot.yes_price_e6 / 10_000).toFixed(1)}% (${market.status}).`;
          markdown = parsed.markdown.trim();
          sentences = parsed.sentences
            .filter((s) => typeof s.text === "string" && s.text.trim().length > 0)
            .map((s) => {
              const conf = Math.max(
                0,
                Math.min(1_000_000, Math.round(Number(s.confidenceE6 ?? snapshot.yes_price_e6))),
              );
              return {
                text: s.text!.trim(),
                confidenceE6: conf,
                band: confidenceBand(conf),
                citation:
                  typeof s.citation === "string" ? s.citation.trim() : undefined,
              };
            });
        }
      } catch {
        // Fall through to deterministic fallback below
      }
    }

    if (sentences.length === 0) {
      const synth = synthesizeTemplatePage(snapshot);
      summary = synth.summary;
      markdown = synth.markdown;
      sentences = synth.sentences;
      mode = "local-template-fallback";
    }

    let submittedTxHash: string | null = null;
    if (
      opts?.submitOnChain !== false &&
      claim.page_hash !== pageHash &&
      this.nearClient.isConfigured() &&
      this.nearClient.hasResolverSigner()
    ) {
      submittedTxHash = await this.nearClient.setPageHash(claim.id, pageHash);
    }

    const record: GeneratedPageRecord = {
      claim_id: claim.id,
      epoch: market.epoch,
      yes_price_e6: snapshot.yes_price_e6,
      no_price_e6: snapshot.no_price_e6,
      snapshot_json: snapshotJson,
      prompt,
      prompt_hash: promptHash,
      model,
      summary,
      markdown,
      sentences,
      page_hash: pageHash,
      signature_kind: signatureKind,
      signature_valid: signatureValid,
      chat_id: chatId,
      mode,
      submitted_tx_hash: submittedTxHash,
      created_at: Date.now(),
    };

    record.id = this.db.saveGeneratedPage(record);
    return record;
  }
}
