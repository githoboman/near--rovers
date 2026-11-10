use near_sdk::json_types::{U64, U128};
use near_sdk::{AccountId, Promise, PromiseOrValue, env, require};

use crate::Contract;
use crate::amm::{mul_div_floor, price_e6, quote_buy, quote_sell};
use crate::collateral::CollateralAdapter;
use crate::events::PerpetuaEvent;
use crate::types::{
    BPS_DENOMINATOR, CHALLENGER_REWARD_BPS, Claim, ClaimStatus, ClaimView, MAX_CATEGORY_LEN,
    MAX_CLAIM_TEXT_LEN, MAX_EVIDENCE_URIS, MAX_HASH_LEN, MAX_URI_LEN, MIN_SEED_LIQUIDITY, Market,
    MarketStatus, MarketView, Outcome, PRICE_SCALE, Position, PositionView, PriceQuote,
    QuoteBuyResult, QuoteSellResult, Verdict,
};

pub fn encode_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for &b in bytes {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 0x0f) as usize] as char);
    }
    out
}

pub fn winning_outcome(verdict: Verdict) -> Option<Outcome> {
    match verdict {
        Verdict::True => Some(Outcome::Yes),
        Verdict::False => Some(Outcome::No),
        Verdict::Unresolved => None,
    }
}

impl Contract {
    pub(crate) fn flush_maps(&mut self) {
        self.claims.flush();
        self.markets.flush();
        self.positions.flush();
        self.claimable_refunds.flush();
    }

    pub(crate) fn compute_storage_cost(&mut self, storage_before: u64) -> u128 {
        self.flush_maps();
        let storage_after = env::storage_usage();
        let added = storage_after.saturating_sub(storage_before);
        u128::from(added)
            .checked_mul(env::storage_byte_cost().as_yoctonear())
            .expect("Storage cost overflow")
    }

    pub(crate) fn market_to_view(&self, m: &Market) -> MarketView {
        let (yes_price_e6, no_price_e6) = price_e6(m.yes_reserve, m.no_reserve).unwrap_or((0, 0));
        MarketView {
            claim_id: m.claim_id,
            epoch: m.epoch,
            yes_reserve: U128(m.yes_reserve),
            no_reserve: U128(m.no_reserve),
            collateral_vault: U128(m.collateral_vault),
            outstanding_yes: U128(m.outstanding_yes),
            outstanding_no: U128(m.outstanding_no),
            fee_pool: U128(m.fee_pool),
            fee_bps: m.fee_bps,
            opened_at: U64(m.opened_at),
            epoch_end: U64(m.epoch_end),
            status: m.status,
            yes_price_e6,
            no_price_e6,
            challenger: m.challenger.clone(),
            challenger_side: m.challenger_side,
            challenger_bond: U128(m.challenger_bond),
            counter_challenger: m.counter_challenger.clone(),
            counter_side: m.counter_side,
            counter_bond: U128(m.counter_bond),
            escalated_at: m.escalated_at.map(U64),
            snap_yes_price_e6: m.snap_yes_price_e6,
            verdict: m.verdict,
            attestation_hash: m.attestation_hash.clone(),
            ruled_at: m.ruled_at.map(U64),
            challenge_deadline: m.challenge_deadline.map(U64),
            settled_at: m.settled_at.map(U64),
            retained_liquidity: U128(m.retained_liquidity),
        }
    }

    pub(crate) fn build_fresh_market(
        &self,
        claim_id: u64,
        epoch: u64,
        seed: u128,
        opened_at: u64,
        epoch_length: u64,
    ) -> Market {
        let epoch_end = opened_at
            .checked_add(epoch_length)
            .expect("Epoch end timestamp overflow");
        Market {
            claim_id,
            epoch,
            yes_reserve: seed,
            no_reserve: seed,
            collateral_vault: seed,
            outstanding_yes: 0,
            outstanding_no: 0,
            fee_pool: 0,
            fee_bps: self.fee_bps,
            opened_at,
            epoch_end,
            status: MarketStatus::Open,
            challenger: None,
            challenger_side: None,
            challenger_bond: 0,
            counter_challenger: None,
            counter_side: None,
            counter_bond: 0,
            escalated_at: None,
            snap_yes_price_e6: None,
            verdict: None,
            attestation_hash: None,
            ruled_at: None,
            challenge_deadline: None,
            settled_at: None,
            retained_liquidity: 0,
        }
    }

