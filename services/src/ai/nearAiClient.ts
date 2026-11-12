import crypto from "node:crypto";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export interface AttestationCandidate {
  signing_address: string;
  signing_algo: string;
  request_nonce?: string;
  intel_quote?: string;
  report_data?: string;
}

export interface AttestationReportResponse {
  gateway_attestation?: AttestationCandidate & {
    event_log?: string;
    info?: unknown;
  };
  model_attestations?: AttestationCandidate[];
}

export interface SignatureResponse {
  text?: string;
  signature?: string;
  signature_kind?: string | null;
  signing_address?: string;
  signing_algo?: string;
  error_code?: string;
  message?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface VerifiedCompletionResult {
  model: string;
  chatId: string | null;
  content: string;
  rawRequest: string;
  rawResponse: string;
  requestHash: string;
  responseHash: string;
  attestationNonce: string;
  gatewayNonceMatched: boolean;
  modelAttestationPresent: boolean;
  signatureKind: string | null;
  signatureValid: boolean;
  signingAddress: string | null;
  signingAlgo: string | null;
  attestationSummary: {
    gatewaySigningAddress: string | null;
    matchedModelSigningAddresses: string[];
    verificationNote: string;
  };
}

export function sha256Hex(data: string | Uint8Array): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function decodeKeyOrSigBytes(encoded: string, expectedLen: number): Buffer | null {
  const cleaned = encoded.startsWith("0x") ? encoded.slice(2) : encoded;
  if (/^[0-9a-fA-F]+$/.test(cleaned) && cleaned.length === expectedLen * 2) {
    return Buffer.from(cleaned, "hex");
  }
  try {
    const b64 = Buffer.from(encoded, "base64");
    if (b64.length === expectedLen) return b64;
  } catch {
    // Not base64
  }
  return null;
}

export function verifyEd25519TextSignature(
  text: string,
  signatureEncoded: string,
  publicKeyEncoded: string,
): boolean {
  const pubBytes = decodeKeyOrSigBytes(publicKeyEncoded, 32);
  const sigBytes = decodeKeyOrSigBytes(signatureEncoded, 64);
  if (!pubBytes || !sigBytes) return false;

  const spki = Buffer.concat([ED25519_SPKI_PREFIX, pubBytes]);
  const keyObj = crypto.createPublicKey({ key: spki, format: "der", type: "spki" });
  return crypto.verify(null, Buffer.from(text, "utf8"), keyObj, sigBytes);
}

export function extractJsonObject<T = Record<string, unknown>>(text: string): T | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export class NearAiCloudClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: { baseUrl: string; apiKey: string; fetchImpl?: typeof fetch }) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  hasApiKey(): boolean {
    return this.apiKey.trim().length > 0;
  }

  async chatCompletionWithAttestation(params: {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    maxTokens?: number;
    signatureRetries?: number;
  }): Promise<VerifiedCompletionResult> {
    if (!this.hasApiKey()) {
      throw new Error("NEAR_AI_API_KEY is required for NEAR AI Cloud calls");
    }

    const nonce = crypto.randomBytes(32).toString("hex");
    const authHeaders: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "x-no-aliasing": "true",
    };

    // 1. Preflight attestation report (gateway + NEAR model candidates)
    let report: AttestationReportResponse = {};
    let verificationNote = "";
    try {
      const attUrl = new URL(`${this.baseUrl}/attestation/report`);
      attUrl.searchParams.set("model", params.model);
      attUrl.searchParams.set("provider", "near");
      attUrl.searchParams.set("include_tls_fingerprint", "false");
      attUrl.searchParams.set("signing_algo", "ed25519");
      attUrl.searchParams.set("nonce", nonce);

      const attRes = await this.fetchImpl(attUrl.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...authHeaders,
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (attRes.ok) {
        report = (await attRes.json()) as AttestationReportResponse;
      } else {
        verificationNote = `attestation HTTP ${attRes.status}`;
      }
    } catch (err) {
      verificationNote = `attestation fetch error: ${err instanceof Error ? err.message : String(err)}`;
    }

    const gatewayAtt = report.gateway_attestation;
    const modelAtts = Array.isArray(report.model_attestations)
      ? report.model_attestations
      : [];

    const gatewayNonceMatched =
      Boolean(gatewayAtt?.request_nonce) &&
      gatewayAtt!.request_nonce!.toLowerCase() === nonce.toLowerCase();
    const modelAttestationPresent = modelAtts.length > 0;

    // 2. Non-streaming completion with exact raw byte preservation
    const requestPayload = {
      model: params.model,
      messages: params.messages,
      stream: false,
      temperature: params.temperature ?? 0.2,
      max_tokens: params.maxTokens ?? 3000,
    };
    const rawRequest = JSON.stringify(requestPayload);
    const requestHash = sha256Hex(rawRequest);

    const chatRes = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "identity",
        ...authHeaders,
      },
      body: rawRequest,
      signal: AbortSignal.timeout(35_000),
    });

    const rawRespBuffer = Buffer.from(await chatRes.arrayBuffer());
    const rawResponse = rawRespBuffer.toString("utf8");
    const responseHash = sha256Hex(rawRespBuffer);

    if (!chatRes.ok) {
      throw new Error(
        `NEAR AI chat/completions failed (${chatRes.status}) for ${params.model}: ${rawResponse.slice(0, 300)}`,
      );
    }

    const parsedResp = JSON.parse(rawResponse) as {
      id?: string;
      choices?: Array<{ message?: { content?: string } }>;
    };
    const chatId = parsedResp.id ?? null;
    const content = parsedResp.choices?.[0]?.message?.content ?? "";

    // 3. Fetch & cryptographically verify Ed25519 response signature + preflight signer match
    let signatureKind: string | null = null;
    let signatureValid = false;
    let signingAddress: string | null = null;
    let signingAlgo: string | null = null;

    if (chatId) {
      const retries = params.signatureRetries ?? 2;
      let sigBody: SignatureResponse | null = null;
      for (let attempt = 0; attempt <= retries; attempt++) {
        const sigUrl = new URL(`${this.baseUrl}/signature/${encodeURIComponent(chatId)}`);
        sigUrl.searchParams.set("signing_algo", "ed25519");
        sigUrl.searchParams.set("model", params.model);
        const sigRes = await this.fetchImpl(sigUrl.toString(), {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          signal: AbortSignal.timeout(10_000),
        });
        if (sigRes.status === 404 && attempt < retries) {
          await new Promise((r) => setTimeout(r, 350));
          continue;
        }
        if (sigRes.ok) {
          sigBody = (await sigRes.json()) as SignatureResponse;
        } else {
          verificationNote = `signature HTTP ${sigRes.status}`;
        }
        break;
      }

      if (sigBody && !sigBody.error_code && sigBody.text && sigBody.signature && sigBody.signing_address) {
        signatureKind = sigBody.signature_kind ?? null;
        signingAddress = sigBody.signing_address;
        signingAlgo = sigBody.signing_algo ?? null;

        const algoOk = signingAlgo?.toLowerCase() === "ed25519";
        let expectedText: string | null = null;
        let preflightSignerMatched = false;

        if (signatureKind === "provider_tee") {
          expectedText = `${params.model}:${requestHash}:${responseHash}`;
          const matchingModels = modelAtts.filter(
            (m) =>
              m.signing_algo?.toLowerCase() === "ed25519" &&
              m.signing_address?.toLowerCase() === signingAddress!.toLowerCase() &&
              (!m.request_nonce || m.request_nonce.toLowerCase() === nonce.toLowerCase()),
          );
          preflightSignerMatched = matchingModels.length === 1;
          if (!preflightSignerMatched) {
            verificationNote = `provider_tee preflight match count=${matchingModels.length}`;
          }
        } else if (signatureKind === "gateway") {
          expectedText = `${requestHash}:${responseHash}`;
          preflightSignerMatched =
            gatewayNonceMatched &&
            gatewayAtt?.signing_algo?.toLowerCase() === "ed25519" &&
            gatewayAtt?.signing_address?.toLowerCase() === signingAddress.toLowerCase();
          if (!preflightSignerMatched) {
            verificationNote = "gateway preflight signer/nonce mismatch";
          }
        } else {
          verificationNote = `unrecognized signature_kind: ${String(signatureKind)}`;
        }

        if (algoOk && expectedText !== null && sigBody.text === expectedText) {
          const cryptoOk = verifyEd25519TextSignature(
            sigBody.text,
            sigBody.signature,
            signingAddress,
          );
          signatureValid = cryptoOk && preflightSignerMatched;
          if (cryptoOk && !preflightSignerMatched) {
            verificationNote = `${verificationNote} (Ed25519 valid, preflight binding unconfirmed)`;
          } else if (!cryptoOk) {
            verificationNote = "Ed25519 signature verification failed";
          } else {
            verificationNote = `Verified (${signatureKind}, Ed25519 + preflight nonce/signer; Intel TDX DCAP qvl offline skipped in JS MVP)`;
          }
        } else if (expectedText !== null && sigBody.text !== expectedText) {
          verificationNote = "signed payload hash mismatch";
        }
      }
    }

    return {
      model: params.model,
      chatId,
      content,
      rawRequest,
      rawResponse,
      requestHash,
      responseHash,
      attestationNonce: nonce,
      gatewayNonceMatched,
      modelAttestationPresent,
      signatureKind,
      signatureValid,
      signingAddress,
      signingAlgo,
      attestationSummary: {
        gatewaySigningAddress: gatewayAtt?.signing_address ?? null,
        matchedModelSigningAddresses: modelAtts.map((m) => m.signing_address),
        verificationNote,
      },
    };
  }
}

