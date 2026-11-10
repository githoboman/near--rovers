use near_workspaces::types::{NearGas, NearToken};
use serde_json::json;

const WASM_PATH: &str = "../target/wasm32-unknown-unknown/release/perpetua_contract.wasm";

async fn deploy_and_init() -> anyhow::Result<(
    near_workspaces::Worker<near_workspaces::network::Sandbox>,
    near_workspaces::Contract,
    near_workspaces::Account,
    near_workspaces::Account,
)> {
    let worker = near_workspaces::sandbox().await?;
    let wasm = std::fs::read(WASM_PATH)?;
    let contract = worker.dev_deploy(&wasm).await?;
    let owner = worker.dev_create_account().await?;
    let resolver = worker.dev_create_account().await?;

    contract
        .call("new")
        .args_json(json!({
            "owner_id": owner.id(),
            "resolver_account_id": resolver.id(),
            "fee_bps": 100,
            "escalation_bond": NearToken::from_near(1).as_yoctonear().to_string(),
            "challenge_window_ns": "5000000000"
        }))
        .transact()
        .await?
        .into_result()?;

    Ok((worker, contract, owner, resolver))
}

#[tokio::test]
async fn test_happy_path_create_buy_sell_and_page_hash() -> anyhow::Result<()> {
    let (worker, contract, _owner, resolver) = deploy_and_init().await?;
    let alice = worker.dev_create_account().await?;
    let bob = worker.dev_create_account().await?;

    let claim_id: u64 = alice
        .call(contract.id(), "create_claim")
        .args_json(json!({
            "text": "Uniswap v3 core contracts were audited by Trail of Bits",
            "evidence_uris": ["https://github.com/Uniswap/v3-core"],
            "category": "audit_status",
            "epoch_length": "60000000000"
        }))
        .deposit(NearToken::from_near(2))
        .max_gas()
        .transact()
        .await?
        .json()?;
    assert_eq!(claim_id, 1);

    let price0: serde_json::Value = contract
        .call("get_price")
        .args_json(json!({ "claim_id": claim_id }))
        .view()
        .await?
        .json()?;
    assert_eq!(price0["yes_price_e6"], 500_000);

    let shares_str: String = bob
        .call(contract.id(), "buy")
        .args_json(json!({
            "claim_id": claim_id,
            "outcome": "Yes",
            "min_shares": "1"
        }))
        .deposit(NearToken::from_millinear(500))
        .max_gas()
        .transact()
        .await?
        .json()?;
    let shares: u128 = shares_str.parse()?;
    assert!(shares > 0);

    let price1: serde_json::Value = contract
        .call("get_price")
        .args_json(json!({ "claim_id": claim_id }))
        .view()
        .await?
        .json()?;
    assert!(price1["yes_price_e6"].as_u64().unwrap() > 500_000);

    let payout_res = bob
        .call(contract.id(), "sell")
        .args_json(json!({
            "claim_id": claim_id,
            "outcome": "Yes",
            "shares": (shares / 2).to_string(),
            "min_collateral_out": "1"
        }))
        .gas(NearGas::from_tgas(80))
        .transact()
        .await?
        .into_result()?;
    assert!(payout_res.is_success());

    resolver
        .call(contract.id(), "set_page_hash")
        .args_json(json!({
            "claim_id": claim_id,
            "hash": "sha256:page_hash_v1"
        }))
        .transact()
        .await?
        .into_result()?;

    let claim: serde_json::Value = contract
        .call("get_claim")
        .args_json(json!({ "claim_id": claim_id }))
        .view()
        .await?
        .json()?;
    assert_eq!(claim["page_hash"], "sha256:page_hash_v1");

    Ok(())
}

