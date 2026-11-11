export type Outcome = "Yes" | "No";
export type Verdict = "True" | "False" | "Unresolved";
export type ClaimStatus = "Open" | "Escalated" | "Ruled" | "Settled";
export type MarketStatus = "Open" | "Escalated" | "Ruled" | "Settled";

export type ClaimCategory = "audit_status" | "authorship" | "tvl";

export interface ClaimView {
  id: number;
  creator: string;
  text: string;
  text_hash: string;
  evidence_uris: string[];
  category: string;
  epoch_length: string;
  current_epoch: number;
  status: ClaimStatus;
  page_hash: string | null;
  page_hash_updated_at: string | null;
  created_at: string;
}

export interface MarketView {
  claim_id: number;
  epoch: number;
  yes_reserve: string;
  no_reserve: string;
  collateral_vault: string;
  outstanding_yes: string;
  outstanding_no: string;
  fee_pool: string;
  fee_bps: number;
  opened_at: string;
  epoch_end: string;
  status: MarketStatus;
  yes_price_e6: number;
  no_price_e6: number;
  challenger: string | null;
  challenger_side: Outcome | null;
  challenger_bond: string;
  counter_challenger: string | null;
  counter_side: Outcome | null;
  counter_bond: string;
  escalated_at: string | null;
  snap_yes_price_e6: number | null;
  verdict: Verdict | null;
  attestation_hash: string | null;
  ruled_at: string | null;
  challenge_deadline: string | null;
  settled_at: string | null;
  retained_liquidity: string;
}

export interface PositionView {
  claim_id: number;
  epoch: number;
  account_id: string;
  yes_shares: string;
  no_shares: string;
}

export interface PricePoint {
  timestampMs: number;
  yesPriceE6: number;
  eventLabel?: string;
  trader?: string;
}

export interface ArticleSentence {
  text: string;
  confidenceE6: number;
  band: "high" | "contested" | "low";
  citation?: string;
}

export interface GeneratedArticle {
  claimId: number;
  epoch: number;
  title: string;
  summary: string;
  sentences: ArticleSentence[];
  markdown: string;
  model: string;
  promptHash: string;
  snapshotPriceE6: number;
  generatedAtMs: number;
  pageHash: string;
}

export interface JuryModelVote {
  model: string;
  verdict: Verdict;
  confidence: number;
  rationale: string;
  signatureKind?: "provider_tee" | "gateway";
  signingAddress?: string;
}

export interface JuryRulingRecord {
  claimId: number;
  epoch: number;
  finalVerdict: Verdict;
  attestationHash: string;
  modelVotes: JuryModelVote[];
  createdAtMs: number;
}

export interface ContractConfigView {
  owner_id: string;
  resolver_account_id: string;
  collateral_asset: "NativeNear" | { Nep141: { token_id: string } };
  fee_bps: number;
  escalation_bond: string;
  challenge_window_ns: string;
  jury_cost_fund: string;
  next_claim_id: number;
}

export interface ClaimBundle {
  claim: ClaimView;
  market: MarketView;
  history: PricePoint[];
  article: GeneratedArticle;
  ruling: JuryRulingRecord | null;
}

