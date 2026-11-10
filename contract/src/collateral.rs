use near_sdk::json_types::U128;
use near_sdk::{AccountId, Gas, NearToken, Promise, env, require};

use crate::Contract;
use crate::types::CollateralAsset;

/// Static gas budget reserved for the private transfer callback.
pub const CALLBACK_GAS: Gas = Gas::from_tgas(10);

/// Collateral abstraction layer isolating native NEAR deposits/payouts from
/// future NEP-141 `ft_transfer` / `ft_on_transfer` implementations.
pub struct CollateralAdapter;

impl CollateralAdapter {
    /// Extracts attached collateral after reserving exact on-chain storage cost.
    pub fn take_deposit(asset: &CollateralAsset, storage_cost: u128) -> u128 {
        match asset {
            CollateralAsset::NativeNear => {
                let attached = env::attached_deposit().as_yoctonear();
                require!(
                    attached >= storage_cost,
                    "Attached NEAR does not cover storage staking cost"
                );
                attached.checked_sub(storage_cost).expect("checked deposit")
            }
            CollateralAsset::Nep141 { .. } => {
                env::panic_str("NEP-141 collateral requires ft_on_transfer (post-MVP)")
            }
        }
    }

    /// Sends an outbound payout and chains a non-panicking private callback that
    /// credits `claimable_refunds` if the transfer receipt fails.
    pub fn transfer_with_callback(
        asset: &CollateralAsset,
        recipient: AccountId,
        amount: u128,
    ) -> Promise {
        require!(amount > 0, "Transfer amount must be positive");
        match asset {
            CollateralAsset::NativeNear => Promise::new(recipient.clone())
                .transfer(NearToken::from_yoctonear(amount))
                .then(
                    Contract::ext(env::current_account_id())
                        .with_static_gas(CALLBACK_GAS)
                        .on_transfer_complete(recipient, U128(amount)),
                ),
            CollateralAsset::Nep141 { .. } => {
                env::panic_str("NEP-141 collateral payouts not enabled in MVP")
            }
        }
    }

    /// Refunds excess attached deposit back to caller synchronously without
    /// altering protocol vaults (e.g. surplus above fixed escalation bond).
    pub fn refund_excess(asset: &CollateralAsset, recipient: AccountId, excess: u128) {
        if excess == 0 {
            return;
        }
        match asset {
            CollateralAsset::NativeNear => {
                let _ = Promise::new(recipient).transfer(NearToken::from_yoctonear(excess));
            }
            CollateralAsset::Nep141 { .. } => {
                env::panic_str("NEP-141 excess refund not enabled in MVP")
            }
        }
    }
}

