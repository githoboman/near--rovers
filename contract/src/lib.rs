pub mod amm;
pub mod collateral;
pub mod events;
pub mod market;
pub mod types;

#[cfg(test)]
mod tests;

use near_sdk::json_types::{U64, U128};
use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{AccountId, BorshStorageKey, PanicOnDefault, Promise, PromiseOrValue, env, near, require};

use crate::collateral::CollateralAdapter;
use crate::events::PerpetuaEvent;
use crate::types::{
    Claim, ClaimStatus, ClaimView, CollateralAsset, ContractConfigView, DEFAULT_CHALLENGE_WINDOW_NS,
    DEFAULT_ESCALATION_BOND, DEFAULT_FEE_BPS, MAX_FEE_BPS, MIN_SEED_LIQUIDITY, Market, MarketView,
    Outcome, Position, PositionView, PriceQuote, QuoteBuyResult, QuoteSellResult, Verdict,
};

#[derive(BorshStorageKey)]
#[near(serializers = [borsh])]
enum StorageKey {
    Claims,
    Markets,
    Positions,
    ClaimableRefunds,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    pub(crate) owner_id: AccountId,
    pub(crate) resolver_account_id: AccountId,
    pub(crate) collateral_asset: CollateralAsset,
    pub(crate) fee_bps: u16,
    pub(crate) escalation_bond: u128,
    pub(crate) challenge_window_ns: u64,
    pub(crate) jury_cost_fund: u128,
    pub(crate) next_claim_id: u64,
    pub(crate) claims: IterableMap<u64, Claim>,
    pub(crate) markets: LookupMap<(u64, u64), Market>,
    pub(crate) positions: LookupMap<(u64, u64, AccountId), Position>,
    pub(crate) claimable_refunds: LookupMap<AccountId, u128>,
}

#[near]
impl Contract {
    #[init]
    pub fn new(
        owner_id: AccountId,
        resolver_account_id: AccountId,
        fee_bps: Option<u16>,
        escalation_bond: Option<U128>,
        challenge_window_ns: Option<U64>,
    ) -> Self {
        let fee = fee_bps.unwrap_or(DEFAULT_FEE_BPS);
        require!(fee <= MAX_FEE_BPS, "fee_bps exceeds MAX_FEE_BPS");
        let bond = escalation_bond.map(|b| b.0).unwrap_or(DEFAULT_ESCALATION_BOND);
        require!(bond > 0, "escalation_bond must be positive");
        let challenge_window = challenge_window_ns
            .map(|w| w.0)
            .unwrap_or(DEFAULT_CHALLENGE_WINDOW_NS);

        Self {
            owner_id,
            resolver_account_id,
            collateral_asset: CollateralAsset::NativeNear,
            fee_bps: fee,
            escalation_bond: bond,
            challenge_window_ns: challenge_window,
            jury_cost_fund: 0,
            next_claim_id: 1,
            claims: IterableMap::new(StorageKey::Claims),
            markets: LookupMap::new(StorageKey::Markets),
            positions: LookupMap::new(StorageKey::Positions),
            claimable_refunds: LookupMap::new(StorageKey::ClaimableRefunds),
        }
    }

    // ---- Core Market & Claim Methods ----

    #[payable]
    pub fn create_claim(
        &mut self,
        text: String,
        evidence_uris: Vec<String>,
        category: String,
        epoch_length: U64,
    ) -> u64 {
        self.create_claim_internal(text, evidence_uris, category, epoch_length.0)
    }

    #[payable]
    pub fn buy(&mut self, claim_id: u64, outcome: Outcome, min_shares: U128) -> U128 {
        U128(self.buy_internal(claim_id, outcome, min_shares.0))
    }

    pub fn sell(
        &mut self,
        claim_id: u64,
        outcome: Outcome,
        shares: U128,
        min_collateral_out: U128,
    ) -> Promise {
        self.sell_internal(claim_id, outcome, shares.0, min_collateral_out.0)
    }

    pub fn get_price(&self, claim_id: u64, epoch: Option<u64>) -> PriceQuote {
        self.get_price_internal(claim_id, epoch)
    }

    #[payable]
    pub fn escalate(&mut self, claim_id: u64, asserted_outcome: Option<Outcome>) {
        self.escalate_internal(claim_id, asserted_outcome);
    }

    pub fn submit_ruling(&mut self, claim_id: u64, verdict: Verdict, attestation_hash: String) {
        self.submit_ruling_internal(claim_id, verdict, attestation_hash);
    }

    #[payable]
    pub fn challenge_ruling(&mut self, claim_id: u64, asserted_outcome: Option<Outcome>) {
        self.challenge_ruling_internal(claim_id, asserted_outcome);
    }

    pub fn settle(&mut self, claim_id: u64) -> PromiseOrValue<()> {
        self.settle_internal(claim_id)
    }

    pub fn advance_epoch(&mut self, claim_id: u64) -> u64 {
        self.advance_epoch_internal(claim_id)
    }

    pub fn redeem(&mut self, claim_id: u64, epoch: Option<u64>) -> Promise {
        self.redeem_internal(claim_id, epoch)
    }

    pub fn set_page_hash(&mut self, claim_id: u64, hash: String) {
        self.set_page_hash_internal(claim_id, hash);
    }