    pub(crate) fn create_claim_internal(
        &mut self,
        text: String,
        evidence_uris: Vec<String>,
        category: String,
        epoch_length: u64,
    ) -> u64 {
        require!(
            !text.trim().is_empty() && text.len() <= MAX_CLAIM_TEXT_LEN,
            "Invalid claim text length"
        );
        require!(
            !category.trim().is_empty() && category.len() <= MAX_CATEGORY_LEN,
            "Invalid category length"
        );
        require!(
            evidence_uris.len() <= MAX_EVIDENCE_URIS,
            "Too many evidence URIs"
        );
        for uri in &evidence_uris {
            require!(
                !uri.trim().is_empty() && uri.len() <= MAX_URI_LEN,
                "Invalid evidence URI length"
            );
        }
        require!(epoch_length > 0, "epoch_length must be positive");

        let storage_before = env::storage_usage();
        let claim_id = self.next_claim_id;
        self.next_claim_id = self
            .next_claim_id
            .checked_add(1)
            .expect("Claim ID overflow");

        let now = env::block_timestamp();
        let text_hash = encode_hex(&env::sha256_array(text.as_bytes()));
        let creator = env::predecessor_account_id();

        let claim = Claim {
            id: claim_id,
            creator: creator.clone(),
            text,
            text_hash: text_hash.clone(),
            evidence_uris,
            category: category.clone(),
            epoch_length,
            current_epoch: 1,
            status: ClaimStatus::Open,
            page_hash: None,
            page_hash_updated_at: None,
            created_at: now,
        };
        self.claims.insert(claim_id, claim);

        // Insert initial market with temporary zero seed, measure exact storage delta,
        // then apply collateral seed from attached deposit minus storage cost.
        let placeholder_market = self.build_fresh_market(claim_id, 1, 0, now, epoch_length);
        let epoch_end = placeholder_market.epoch_end;
        self.markets.insert((claim_id, 1), placeholder_market);

        let storage_cost = self.compute_storage_cost(storage_before);
        let seed_liquidity = CollateralAdapter::take_deposit(&self.collateral_asset, storage_cost);
        require!(
            seed_liquidity >= MIN_SEED_LIQUIDITY,
            "Attached deposit after storage must meet minimum seed liquidity"
        );

        let market = self
            .markets
            .get_mut(&(claim_id, 1))
            .expect("Inserted market must exist");
        market.yes_reserve = seed_liquidity;
        market.no_reserve = seed_liquidity;
        market.collateral_vault = seed_liquidity;

        PerpetuaEvent::ClaimCreated {
            claim_id,
            creator,
            text_hash,
            category,
            epoch: 1,
            seed_liquidity: U128(seed_liquidity),
            epoch_end: U64(epoch_end),
        }
        .emit();

        claim_id
    }

    pub(crate) fn buy_internal(
        &mut self,
        claim_id: u64,
        outcome: Outcome,
        min_shares: u128,
    ) -> u128 {
        let storage_before = env::storage_usage();
        let buyer = env::predecessor_account_id();
        let claim = self.claims.get(&claim_id).expect("Claim not found");
        let epoch = claim.current_epoch;

        let market_snapshot = self
            .markets
            .get(&(claim_id, epoch))
            .expect("Market not found")
            .clone();
        require!(
            market_snapshot.status == MarketStatus::Open,
            "Market is not open for trading"
        );

        let pos_key = (claim_id, epoch, buyer.clone());
        let had_position = self.positions.contains_key(&pos_key);
        if !had_position {
            self.positions.insert(pos_key.clone(), Position::default());
        }

        let storage_cost = self.compute_storage_cost(storage_before);
        let collateral_in = CollateralAdapter::take_deposit(&self.collateral_asset, storage_cost);
        require!(collateral_in > 0, "Buy deposit must exceed storage cost");

        let quote = quote_buy(
            market_snapshot.yes_reserve,
            market_snapshot.no_reserve,
            collateral_in,
            outcome,
            market_snapshot.fee_bps,
        )
        .expect("Buy AMM quote failed (overflow or reserve floor)");
        require!(quote.shares_out >= min_shares, "Slippage limit exceeded");

        let market = self
            .markets
            .get_mut(&(claim_id, epoch))
            .expect("Market must exist");
        market.yes_reserve = quote.new_yes_reserve;
        market.no_reserve = quote.new_no_reserve;
        market.collateral_vault = market
            .collateral_vault
            .checked_add(quote.net_collateral)
            .expect("Collateral vault overflow");
        market.fee_pool = market
            .fee_pool
            .checked_add(quote.fee)
            .expect("Fee pool overflow");

        match outcome {
            Outcome::Yes => {
                market.outstanding_yes = market
                    .outstanding_yes
                    .checked_add(quote.shares_out)
                    .expect("Outstanding YES overflow");
            }
            Outcome::No => {
                market.outstanding_no = market
                    .outstanding_no
                    .checked_add(quote.shares_out)
                    .expect("Outstanding NO overflow");
            }
        }

        let pos = self
            .positions
            .get_mut(&pos_key)
            .expect("Position must exist");
        match outcome {
            Outcome::Yes => {
                pos.yes_shares = pos
                    .yes_shares
                    .checked_add(quote.shares_out)
                    .expect("User YES overflow");
            }
            Outcome::No => {
                pos.no_shares = pos
                    .no_shares
                    .checked_add(quote.shares_out)
                    .expect("User NO overflow");
            }
        }

        PerpetuaEvent::TradeExecuted {
            claim_id,
            epoch,
            trader: buyer,
            side: "buy".to_string(),
            outcome,
            collateral_amount: U128(collateral_in),
            shares_amount: U128(quote.shares_out),
            fee_amount: U128(quote.fee),
            yes_price_e6: quote.post_yes_price_e6,
            yes_reserve: U128(quote.new_yes_reserve),
            no_reserve: U128(quote.new_no_reserve),
        }
        .emit();

        quote.shares_out
    }

