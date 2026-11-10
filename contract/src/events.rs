use near_sdk::AccountId;
use near_sdk::json_types::{U64, U128};
use near_sdk::near;

use crate::types::{Outcome, Verdict};

#[near(event_json(standard = "perpetua"))]
pub enum PerpetuaEvent {
    #[event_version("1.0.0")]
    ClaimCreated {
        claim_id: u64,
        creator: AccountId,
        text_hash: String,
        category: String,
        epoch: u64,
        seed_liquidity: U128,
        epoch_end: U64,
    },
    #[event_version("1.0.0")]
    TradeExecuted {
        claim_id: u64,
        epoch: u64,
        trader: AccountId,
        side: String,
        outcome: Outcome,
        collateral_amount: U128,
        shares_amount: U128,
        fee_amount: U128,
        yes_price_e6: u32,
        yes_reserve: U128,
        no_reserve: U128,
    },
    #[event_version("1.0.0")]
    ClaimEscalated {
        claim_id: u64,
        epoch: u64,
        challenger: AccountId,
        challenger_side: Outcome,
        bond: U128,
        snap_yes_price_e6: u32,
    },
    #[event_version("1.0.0")]
    RulingSubmitted {
        claim_id: u64,
        epoch: u64,
        resolver: AccountId,
        verdict: Verdict,
        attestation_hash: String,
        challenge_deadline: U64,
    },
    #[event_version("1.0.0")]
    RulingChallenged {
        claim_id: u64,
        epoch: u64,
        counter_challenger: AccountId,
        counter_side: Outcome,
        counter_bond: U128,
    },
    #[event_version("1.0.0")]
    EpochSettled {
        claim_id: u64,
        epoch: u64,
        verdict: Verdict,
        retained_liquidity: U128,
        next_epoch_opened: Option<u64>,
    },
    #[event_version("1.0.0")]
    EpochAdvanced {
        claim_id: u64,
        closed_epoch: u64,
        new_epoch: u64,
        retained_liquidity: U128,
    },
    #[event_version("1.0.0")]
    SharesRedeemed {
        claim_id: u64,
        epoch: u64,
        account_id: AccountId,
        payout: U128,
    },
    #[event_version("1.0.0")]
    PageHashUpdated {
        claim_id: u64,
        epoch: u64,
        page_hash: String,
        updated_by: AccountId,
    },
    #[event_version("1.0.0")]
    TransferFailedRefundCredited {
        recipient: AccountId,
        amount: U128,
    },
}