    #[payable]
    pub fn seed_next_epoch(&mut self, claim_id: u64) -> u64 {
        let storage_before = env::storage_usage();
        let claim = self.claims.get(&claim_id).expect("Claim not found").clone();
        require!(
            claim.status == ClaimStatus::Settled,
            "Only a Settled claim without an active epoch can be seeded"
        );
        let next_epoch = claim.current_epoch.checked_add(1).expect("Epoch overflow");
        let now = env::block_timestamp();
        let placeholder = self.build_fresh_market(claim_id, next_epoch, 0, now, claim.epoch_length);
        self.markets.insert((claim_id, next_epoch), placeholder);

        let storage_cost = self.compute_storage_cost(storage_before);
        let seed = CollateralAdapter::take_deposit(&self.collateral_asset, storage_cost);
        require!(seed >= MIN_SEED_LIQUIDITY, "Seed below minimum liquidity");

        let m = self
            .markets
            .get_mut(&(claim_id, next_epoch))
            .expect("Market must exist");
        m.yes_reserve = seed;
        m.no_reserve = seed;
        m.collateral_vault = seed;

        let claim_mut = self.claims.get_mut(&claim_id).expect("Claim must exist");
        claim_mut.current_epoch = next_epoch;
        claim_mut.status = ClaimStatus::Open;
        next_epoch
    }

    // ---- Safe Async Callback & Refund Recovery ----

    /// Non-panicking private callback: if a NEAR transfer fails, credits the
    /// recipient's withdrawable balance instead of reverting or dropping funds.
    #[private]
    pub fn on_transfer_complete(&mut self, recipient: AccountId, amount: U128) -> U128 {
        match env::promise_result_checked(0, 64) {
            Ok(_) => amount,
            Err(_) => {
                let prev = self.claimable_refunds.get(&recipient).copied().unwrap_or(0);
                let next = prev.checked_add(amount.0).expect("Refund balance overflow");
                self.claimable_refunds.insert(recipient.clone(), next);
                PerpetuaEvent::TransferFailedRefundCredited { recipient, amount }.emit();
                U128(0)
            }
        }
    }

    pub fn withdraw_refund(&mut self) -> Promise {
        let caller = env::predecessor_account_id();
        let amount = self
            .claimable_refunds
            .remove(&caller)
            .expect("No claimable refund for account");
        require!(amount > 0, "Refund amount must be positive");
        CollateralAdapter::transfer_with_callback(&self.collateral_asset, caller, amount)
    }

    // ---- Admin & Governance ----

    pub fn set_resolver(&mut self, new_resolver: AccountId) {
        require!(
            env::predecessor_account_id() == self.owner_id,
            "Only owner can update resolver"
        );
        self.resolver_account_id = new_resolver;
    }

    pub fn withdraw_jury_fund(&mut self, to: AccountId, amount: U128) -> Promise {
        require!(
            env::predecessor_account_id() == self.owner_id,
            "Only owner can withdraw jury_cost_fund"
        );
        require!(amount.0 > 0, "Amount must be positive");
        self.jury_cost_fund = self
            .jury_cost_fund
            .checked_sub(amount.0)
            .expect("Insufficient jury_cost_fund");
        CollateralAdapter::transfer_with_callback(&self.collateral_asset, to, amount.0)
    }

    // ---- View Methods ----

    pub fn get_claim(&self, claim_id: u64) -> Option<ClaimView> {
        self.get_claim_internal(claim_id)
    }

    pub fn get_claims(&self, from_index: u64, limit: u64) -> Vec<ClaimView> {
        self.get_claims_internal(from_index, limit)
    }

    pub fn get_claims_count(&self) -> u64 {
        self.claims.len() as u64
    }

    pub fn get_market(&self, claim_id: u64, epoch: Option<u64>) -> Option<MarketView> {
        self.get_market_internal(claim_id, epoch)
    }

    pub fn get_position(
        &self,
        claim_id: u64,
        account_id: AccountId,
        epoch: Option<u64>,
    ) -> PositionView {
        self.get_position_internal(claim_id, account_id, epoch)
    }

    pub fn quote_buy(&self, claim_id: u64, outcome: Outcome, collateral_in: U128) -> QuoteBuyResult {
        self.quote_buy_internal(claim_id, outcome, collateral_in.0)
    }

    pub fn quote_sell(&self, claim_id: u64, outcome: Outcome, shares_in: U128) -> QuoteSellResult {
        self.quote_sell_internal(claim_id, outcome, shares_in.0)
    }

    pub fn get_claimable_refund(&self, account_id: AccountId) -> U128 {
        U128(self.claimable_refunds.get(&account_id).copied().unwrap_or(0))
    }

    pub fn get_jury_cost_fund(&self) -> U128 {
        U128(self.jury_cost_fund)
    }

    pub fn get_config(&self) -> ContractConfigView {
        ContractConfigView {
            owner_id: self.owner_id.clone(),
            resolver_account_id: self.resolver_account_id.clone(),
            collateral_asset: self.collateral_asset.clone(),
            fee_bps: self.fee_bps,
            escalation_bond: U128(self.escalation_bond),
            challenge_window_ns: U64(self.challenge_window_ns),
            jury_cost_fund: U128(self.jury_cost_fund),
            next_claim_id: self.next_claim_id,
        }
    }
}