    pub(crate) fn sell_internal(
        &mut self,
        claim_id: u64,
        outcome: Outcome,
        shares: u128,
        min_collateral_out: u128,
    ) -> Promise {
        require!(shares > 0, "Shares to sell must be positive");
        let seller = env::predecessor_account_id();
        let claim = self.claims.get(&claim_id).expect("Claim not found");
        let epoch = claim.current_epoch;

        let market_snapshot = self
            .markets
            .get(&(claim_id, epoch))
            .expect("Market not found")
            .clone();
        require!(
            market_snapshot.status == MarketStatus::Open,
            "Market is not open for trading"
        );

        let pos_key = (claim_id, epoch, seller.clone());
        let pos_copy = *self.positions.get(&pos_key).expect("Position not found");
        let user_balance = match outcome {
            Outcome::Yes => pos_copy.yes_shares,
            Outcome::No => pos_copy.no_shares,
        };
        require!(user_balance >= shares, "Insufficient shares");

        let quote = quote_sell(
            market_snapshot.yes_reserve,
            market_snapshot.no_reserve,
            shares,
            outcome,
            market_snapshot.fee_bps,
        )
        .expect("Sell AMM quote failed (overflow or reserve floor)");
        require!(
            quote.net_collateral >= min_collateral_out,
            "Slippage limit exceeded"
        );

        // Effects before interaction: update position and market reserves before payout.
        let pos = self
            .positions
            .get_mut(&pos_key)
            .expect("Position must exist");
        match outcome {
            Outcome::Yes => pos.yes_shares = pos.yes_shares.checked_sub(shares).unwrap(),
            Outcome::No => pos.no_shares = pos.no_shares.checked_sub(shares).unwrap(),
        }
        let remove_pos = pos.yes_shares == 0 && pos.no_shares == 0;
        if remove_pos {
            self.positions.remove(&pos_key);
        }

        let market = self
            .markets
            .get_mut(&(claim_id, epoch))
            .expect("Market must exist");
        market.yes_reserve = quote.new_yes_reserve;
        market.no_reserve = quote.new_no_reserve;
        market.collateral_vault = market
            .collateral_vault
            .checked_sub(quote.gross_collateral)
            .expect("Collateral vault underflow");
        market.fee_pool = market
            .fee_pool
            .checked_add(quote.fee)
            .expect("Fee pool overflow");

        match outcome {
            Outcome::Yes => {
                market.outstanding_yes = market
                    .outstanding_yes
                    .checked_sub(shares)
                    .expect("Outstanding YES underflow");
            }
            Outcome::No => {
                market.outstanding_no = market
                    .outstanding_no
                    .checked_sub(shares)
                    .expect("Outstanding NO underflow");
            }
        }

        PerpetuaEvent::TradeExecuted {
            claim_id,
            epoch,
            trader: seller.clone(),
            side: "sell".to_string(),
            outcome,
            collateral_amount: U128(quote.net_collateral),
            shares_amount: U128(shares),
            fee_amount: U128(quote.fee),
            yes_price_e6: quote.post_yes_price_e6,
            yes_reserve: U128(quote.new_yes_reserve),
            no_reserve: U128(quote.new_no_reserve),
        }
        .emit();

        CollateralAdapter::transfer_with_callback(
            &self.collateral_asset,
            seller,
            quote.net_collateral,
        )
    }

