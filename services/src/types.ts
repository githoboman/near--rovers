export type Outcome = "Yes" | "No";
export type Verdict = "True" | "False" | "Unresolved";
export type ClaimStatus = "Open" | "Escalated" | "Ruled" | "Settled";
export type MarketStatus = "Open" | "Escalated" | "Ruled" | "Settled";

export interface ClaimView {
  id: number;
  creator: string;
  text: string;
  text_hash: string;
  evidence_uris: string[];
  category: string;
  epoch_length: string; // U64 nanosecond duration
  current_epoch: number;
  status: ClaimStatus;
  page_hash: string | null;
  page_hash_updated_at: string | null;
  created_at: string; // U64 nanosecond timestamp
}

export interface MarketView {
  claim_id: number;
  epoch: number;
  yes_reserve: string; // U128
  no_reserve: string; // U128
  collateral_vault: string; // U128
  outstanding_yes: string; // U128
  outstanding_no: string; // U128
  fee_pool: string; // U128
  fee_bps: number;
  opened_at: string; // U64
  epoch_end: string; // U64
  status: MarketStatus;
  yes_price_e6: number;
  no_price_e6: number;
  challenger: string | null;
  challenger_side: Outcome | null;
  challenger_bond: string; // U128
  counter_challenger: string | null;
  counter_side: Outcome | null;
  counter_bond: string; // U128
  escalated_at: string | null; // U64
  snap_yes_price_e6: number | null;
  verdict: Verdict | null;
  attestation_hash: string | null;
  ruled_at: string | null; // U64
  challenge_deadline: string | null; // U64
  settled_at: string | null; // U64
  retained_liquidity: string; // U128
}

export interface PriceQuote {
  claim_id: number;
  epoch: number;
  yes_price_e6: number;
  no_price_e6: number;
  yes_bps: number;
  no_bps: number;
  yes_reserve: string;
  no_reserve: string;
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

export interface PriceHistoryPoint {
  id?: number;
  claim_id: number;
  epoch: number;
  timestamp_ms: number;
  yes_price_e6: number;
  no_price_e6: number;
  yes_reserve: string;
  no_reserve: string;
  fee_pool: string;
  trigger_event: string;
}

export interface AnnotatedSentence {
  text: string;
  confidenceE6: number;
  band: "high" | "contested" | "low";
  citation?: string;
}

export interface JuryModelVoteRecord {
  model: string;
  vote: Verdict | "Abstain";
  confidence: number;
  reasoning: string;
  rawRequest: string;
  rawResponse: string;
  requestHash: string;
  responseHash: string;
  chatId: string | null;
  signatureKind: string | null;
  signatureValid: boolean;
  signingAddress: string | null;
  signingAlgo: string | null;
  attestationNonce: string | null;
  gatewayNonceMatched: boolean;
  modelAttestationPresent: boolean;
  error: string | null;
}

export interface JuryRulingRecord {
  id?: number;
  claim_id: number;
  epoch: number;
  ruling_round?: number;
  verdict: Verdict;
  supermajority_count: number;
  total_models: number;
  required_majority: number;
  evidence_packet_json: string;
  evidence_hash: string;
  attestation_bundle_json: string;
  attestation_hash: string;
  submitted_tx_hash: string | null;
  mode: "near-ai-cloud-tee" | "fallback-unverified";
  created_at: number;
  votes: JuryModelVoteRecord[];
}

export interface GeneratedPageRecord {
  id?: number;
  claim_id: number;
  epoch: number;
  yes_price_e6: number;
  no_price_e6: number;
  snapshot_json: string;
  prompt: string;
  prompt_hash: string;
  model: string;
  summary: string;
  markdown: string;
  sentences: AnnotatedSentence[];
  page_hash: string;
  signature_kind: string | null;
  signature_valid: boolean;
  chat_id: string | null;
  mode: "near-ai-cloud-tee" | "local-template-fallback";
  submitted_tx_hash: string | null;
  created_at: number;
}
