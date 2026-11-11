import type { PerpetuaServiceConfig } from "../config.ts";

export interface OneClickToken {
  assetId: string;
  decimals: number;
  blockchain: string;
  symbol: string;
  price?: number;
  priceUpdatedAt?: string;
  contractAddress?: string | null;
}

export interface OneClickQuotePreviewRequest {
  originAsset: string;
  destinationAsset?: string;
  amount: string;
  recipient: string;
  refundTo: string;
  slippageTolerance?: number;
  swapType?: "EXACT_INPUT" | "EXACT_OUTPUT";
}

export class OneClickIntentsClient {
  private readonly baseUrl: string;
  private readonly jwt: string;
  private readonly networkId: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: PerpetuaServiceConfig, fetchImpl: typeof fetch = fetch) {
    this.baseUrl = config.oneClickApiUrl.replace(/\/+$/, "");
    this.jwt = config.oneClickJwt;
    this.networkId = config.networkId;
    this.fetchImpl = fetchImpl;
  }

  async listTokens(): Promise<{ tokens: OneClickToken[]; testnetNotice: string | null }> {
    const res = await this.fetchImpl(`${this.baseUrl}/v0/tokens`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`1Click /v0/tokens failed (${res.status})`);
    }
    const tokens = (await res.json()) as OneClickToken[];
    return {
      tokens,
      testnetNotice:
        this.networkId === "testnet"
          ? "NEAR Intents 1Click API runs on mainnet networks only (no testnet deployment). Quotes are restricted to dry=true previews."
          : null,
    };
  }

  async previewQuote(req: OneClickQuotePreviewRequest): Promise<unknown> {
    // Enforce dry=true whenever running in testnet mode so no real funds deposit address is issued.
    const dryOnly = true;
    const deadline = new Date(Date.now() + 3 * 60 * 1000).toISOString();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (this.jwt) {
      headers.Authorization = `Bearer ${this.jwt}`;
    }

    const res = await this.fetchImpl(`${this.baseUrl}/v0/quote`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        dry: dryOnly,
        swapType: req.swapType ?? "EXACT_INPUT",
        slippageTolerance: req.slippageTolerance ?? 100,
        originAsset: req.originAsset,
        depositType: "ORIGIN_CHAIN",
        destinationAsset: req.destinationAsset ?? "nep141:wrap.near",
        amount: req.amount,
        recipient: req.recipient,
        recipientType: "DESTINATION_CHAIN",
        refundTo: req.refundTo,
        refundType: "ORIGIN_CHAIN",
        deadline,
      }),
    });

    const data = (await res.json()) as unknown;
    if (!res.ok) {
      throw new Error(`1Click /v0/quote failed (${res.status}): ${JSON.stringify(data)}`);
    }
    return {
      dryOnly,
      testnetNotice:
        this.networkId === "testnet"
          ? "Preview quote (dry=true). Real cross-chain settlement requires mainnet deployment."
          : null,
      quote: data,
    };
  }
}