    pub(crate) fn escalate_internal(
        &mut self,
        claim_id: u64,
        asserted_outcome: Option<Outcome>,
    ) {
        let storage_before = env::storage_usage();
        let challenger = env::predecessor_account_id();

        let epoch = self
            .claims
            .get(&claim_id)
            .expect("Claim not found")
            .current_epoch;

        let market = self
            .markets
            .get_mut(&(claim_id, epoch))
            .expect("Market not found");
        require!(
            market.status == MarketStatus::Open,
            "Only an Open market can be escalated"
        );

        let (snap_yes_price_e6, _) =
            price_e6(market.yes_reserve, market.no_reserve).expect("Invalid market reserves");

        // If caller does not explicitly pick a side, default to challenging the
        // prevailing market consensus (>= 50% YES -> assert NO, else assert YES).
        let side = asserted_outcome.unwrap_or_else(|| {
            if snap_yes_price_e6 >= (PRICE_SCALE as u32) / 2 {
                Outcome::No
            } else {
                Outcome::Yes
            }
        });

        let now = env::block_timestamp();
        let bond = self.escalation_bond;
        market.status = MarketStatus::Escalated;
        market.challenger = Some(challenger.clone());
        market.challenger_side = Some(side);
        market.challenger_bond = bond;
        market.escalated_at = Some(now);
        market.snap_yes_price_e6 = Some(snap_yes_price_e6);

        let claim = self.claims.get_mut(&claim_id).expect("Claim must exist");
        claim.status = ClaimStatus::Escalated;

        let storage_cost = self.compute_storage_cost(storage_before);
        let deposit = CollateralAdapter::take_deposit(&self.collateral_asset, storage_cost);
        require!(deposit >= bond, "Attached bond is below escalation_bond");
        let excess = deposit.checked_sub(bond).unwrap();
        CollateralAdapter::refund_excess(&self.collateral_asset, challenger.clone(), excess);

        PerpetuaEvent::ClaimEscalated {
            claim_id,
            epoch,
            challenger,
            challenger_side: side,
            bond: U128(bond),
            snap_yes_price_e6,
        }
        .emit();
    }

    pub(crate) fn submit_ruling_internal(
        &mut self,
        claim_id: u64,
        verdict: Verdict,
        attestation_hash: String,
    ) {
        let caller = env::predecessor_account_id();
        require!(
            caller == self.resolver_account_id,
            "Only resolver account can submit rulings"
        );
        require!(
            !attestation_hash.trim().is_empty() && attestation_hash.len() <= MAX_HASH_LEN,
            "Invalid attestation_hash"
        );

        let epoch = self
            .claims
            .get(&claim_id)
            .expect("Claim not found")
            .current_epoch;

        let now = env::block_timestamp();
        let deadline = now
            .checked_add(self.challenge_window_ns)
            .expect("Challenge deadline overflow");

        let market = self
            .markets
            .get_mut(&(claim_id, epoch))
            .expect("Market not found");
        require!(
            market.status == MarketStatus::Escalated,
            "Market must be Escalated to submit ruling"
        );

        market.status = MarketStatus::Ruled;
        market.verdict = Some(verdict);
        market.attestation_hash = Some(attestation_hash.clone());
        market.ruled_at = Some(now);
        market.challenge_deadline = Some(deadline);

        let claim = self.claims.get_mut(&claim_id).expect("Claim must exist");
        claim.status = ClaimStatus::Ruled;

        PerpetuaEvent::RulingSubmitted {
            claim_id,
            epoch,
            resolver: caller,
            verdict,
            attestation_hash,
            challenge_deadline: U64(deadline),
        }
        .emit();
    }

