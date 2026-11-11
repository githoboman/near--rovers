import { JsonRpcProvider } from "near-api-js";
import { ClaimView, ContractConfigView, MarketView, Outcome, PositionView } from "./types";

export const NEAR_NETWORK =
  (process.env.NEXT_PUBLIC_NEAR_NETWORK as "testnet" | "mainnet" | undefined) ?? "testnet";

export const NEAR_RPC_URL =
  process.env.NEXT_PUBLIC_NEAR_RPC_URL || "https://test.rpc.fastnear.com";

export const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID || "";

export const SERVICES_URL =
  process.env.NEXT_PUBLIC_SERVICES_URL || "http://localhost:3001";

export const GAS_CREATE_CLAIM = "80000000000000"; // 80 TGas
export const GAS_TRADE = "60000000000000"; // 60 TGas
export const GAS_SETTLE = "120000000000000"; // 120 TGas
export const GAS_REDEEM = "80000000000000"; // 80 TGas
/** Extra attached NEAR to cover one-time storage staking delta (excess is refunded by contract). */
export const ESCALATE_STORAGE_BUFFER_YOCTO = 25_000_000_000_000_000_000_000n; // 0.025 NEAR

export function isLiveContractConfigured(): boolean {
  return CONTRACT_ID.trim().length > 0;
}

export function createRpcProvider(): JsonRpcProvider {
  return new JsonRpcProvider({ url: NEAR_RPC_URL });
}

export async function viewContractMethod<T>(
  method: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  if (!CONTRACT_ID) {
    throw new Error("NEXT_PUBLIC_CONTRACT_ID is not configured");
  }
  const provider = createRpcProvider();
  const result = await provider.callFunction({
    contractId: CONTRACT_ID,
    method,
    args,
  });
  return result as T;
}

export async function fetchOnChainConfig(): Promise<ContractConfigView> {
  return viewContractMethod<ContractConfigView>("get_config", {});
}

export async function fetchOnChainClaimsCount(): Promise<number> {
  return viewContractMethod<number>("get_claims_count", {});
}

export async function fetchOnChainClaims(fromIndex = 0, limit = 50): Promise<ClaimView[]> {
  return viewContractMethod<ClaimView[]>("get_claims", {
    from_index: fromIndex,
    limit,
  });
}

export async function fetchOnChainMarket(
  claimId: number,
  epoch?: number
): Promise<MarketView | null> {
  return viewContractMethod<MarketView | null>("get_market", {
    claim_id: claimId,
    ...(epoch !== undefined ? { epoch } : {}),
  });
}

export async function fetchOnChainPosition(
  claimId: number,
  accountId: string,
  epoch?: number
): Promise<PositionView> {
  return viewContractMethod<PositionView>("get_position", {
    claim_id: claimId,
    account_id: accountId,
    ...(epoch !== undefined ? { epoch } : {}),
  });
}

export async function fetchAccountBalanceYocto(accountId: string): Promise<string> {
  const provider = createRpcProvider();
  const account = await provider.viewAccount({ accountId });
  return String(account.amount ?? "0");
}

export interface WalletActionSpec {
  methodName: string;
  args: Record<string, unknown>;
  gas?: string;
  deposit?: string;
}

export function buildCreateClaimTx(params: {
  text: string;
  evidenceUris: string[];
  category: string;
  epochLengthNs: string;
  depositYocto: string;
}): WalletActionSpec {
  return {
    methodName: "create_claim",
    args: {
      text: params.text,
      evidence_uris: params.evidenceUris,
      category: params.category,
      epoch_length: params.epochLengthNs,
    },
    gas: GAS_CREATE_CLAIM,
    deposit: params.depositYocto,
  };
}

export function buildBuyTx(params: {
  claimId: number;
  outcome: Outcome;
  minShares: string;
  depositYocto: string;
}): WalletActionSpec {
  return {
    methodName: "buy",
    args: {
      claim_id: params.claimId,
      outcome: params.outcome,
      min_shares: params.minShares,
    },
    gas: GAS_TRADE,
    deposit: params.depositYocto,
  };
}

export function buildSellTx(params: {
  claimId: number;
  outcome: Outcome;
  shares: string;
  minCollateralOut: string;
}): WalletActionSpec {
  return {
    methodName: "sell",
    args: {
      claim_id: params.claimId,
      outcome: params.outcome,
      shares: params.shares,
      min_collateral_out: params.minCollateralOut,
    },
    gas: GAS_REDEEM,
    deposit: "0",
  };
}

export function buildEscalateTx(params: {
  claimId: number;
  assertedOutcome?: Outcome;
  bondYocto: string;
}): WalletActionSpec {
  return {
    methodName: "escalate",
    args: {
      claim_id: params.claimId,
      ...(params.assertedOutcome ? { asserted_outcome: params.assertedOutcome } : {}),
    },
    gas: GAS_TRADE,
    deposit: params.bondYocto,
  };
}

export function buildSettleTx(claimId: number): WalletActionSpec {
  return {
    methodName: "settle",
    args: { claim_id: claimId },
    gas: GAS_SETTLE,
    deposit: "0",
  };
}

export function buildRedeemTx(claimId: number, epoch?: number): WalletActionSpec {
  return {
    methodName: "redeem",
    args: {
      claim_id: claimId,
      ...(epoch !== undefined ? { epoch } : {}),
    },
    gas: GAS_REDEEM,
    deposit: "0",
  };
}