#[tokio::test]
async fn test_escalation_both_ways_and_challenge_window() -> anyhow::Result<()> {
    let (worker, contract, _owner, resolver) = deploy_and_init().await?;
    let alice = worker.dev_create_account().await?;
    let trader = worker.dev_create_account().await?;
    let challenger = worker.dev_create_account().await?;

    let claim_id: u64 = alice
        .call(contract.id(), "create_claim")
        .args_json(json!({
            "text": "Protocol A TVL surpassed $500M",
            "evidence_uris": ["https://defillama.com"],
            "category": "tvl",
            "epoch_length": "300000000000"
        }))
        .deposit(NearToken::from_near(2))
        .max_gas()
        .transact()
        .await?
        .json()?;

    trader
        .call(contract.id(), "buy")
        .args_json(json!({
            "claim_id": claim_id,
            "outcome": "Yes",
            "min_shares": "1"
        }))
        .deposit(NearToken::from_near(1))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    let bal_before = challenger.view_account().await?.balance;
    challenger
        .call(contract.id(), "escalate")
        .args_json(json!({
            "claim_id": claim_id,
            "asserted_outcome": "Yes"
        }))
        .deposit(NearToken::from_near(2))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    resolver
        .call(contract.id(), "submit_ruling")
        .args_json(json!({
            "claim_id": claim_id,
            "verdict": "True",
            "attestation_hash": "tee_att_win"
        }))
        .transact()
        .await?
        .into_result()?;

    let early = alice
        .call(contract.id(), "settle")
        .args_json(json!({ "claim_id": claim_id }))
        .max_gas()
        .transact()
        .await?;
    assert!(early.is_failure());

    worker.fast_forward(15).await?;

    alice
        .call(contract.id(), "settle")
        .args_json(json!({ "claim_id": claim_id }))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    let bal_after = challenger.view_account().await?.balance;
    assert!(bal_after > bal_before);

    let trader_before = trader.view_account().await?.balance;
    trader
        .call(contract.id(), "redeem")
        .args_json(json!({ "claim_id": claim_id, "epoch": 1 }))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    assert!(trader.view_account().await?.balance > trader_before);

    challenger
        .call(contract.id(), "escalate")
        .args_json(json!({
            "claim_id": claim_id,
            "asserted_outcome": "Yes"
        }))
        .deposit(NearToken::from_near(2))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    resolver
        .call(contract.id(), "submit_ruling")
        .args_json(json!({
            "claim_id": claim_id,
            "verdict": "False",
            "attestation_hash": "tee_att_lose"
        }))
        .transact()
        .await?
        .into_result()?;

    worker.fast_forward(15).await?;
    alice
        .call(contract.id(), "settle")
        .args_json(json!({ "claim_id": claim_id }))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    let jury_fund: String = contract
        .call("get_jury_cost_fund")
        .view()
        .await?
        .json()?;
    assert_eq!(jury_fund, NearToken::from_near(1).as_yoctonear().to_string());

    Ok(())
}

#[tokio::test]
async fn test_unresolved_snapshot_redemption_and_rounding_edge_cases() -> anyhow::Result<()> {
    let (worker, contract, _owner, resolver) = deploy_and_init().await?;
    let creator = worker.dev_create_account().await?;
    let yes_trader = worker.dev_create_account().await?;
    let no_trader = worker.dev_create_account().await?;
    let attacker = worker.dev_create_account().await?;

    let claim_id: u64 = creator
        .call(contract.id(), "create_claim")
        .args_json(json!({
            "text": "Bridge B is maintained by Team X",
            "evidence_uris": ["https://example.org/spec"],
            "category": "authorship",
            "epoch_length": "300000000000"
        }))
        .deposit(NearToken::from_near(2))
        .max_gas()
        .transact()
        .await?
        .json()?;

    yes_trader
        .call(contract.id(), "buy")
        .args_json(json!({
            "claim_id": claim_id,
            "outcome": "Yes",
            "min_shares": "1"
        }))
        .deposit(NearToken::from_near(1))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    no_trader
        .call(contract.id(), "buy")
        .args_json(json!({
            "claim_id": claim_id,
            "outcome": "No",
            "min_shares": "1"
        }))
        .deposit(NearToken::from_millinear(300))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    let bad_slippage = attacker
        .call(contract.id(), "buy")
        .args_json(json!({
            "claim_id": claim_id,
            "outcome": "Yes",
            "min_shares": u128::MAX.to_string()
        }))
        .deposit(NearToken::from_millinear(100))
        .max_gas()
        .transact()
        .await?;
    assert!(bad_slippage.is_failure());

    creator
        .call(contract.id(), "escalate")
        .args_json(json!({ "claim_id": claim_id }))
        .deposit(NearToken::from_near(2))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    let bad_ruling = attacker
        .call(contract.id(), "submit_ruling")
        .args_json(json!({
            "claim_id": claim_id,
            "verdict": "True",
            "attestation_hash": "spoof"
        }))
        .transact()
        .await?;
    assert!(bad_ruling.is_failure());

    resolver
        .call(contract.id(), "submit_ruling")
        .args_json(json!({
            "claim_id": claim_id,
            "verdict": "Unresolved",
            "attestation_hash": "tee_att_unresolved"
        }))
        .transact()
        .await?
        .into_result()?;

    worker.fast_forward(15).await?;
    creator
        .call(contract.id(), "settle")
        .args_json(json!({ "claim_id": claim_id }))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    let yb = yes_trader.view_account().await?.balance;
    yes_trader
        .call(contract.id(), "redeem")
        .args_json(json!({ "claim_id": claim_id, "epoch": 1 }))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    assert!(yes_trader.view_account().await?.balance > yb);

    let nb = no_trader.view_account().await?.balance;
    no_trader
        .call(contract.id(), "redeem")
        .args_json(json!({ "claim_id": claim_id, "epoch": 1 }))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    assert!(no_trader.view_account().await?.balance > nb);

    Ok(())
}