    pub(crate) fn challenge_ruling_internal(
        &mut self,
        claim_id: u64,
        asserted_outcome: Option<Outcome>,
    ) {
        let storage_before = env::storage_usage();
        let counter_challenger = env::predecessor_account_id();

        let epoch = self
            .claims
            .get(&claim_id)
            .expect("Claim not found")
            .current_epoch;

        let now = env::block_timestamp();
        let min_counter_bond = self
            .escalation_bond
            .checked_mul(2)
            .expect("Counter bond overflow");

        let market = self
            .markets
            .get_mut(&(claim_id, epoch))
            .expect("Market not found");
        require!(
            market.status == MarketStatus::Ruled,
            "Market must be in Ruled state to challenge"
        );
        require!(
            market.counter_challenger.is_none(),
            "Ruling has already been challenged this epoch"
        );
        let deadline = market
            .challenge_deadline
            .expect("Challenge deadline missing");
        require!(now < deadline, "Challenge window has expired");

        let current_verdict = market.verdict.expect("Verdict missing");
        let counter_side = asserted_outcome.unwrap_or_else(|| match current_verdict {
            Verdict::True => Outcome::No,
            Verdict::False => Outcome::Yes,
            Verdict::Unresolved => Outcome::Yes,
        });
        if let Some(v_outcome) = winning_outcome(current_verdict) {
            require!(
                counter_side != v_outcome,
                "Counter-challenge must assert an outcome different from the disputed ruling"
            );
        }

        market.counter_challenger = Some(counter_challenger.clone());
        market.counter_side = Some(counter_side);
        market.counter_bond = min_counter_bond;
        market.status = MarketStatus::Escalated;
        market.verdict = None;
        market.ruled_at = None;
        market.challenge_deadline = None;

        let claim = self.claims.get_mut(&claim_id).expect("Claim must exist");
        claim.status = ClaimStatus::Escalated;

        let storage_cost = self.compute_storage_cost(storage_before);
        let deposit = CollateralAdapter::take_deposit(&self.collateral_asset, storage_cost);
        require!(
            deposit >= min_counter_bond,
            "Counter-challenge bond must be at least 2x escalation_bond"
        );
        let excess = deposit.checked_sub(min_counter_bond).unwrap();
        CollateralAdapter::refund_excess(
            &self.collateral_asset,
            counter_challenger.clone(),
            excess,
        );

        PerpetuaEvent::RulingChallenged {
            claim_id,
            epoch,
            counter_challenger,
            counter_side,
            counter_bond: U128(min_counter_bond),
        }
        .emit();
    }

