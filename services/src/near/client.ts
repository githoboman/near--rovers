import {
  Account,
  JsonRpcProvider,
  nearToYocto,
  teraToGas,
  type KeyPairString,
} from "near-api-js";
import type { PerpetuaServiceConfig } from "../config.ts";
import type {
  ClaimView,
  ContractConfigView,
  MarketView,
  Outcome,
  PriceQuote,
  Verdict,
} from "../types.ts";

export class PerpetuaNearClient {
  private readonly provider: JsonRpcProvider;
  private readonly contractId: string;
  private readonly resolverAccount: Account | null;

  constructor(config: PerpetuaServiceConfig) {
    this.provider = new JsonRpcProvider({ url: config.nearRpcUrl });
    this.contractId = config.contractId;

    if (config.resolverAccountId && config.resolverPrivateKey) {
      this.resolverAccount = new Account(
        config.resolverAccountId,
        this.provider,
        config.resolverPrivateKey as KeyPairString,
      );
    } else {
      this.resolverAccount = null;
    }
  }

  isConfigured(): boolean {
    return this.contractId.trim().length > 0;
  }

  hasResolverSigner(): boolean {
    return this.resolverAccount !== null;
  }

  private assertContract(): string {
    if (!this.contractId) {
      throw new Error("CONTRACT_ID is not configured");
    }
    return this.contractId;
  }

  private assertSigner(): Account {
    if (!this.resolverAccount) {
      throw new Error(
        "NEAR_RESOLVER_ACCOUNT_ID and NEAR_RESOLVER_PRIVATE_KEY must be set to send signed transactions",
      );
    }
    return this.resolverAccount;
  }

  async getConfig(): Promise<ContractConfigView> {
    const contractId = this.assertContract();
    return this.provider.callFunction({
      contractId,
      method: "get_config",
      args: {},
    }) as Promise<ContractConfigView>;
  }

  async getClaimsCount(): Promise<number> {
    const contractId = this.assertContract();
    return this.provider.callFunction({
      contractId,
      method: "get_claims_count",
      args: {},
    }) as Promise<number>;
  }

  async getClaims(fromIndex: number, limit: number): Promise<ClaimView[]> {
    const contractId = this.assertContract();
    return this.provider.callFunction({
      contractId,
      method: "get_claims",
      args: { from_index: fromIndex, limit },
    }) as Promise<ClaimView[]>;
  }

  async getClaim(claimId: number): Promise<ClaimView | null> {
    const contractId = this.assertContract();
    return this.provider.callFunction({
      contractId,
      method: "get_claim",
      args: { claim_id: claimId },
    }) as Promise<ClaimView | null>;
  }

  async getMarket(claimId: number, epoch?: number): Promise<MarketView | null> {
    const contractId = this.assertContract();
    return this.provider.callFunction({
      contractId,
      method: "get_market",
      args: epoch !== undefined ? { claim_id: claimId, epoch } : { claim_id: claimId },
    }) as Promise<MarketView | null>;
  }

  async getPosition(
    claimId: number,
    accountId: string,
    epoch?: number,
  ): Promise<{ yes_shares: string; no_shares: string; claim_id: number; epoch: number; account_id: string }> {
    const contractId = this.assertContract();
    return this.provider.callFunction({
      contractId,
      method: "get_position",
      args:
        epoch !== undefined
          ? { claim_id: claimId, account_id: accountId, epoch }
          : { claim_id: claimId, account_id: accountId },
    }) as Promise<{
      yes_shares: string;
      no_shares: string;
      claim_id: number;
      epoch: number;
      account_id: string;
    }>;
  }

  async getPrice(claimId: number, epoch?: number): Promise<PriceQuote> {
    const contractId = this.assertContract();
    return this.provider.callFunction({
      contractId,
      method: "get_price",
      args: epoch !== undefined ? { claim_id: claimId, epoch } : { claim_id: claimId },
    }) as Promise<PriceQuote>;
  }

