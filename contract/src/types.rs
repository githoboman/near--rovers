use near_sdk::json_types::{U64, U128};
use near_sdk::{AccountId, near};

/// Basis points denominator (100% = 10,000 bps).
pub const BPS_DENOMINATOR: u128 = 10_000;
/// Fixed-point probability scale (1.0 = 1,000,000).
pub const PRICE_SCALE: u128 = 1_000_000;
/// Maximum allowed trading fee in basis points (10%).
pub const MAX_FEE_BPS: u16 = 1_000;
/// Share of market fee pool awarded to winning challenger(s) on settlement (50%).
pub const CHALLENGER_REWARD_BPS: u128 = 5_000;
/// Minimum reserve floor per side so k = x*y never collapses to zero.
pub const MIN_RESERVE: u128 = 1_000_000;
/// Minimum seed liquidity required to open a new market (0.01 NEAR).
pub const MIN_SEED_LIQUIDITY: u128 = 10_000_000_000_000_000_000_000;
/// Default trading fee (100 bps = 1%).
pub const DEFAULT_FEE_BPS: u16 = 100;
/// Default escalation bond (0.5 NEAR).
pub const DEFAULT_ESCALATION_BOND: u128 = 500_000_000_000_000_000_000_000;
/// Default challenge window after a ruling is submitted (5 minutes in ns).
pub const DEFAULT_CHALLENGE_WINDOW_NS: u64 = 300_000_000_000;

/// Bounds to prevent unbounded storage growth attacks.
pub const MAX_CLAIM_TEXT_LEN: usize = 1024;
pub const MAX_CATEGORY_LEN: usize = 64;
pub const MAX_EVIDENCE_URIS: usize = 10;
pub const MAX_URI_LEN: usize = 512;
pub const MAX_HASH_LEN: usize = 128;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[near(serializers = [json, borsh])]
pub enum Outcome {
    Yes,
    No,
}