    pub(crate) fn settle_internal(&mut self, claim_id: u64) -> PromiseOrValue<()> {
        let claim_snapshot = self.claims.get(&claim_id).expect("Claim not found").clone();
        let epoch = claim_snapshot.current_epoch;
        let now = env::block_timestamp();

        let mut market = self
            .markets
            .get(&(claim_id, epoch))
            .expect("Market not found")
            .clone();
        require!(
            market.status == MarketStatus::Ruled,
            "Market must be Ruled before settling"
        );
        let deadline = market
            .challenge_deadline
            .expect("Challenge deadline missing");
        require!(
            now >= deadline,
            "Challenge window has not expired yet"
        );

        let verdict = market.verdict.expect("Verdict missing");
        let win_opt = winning_outcome(verdict);

        // Evaluate bond outcomes and fee-pool rewards.
        let mut payouts: Vec<(AccountId, u128)> = Vec::new();
        let mut slashed_total = 0u128;

        let challenger_won = match (win_opt, market.challenger_side) {
            (Some(win), Some(side)) => win == side,
            (None, _) => false,
            _ => false,
        };
        let counter_won = match (win_opt, market.counter_side, &market.counter_challenger) {
            (Some(win), Some(side), Some(_)) => win == side,
            _ => false,
        };

        let winners_count = usize::from(challenger_won) + usize::from(counter_won);
        let total_reward_pool = if winners_count > 0 {
            mul_div_floor(market.fee_pool, CHALLENGER_REWARD_BPS, BPS_DENOMINATOR)
                .expect("Reward math overflow")
        } else {
            0
        };
        let mut reward_allocated = 0u128;

        if let Some(challenger) = market.challenger.clone() {
            if verdict == Verdict::Unresolved {
                payouts.push((challenger, market.challenger_bond));
            } else if challenger_won {
                let reward = if winners_count == 2 {
                    total_reward_pool / 2
                } else {
                    total_reward_pool
                };
                reward_allocated = reward_allocated.checked_add(reward).unwrap();
                payouts.push((
                    challenger,
                    market.challenger_bond.checked_add(reward).unwrap(),
                ));
            } else {
                slashed_total = slashed_total.checked_add(market.challenger_bond).unwrap();
            }
        }

        if let Some(counter) = market.counter_challenger.clone() {
            if verdict == Verdict::Unresolved {
                payouts.push((counter, market.counter_bond));
            } else if counter_won {
                let reward = total_reward_pool.checked_sub(reward_allocated).unwrap();
                reward_allocated = reward_allocated.checked_add(reward).unwrap();
                payouts.push((counter, market.counter_bond.checked_add(reward).unwrap()));
            } else {
                slashed_total = slashed_total.checked_add(market.counter_bond).unwrap();
            }
        }

        self.jury_cost_fund = self
            .jury_cost_fund
            .checked_add(slashed_total)
            .expect("Jury cost fund overflow");

        let leftover_fee = market
            .fee_pool
            .checked_sub(reward_allocated)
            .expect("Fee pool underflow");
        market.fee_pool = 0;

        // Compute exact trader redemption liability so the settled market's
        // collateral_vault remains 100% solvent for every outstanding share.
        let trader_liability = match verdict {
            Verdict::True => market.outstanding_yes,
            Verdict::False => market.outstanding_no,
            Verdict::Unresolved => {
                let p_yes = u128::from(
                    market
                        .snap_yes_price_e6
                        .expect("Snapshot price missing for Unresolved"),
                );
                let p_no = PRICE_SCALE.checked_sub(p_yes).unwrap();
                let yes_liab = mul_div_floor(market.outstanding_yes, p_yes, PRICE_SCALE)
                    .expect("Unresolved YES liability overflow");
                let no_liab = mul_div_floor(market.outstanding_no, p_no, PRICE_SCALE)
                    .expect("Unresolved NO liability overflow");
                yes_liab
                    .checked_add(no_liab)
                    .expect("Total liability overflow")
            }
        };

        let retained_from_vault = market
            .collateral_vault
            .checked_sub(trader_liability)
            .expect("Vault invariant broken: vault < trader_liability");
        market.collateral_vault = trader_liability;

        let next_seed = retained_from_vault
            .checked_add(leftover_fee)
            .expect("Next epoch seed overflow");

        market.status = MarketStatus::Settled;
        market.settled_at = Some(now);

        let mut next_epoch_opened = None;
        if next_seed >= MIN_SEED_LIQUIDITY {
            let next_epoch = epoch.checked_add(1).expect("Epoch overflow");
            market.retained_liquidity = next_seed;
            let next_market =
                self.build_fresh_market(claim_id, next_epoch, next_seed, now, claim_snapshot.epoch_length);
            self.markets.insert((claim_id, next_epoch), next_market);

            let claim = self.claims.get_mut(&claim_id).expect("Claim must exist");
            claim.current_epoch = next_epoch;
            claim.status = ClaimStatus::Open;
            next_epoch_opened = Some(next_epoch);
        } else {
            // Dust too small for a live CPMM epoch goes to jury_cost_fund so no value is stranded.
            market.retained_liquidity = 0;
            self.jury_cost_fund = self
                .jury_cost_fund
                .checked_add(next_seed)
                .expect("Jury fund dust overflow");
            let claim = self.claims.get_mut(&claim_id).expect("Claim must exist");
            claim.status = ClaimStatus::Settled;
        }

        self.markets.insert((claim_id, epoch), market);

        PerpetuaEvent::EpochSettled {
            claim_id,
            epoch,
            verdict,
            retained_liquidity: U128(next_seed),
            next_epoch_opened,
        }
        .emit();

        let mut combined_promise: Option<Promise> = None;
        for (recipient, amount) in payouts {
            if amount == 0 {
                continue;
            }
            let p =
                CollateralAdapter::transfer_with_callback(&self.collateral_asset, recipient, amount);
            combined_promise = Some(match combined_promise {
                Some(prev) => prev.and(p),
                None => p,
            });
        }

        match combined_promise {
            Some(p) => PromiseOrValue::Promise(p),
            None => PromiseOrValue::Value(()),
        }
    }