  async createClaim(params: {
    text: string;
    evidence_uris: string[];
    category: string;
    epoch_length_ns: string;
    depositNear?: string;
  }): Promise<string> {
    const contractId = this.assertContract();
    const account = this.assertSigner();
    const depositStr = assertDecimalString(params.depositNear ?? "2.5");
    const outcome = await account.callFunctionRaw({
      contractId,
      methodName: "create_claim",
      args: {
        text: params.text,
        evidence_uris: params.evidence_uris,
        category: params.category,
        epoch_length: params.epoch_length_ns,
      },
      gas: teraToGas("60"),
      deposit: nearToYocto(depositStr),
    });
    return extractTxHash(outcome);
  }

  async buy(params: {
    claimId: number;
    outcome: Outcome;
    minShares?: string;
    depositNear: string;
  }): Promise<string> {
    const contractId = this.assertContract();
    const account = this.assertSigner();
    const depositStr = assertDecimalString(params.depositNear);
    const outcome = await account.callFunctionRaw({
      contractId,
      methodName: "buy",
      args: {
        claim_id: params.claimId,
        outcome: params.outcome,
        min_shares: params.minShares ?? "1",
      },
      gas: teraToGas("40"),
      deposit: nearToYocto(depositStr),
    });
    return extractTxHash(outcome);
  }

  async escalate(params: {
    claimId: number;
    assertedOutcome?: Outcome;
    depositYocto: string;
  }): Promise<string> {
    const contractId = this.assertContract();
    const account = this.assertSigner();
    const outcome = await account.callFunctionRaw({
      contractId,
      methodName: "escalate",
      args: params.assertedOutcome
        ? { claim_id: params.claimId, asserted_outcome: params.assertedOutcome }
        : { claim_id: params.claimId },
      gas: teraToGas("50"),
      deposit: BigInt(params.depositYocto),
    });
    return extractTxHash(outcome);
  }

  async submitRuling(params: {
    claimId: number;
    verdict: Verdict;
    attestationHash: string;
  }): Promise<string> {
    const contractId = this.assertContract();
    const account = this.assertSigner();
    const outcome = await account.callFunctionRaw({
      contractId,
      methodName: "submit_ruling",
      args: {
        claim_id: params.claimId,
        verdict: params.verdict,
        attestation_hash: params.attestationHash,
      },
      gas: teraToGas("40"),
      deposit: 0n,
    });
    return extractTxHash(outcome);
  }

  async settle(claimId: number): Promise<string> {
    const contractId = this.assertContract();
    const account = this.assertSigner();
    const outcome = await account.callFunctionRaw({
      contractId,
      methodName: "settle",
      args: { claim_id: claimId },
      gas: teraToGas("120"),
      deposit: 0n,
    });
    return extractTxHash(outcome);
  }

  async redeem(claimId: number, epoch?: number): Promise<string> {
    const contractId = this.assertContract();
    const account = this.assertSigner();
    const outcome = await account.callFunctionRaw({
      contractId,
      methodName: "redeem",
      args: epoch !== undefined ? { claim_id: claimId, epoch } : { claim_id: claimId },
      gas: teraToGas("80"),
      deposit: 0n,
    });
    return extractTxHash(outcome);
  }

  async setPageHash(claimId: number, hash: string): Promise<string> {
    const contractId = this.assertContract();
    const account = this.assertSigner();
    const outcome = await account.callFunctionRaw({
      contractId,
      methodName: "set_page_hash",
      args: { claim_id: claimId, hash },
      gas: teraToGas("30"),
      deposit: 0n,
    });
    return extractTxHash(outcome);
  }
}

function assertDecimalString(value: string): `${number}` {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid NEAR decimal amount: "${value}"`);
  }
  return trimmed as `${number}`;
}

function extractTxHash(outcome: unknown): string {
  if (outcome && typeof outcome === "object") {
    const rec = outcome as Record<string, unknown>;
    if (rec.transaction_outcome && typeof rec.transaction_outcome === "object") {
      const id = (rec.transaction_outcome as Record<string, unknown>).id;
      if (typeof id === "string") return id;
    }
    if (rec.transaction && typeof rec.transaction === "object") {
      const hash = (rec.transaction as Record<string, unknown>).hash;
      if (typeof hash === "string") return hash;
    }
  }
  return "submitted";
}