impl Outcome {
    pub fn opposite(self) -> Self {
        match self {
            Outcome::Yes => Outcome::No,
            Outcome::No => Outcome::Yes,
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[near(serializers = [json, borsh])]
pub enum Verdict {
    True,
    False,
    Unresolved,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[near(serializers = [json, borsh])]
pub enum ClaimStatus {
    Open,
    Escalated,
    Ruled,
    Settled,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[near(serializers = [json, borsh])]
pub enum MarketStatus {
    Open,
    Escalated,
    Ruled,
    Settled,
}

/// Collateral abstraction allowing native NEAR now and NEP-141 later.
#[derive(Clone, PartialEq, Eq, Debug)]
#[near(serializers = [json, borsh])]
pub enum CollateralAsset {
    NativeNear,
    Nep141 { token_id: AccountId },
}

#[derive(Clone, Debug)]
#[near(serializers = [borsh])]
pub struct Claim {
    pub id: u64,
    pub creator: AccountId,
    pub text: String,
    pub text_hash: String,
    pub evidence_uris: Vec<String>,
    pub category: String,
    pub epoch_length: u64,
    pub current_epoch: u64,
    pub status: ClaimStatus,
    pub page_hash: Option<String>,
    pub page_hash_updated_at: Option<u64>,
    pub created_at: u64,
}

#[derive(Clone, Debug)]
#[near(serializers = [borsh])]
pub struct Market {
    pub claim_id: u64,
    pub epoch: u64,
    pub yes_reserve: u128,
    pub no_reserve: u128,
    /// Exact collateral vault backing all outstanding shares + pool reserves
    /// while Open/Escalated/Ruled, and backing only remaining redemptions after Settled.
    pub collateral_vault: u128,
    pub outstanding_yes: u128,
    pub outstanding_no: u128,
    /// Accumulated trading fees (in collateral units), segregated from `collateral_vault`.
    pub fee_pool: u128,
    pub fee_bps: u16,
    pub opened_at: u64,
    pub epoch_end: u64,
    pub status: MarketStatus,
    pub challenger: Option<AccountId>,
    pub challenger_side: Option<Outcome>,
    pub challenger_bond: u128,
    pub counter_challenger: Option<AccountId>,
    pub counter_side: Option<Outcome>,
    pub counter_bond: u128,
    pub escalated_at: Option<u64>,
    pub snap_yes_price_e6: Option<u32>,
    pub verdict: Option<Verdict>,
    pub attestation_hash: Option<String>,
    pub ruled_at: Option<u64>,
    pub challenge_deadline: Option<u64>,
    pub settled_at: Option<u64>,
    pub retained_liquidity: u128,
}

#[derive(Clone, Copy, Default, Debug)]
#[near(serializers = [borsh])]
pub struct Position {
    pub yes_shares: u128,
    pub no_shares: u128,
}

#[derive(Clone, Debug)]
#[near(serializers = [json])]
pub struct ClaimView {
    pub id: u64,
    pub creator: AccountId,
    pub text: String,
    pub text_hash: String,
    pub evidence_uris: Vec<String>,
    pub category: String,
    pub epoch_length: U64,
    pub current_epoch: u64,
    pub status: ClaimStatus,
    pub page_hash: Option<String>,
    pub page_hash_updated_at: Option<U64>,
    pub created_at: U64,
}

impl From<&Claim> for ClaimView {
    fn from(c: &Claim) -> Self {
        Self {
            id: c.id,
            creator: c.creator.clone(),
            text: c.text.clone(),
            text_hash: c.text_hash.clone(),
            evidence_uris: c.evidence_uris.clone(),
            category: c.category.clone(),
            epoch_length: U64(c.epoch_length),
            current_epoch: c.current_epoch,
            status: c.status,
            page_hash: c.page_hash.clone(),
            page_hash_updated_at: c.page_hash_updated_at.map(U64),
            created_at: U64(c.created_at),
        }
    }
}

#[derive(Clone, Debug)]
#[near(serializers = [json])]
pub struct MarketView {
    pub claim_id: u64,
    pub epoch: u64,
    pub yes_reserve: U128,
    pub no_reserve: U128,
    pub collateral_vault: U128,
    pub outstanding_yes: U128,
    pub outstanding_no: U128,
    pub fee_pool: U128,
    pub fee_bps: u16,
    pub opened_at: U64,
    pub epoch_end: U64,
    pub status: MarketStatus,
    pub yes_price_e6: u32,
    pub no_price_e6: u32,
    pub challenger: Option<AccountId>,
    pub challenger_side: Option<Outcome>,
    pub challenger_bond: U128,
    pub counter_challenger: Option<AccountId>,
    pub counter_side: Option<Outcome>,
    pub counter_bond: U128,
    pub escalated_at: Option<U64>,
    pub snap_yes_price_e6: Option<u32>,
    pub verdict: Option<Verdict>,
    pub attestation_hash: Option<String>,
    pub ruled_at: Option<U64>,
    pub challenge_deadline: Option<U64>,
    pub settled_at: Option<U64>,
    pub retained_liquidity: U128,
}

#[derive(Clone, Debug)]
#[near(serializers = [json])]
pub struct PositionView {
    pub claim_id: u64,
    pub epoch: u64,
    pub account_id: AccountId,
    pub yes_shares: U128,
    pub no_shares: U128,
}

#[derive(Clone, Debug)]
#[near(serializers = [json])]
pub struct PriceQuote {
    pub claim_id: u64,
    pub epoch: u64,
    pub yes_price_e6: u32,
    pub no_price_e6: u32,
    pub yes_bps: u16,
    pub no_bps: u16,
    pub yes_reserve: U128,
    pub no_reserve: U128,
}

#[derive(Clone, Debug)]
#[near(serializers = [json])]
pub struct QuoteBuyResult {
    pub shares_out: U128,
    pub fee: U128,
    pub post_yes_price_e6: u32,
    pub post_no_price_e6: u32,
}

#[derive(Clone, Debug)]
#[near(serializers = [json])]
pub struct QuoteSellResult {
    pub collateral_out: U128,
    pub fee: U128,
    pub post_yes_price_e6: u32,
    pub post_no_price_e6: u32,
}

#[derive(Clone, Debug)]
#[near(serializers = [json])]
pub struct ContractConfigView {
    pub owner_id: AccountId,
    pub resolver_account_id: AccountId,
    pub collateral_asset: CollateralAsset,
    pub fee_bps: u16,
    pub escalation_bond: U128,
    pub challenge_window_ns: U64,
    pub jury_cost_fund: U128,
    pub next_claim_id: u64,
}