    pub(crate) fn advance_epoch_internal(&mut self, claim_id: u64) -> u64 {
        let claim = self.claims.get(&claim_id).expect("Claim not found").clone();
        let epoch = claim.current_epoch;
        let now = env::block_timestamp();

        let mut market = self
            .markets
            .get(&(claim_id, epoch))
            .expect("Market not found")
            .clone();
        require!(
            market.status == MarketStatus::Open,
            "Only an Open market can advance without dispute"
        );
        require!(
            now >= market.epoch_end,
            "Epoch has not ended yet"
        );
        require!(
            market.outstanding_yes == 0 && market.outstanding_no == 0,
            "Uncontested rollover requires no outstanding shares; escalate to settle active positions"
        );

        let next_seed = market
            .collateral_vault
            .checked_add(market.fee_pool)
            .expect("Rollover liquidity overflow");
        require!(
            next_seed >= MIN_SEED_LIQUIDITY,
            "Insufficient liquidity to open next epoch"
        );

        market.collateral_vault = 0;
        market.fee_pool = 0;
        market.status = MarketStatus::Settled;
        market.settled_at = Some(now);
        market.retained_liquidity = next_seed;
        self.markets.insert((claim_id, epoch), market);

        let next_epoch = epoch.checked_add(1).expect("Epoch overflow");
        let next_market =
            self.build_fresh_market(claim_id, next_epoch, next_seed, now, claim.epoch_length);
        self.markets.insert((claim_id, next_epoch), next_market);

        let claim_mut = self.claims.get_mut(&claim_id).expect("Claim must exist");
        claim_mut.current_epoch = next_epoch;
        claim_mut.status = ClaimStatus::Open;

        PerpetuaEvent::EpochAdvanced {
            claim_id,
            closed_epoch: epoch,
            new_epoch: next_epoch,
            retained_liquidity: U128(next_seed),
        }
        .emit();

        next_epoch
    }

    pub(crate) fn redeem_internal(&mut self, claim_id: u64, epoch: Option<u64>) -> Promise {
        let caller = env::predecessor_account_id();
        let claim = self.claims.get(&claim_id).expect("Claim not found");
        let target_epoch = epoch.unwrap_or_else(|| {
            let cur = claim.current_epoch;
            if let Some(m) = self.markets.get(&(claim_id, cur)) {
                if m.status == MarketStatus::Settled {
                    return cur;
                }
            }
            cur.checked_sub(1).expect("No settled epoch available")
        });

        let market = self
            .markets
            .get_mut(&(claim_id, target_epoch))
            .expect("Market not found");
        require!(
            market.status == MarketStatus::Settled,
            "Market epoch is not settled"
        );
        let verdict = market.verdict.expect("Settled market missing verdict");

        let pos_key = (claim_id, target_epoch, caller.clone());
        let pos = self
            .positions
            .remove(&pos_key)
            .expect("No redeemable position for account in this epoch");

        let payout = match verdict {
            Verdict::True => pos.yes_shares,
            Verdict::False => pos.no_shares,
            Verdict::Unresolved => {
                let p_yes = u128::from(
                    market
                        .snap_yes_price_e6
                        .expect("Snapshot price missing for Unresolved"),
                );
                let p_no = PRICE_SCALE.checked_sub(p_yes).unwrap();
                let y_out = mul_div_floor(pos.yes_shares, p_yes, PRICE_SCALE)
                    .expect("Unresolved YES payout overflow");
                let n_out = mul_div_floor(pos.no_shares, p_no, PRICE_SCALE)
                    .expect("Unresolved NO payout overflow");
                y_out.checked_add(n_out).expect("Payout overflow")
            }
        };
        require!(payout > 0, "Position has zero redeemable value");

        market.collateral_vault = market
            .collateral_vault
            .checked_sub(payout)
            .expect("Redemption exceeds reserved collateral vault");

        PerpetuaEvent::SharesRedeemed {
            claim_id,
            epoch: target_epoch,
            account_id: caller.clone(),
            payout: U128(payout),
        }
        .emit();

        CollateralAdapter::transfer_with_callback(&self.collateral_asset, caller, payout)
    }

    pub(crate) fn set_page_hash_internal(&mut self, claim_id: u64, hash: String) {
        let caller = env::predecessor_account_id();
        require!(
            caller == self.resolver_account_id || caller == self.owner_id,
            "Only resolver or owner can update page_hash"
        );
        require!(
            !hash.trim().is_empty() && hash.len() <= MAX_HASH_LEN,
            "Invalid page hash"
        );

        let now = env::block_timestamp();
        let claim = self.claims.get_mut(&claim_id).expect("Claim not found");
        claim.page_hash = Some(hash.clone());
        claim.page_hash_updated_at = Some(now);
        let epoch = claim.current_epoch;

        PerpetuaEvent::PageHashUpdated {
            claim_id,
            epoch,
            page_hash: hash,
            updated_by: caller,
        }
        .emit();
    }

    pub(crate) fn get_price_internal(&self, claim_id: u64, epoch: Option<u64>) -> PriceQuote {
        let claim = self.claims.get(&claim_id).expect("Claim not found");
        let target_epoch = epoch.unwrap_or(claim.current_epoch);
        let market = self
            .markets
            .get(&(claim_id, target_epoch))
            .expect("Market not found");
        let (yes_price_e6, no_price_e6) =
            price_e6(market.yes_reserve, market.no_reserve).expect("Invalid market reserves");
        let yes_bps = (yes_price_e6 / 100) as u16;
        let no_bps = (10_000u16).checked_sub(yes_bps).unwrap();
        PriceQuote {
            claim_id,
            epoch: target_epoch,
            yes_price_e6,
            no_price_e6,
            yes_bps,
            no_bps,
            yes_reserve: U128(market.yes_reserve),
            no_reserve: U128(market.no_reserve),
        }
    }

    pub(crate) fn quote_buy_internal(
        &self,
        claim_id: u64,
        outcome: Outcome,
        collateral_in: u128,
    ) -> QuoteBuyResult {
        let claim = self.claims.get(&claim_id).expect("Claim not found");
        let market = self
            .markets
            .get(&(claim_id, claim.current_epoch))
            .expect("Market not found");
        require!(
            market.status == MarketStatus::Open,
            "Market is not open for trading"
        );
        let q = quote_buy(
            market.yes_reserve,
            market.no_reserve,
            collateral_in,
            outcome,
            market.fee_bps,
        )
        .expect("Invalid buy quote");
        QuoteBuyResult {
            shares_out: U128(q.shares_out),
            fee: U128(q.fee),
            post_yes_price_e6: q.post_yes_price_e6,
            post_no_price_e6: q.post_no_price_e6,
        }
    }

    pub(crate) fn quote_sell_internal(
        &self,
        claim_id: u64,
        outcome: Outcome,
        shares_in: u128,
    ) -> QuoteSellResult {
        let claim = self.claims.get(&claim_id).expect("Claim not found");
        let market = self
            .markets
            .get(&(claim_id, claim.current_epoch))
            .expect("Market not found");
        require!(
            market.status == MarketStatus::Open,
            "Market is not open for trading"
        );
        let q = quote_sell(
            market.yes_reserve,
            market.no_reserve,
            shares_in,
            outcome,
            market.fee_bps,
        )
        .expect("Invalid sell quote");
        QuoteSellResult {
            collateral_out: U128(q.net_collateral),
            fee: U128(q.fee),
            post_yes_price_e6: q.post_yes_price_e6,
            post_no_price_e6: q.post_no_price_e6,
        }
    }

    pub(crate) fn get_claim_internal(&self, claim_id: u64) -> Option<ClaimView> {
        self.claims.get(&claim_id).map(ClaimView::from)
    }

    pub(crate) fn get_claims_internal(&self, from_index: u64, limit: u64) -> Vec<ClaimView> {
        self.claims
            .values()
            .skip(from_index as usize)
            .take(limit as usize)
            .map(ClaimView::from)
            .collect()
    }

    pub(crate) fn get_market_internal(
        &self,
        claim_id: u64,
        epoch: Option<u64>,
    ) -> Option<MarketView> {
        let target_epoch = match epoch {
            Some(e) => e,
            None => self.claims.get(&claim_id)?.current_epoch,
        };
        self.markets
            .get(&(claim_id, target_epoch))
            .map(|m| self.market_to_view(m))
    }

    pub(crate) fn get_position_internal(
        &self,
        claim_id: u64,
        account_id: AccountId,
        epoch: Option<u64>,
    ) -> PositionView {
        let target_epoch = epoch.unwrap_or_else(|| {
            self.claims
                .get(&claim_id)
                .map(|c| c.current_epoch)
                .unwrap_or(1)
        });
        let pos = self
            .positions
            .get(&(claim_id, target_epoch, account_id.clone()))
            .copied()
            .unwrap_or_default();
        PositionView {
            claim_id,
            epoch: target_epoch,
            account_id,
            yes_shares: U128(pos.yes_shares),
            no_shares: U128(pos.no_shares),
        }
    }
}

