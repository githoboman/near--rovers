#[cfg(test)]
mod tests {
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::{AccountId, NearToken, PromiseResult, testing_env};

    use crate::Contract;
    use crate::amm::{U256, price_e6, quote_buy, quote_sell};
    use crate::types::{
        ClaimStatus, DEFAULT_CHALLENGE_WINDOW_NS, DEFAULT_ESCALATION_BOND, MarketStatus, Outcome,
        PRICE_SCALE, Verdict,
    };

    fn acc(s: &str) -> AccountId {
        s.parse().unwrap()
    }

    fn near(n: u128) -> NearToken {
        NearToken::from_near(n)
    }

    fn millinear(m: u128) -> NearToken {
        NearToken::from_millinear(m)
    }

    fn set_ctx(predecessor: &str, deposit: NearToken, timestamp_ns: u64) {
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id(acc("perpetua.testnet"))
            .signer_account_id(acc(predecessor))
            .predecessor_account_id(acc(predecessor))
            .attached_deposit(deposit)
            .block_timestamp(timestamp_ns);
        testing_env!(builder.build());
    }

    fn setup_contract() -> Contract {
        set_ctx("owner.testnet", NearToken::from_yoctonear(0), 1_000_000_000);
        Contract::new(
            acc("owner.testnet"),
            acc("resolver.testnet"),
            Some(100), // 1%
            Some(near(1).as_yoctonear().into()),
            Some(DEFAULT_CHALLENGE_WINDOW_NS.into()),
        )
    }

    #[test]
    fn u256_isqrt_and_mul_div_exact() {
        for x in [0u128, 1, 2, 3, 4, 8, 9, 10, 15, 16, 17, 999_999, 1_000_000] {
            let ux = U256::from_u128(x);
            let fl = ux.isqrt_floor().to_u128().unwrap();
            let cl = ux.isqrt_ceil().unwrap().to_u128().unwrap();
            assert!(fl * fl <= x);
            assert!((fl + 1) * (fl + 1) > x);
            if fl * fl == x {
                assert_eq!(cl, fl);
            } else {
                assert_eq!(cl, fl + 1);
            }
        }

        // Large 10^52 product (typical yoctoNEAR reserve product)
        let r = near(100).as_yoctonear(); // 10^26
        let prod = U256::mul_u128(r, r);
        let root = prod.isqrt_floor().to_u128().unwrap();
        assert_eq!(root, r);
        assert_eq!(prod.div_floor_u128(r).unwrap(), r);

        // Overflow safety on u128::MAX
        let max_prod = U256::mul_u128(u128::MAX, u128::MAX);
        assert!(max_prod.to_u128().is_none());
        assert_eq!(max_prod.div_floor_u128(u128::MAX).unwrap(), u128::MAX);
        assert!(max_prod.div_floor_u128(1).is_none());
        assert!(max_prod.div_floor_u128(0).is_none());
    }

    #[test]
    fn amm_invariants_no_free_lunch_and_edge_cases() {
        let seed = near(1).as_yoctonear();
        let (p_yes0, p_no0) = price_e6(seed, seed).unwrap();
        assert_eq!(p_yes0, 500_000);
        assert_eq!(p_no0, 500_000);

        // Buy YES moves YES price up
        let buy_in = millinear(200).as_yoctonear();
        let bq = quote_buy(seed, seed, buy_in, Outcome::Yes, 100).unwrap();
        assert!(bq.post_yes_price_e6 > 500_000);
        assert_eq!(bq.post_yes_price_e6 + bq.post_no_price_e6, PRICE_SCALE as u32);
        assert!(
            U256::mul_u128(bq.new_yes_reserve, bq.new_no_reserve) >= U256::mul_u128(seed, seed)
        );

        // Immediate round-trip sell must strictly lose to fees/rounding
        let sq = quote_sell(
            bq.new_yes_reserve,
            bq.new_no_reserve,
            bq.shares_out,
            Outcome::Yes,
            100,
        )
        .unwrap();
        assert!(sq.net_collateral < buy_in);
        assert!(
            U256::mul_u128(sq.new_yes_reserve, sq.new_no_reserve)
                >= U256::mul_u128(bq.new_yes_reserve, bq.new_no_reserve)
        );

        // Edge cases: zero input, huge overflow, dust
        assert!(quote_buy(seed, seed, 0, Outcome::Yes, 100).is_none());
        assert!(quote_buy(seed, seed, 1, Outcome::Yes, 100).is_none()); // 1 yocto minus fee=1 -> net=0
        assert!(quote_buy(seed, seed, u128::MAX, Outcome::Yes, 100).is_some());
        assert!(quote_buy(seed, seed, u128::MAX, Outcome::Yes, 0).is_none());
        assert!(quote_buy(u128::MAX / 2, u128::MAX / 2, u128::MAX, Outcome::Yes, 100).is_none());
        assert!(quote_sell(seed, seed, 0, Outcome::Yes, 100).is_none());
        assert!(quote_sell(seed, seed, u128::MAX, Outcome::Yes, 100).is_none());
    }

    #[test]
    fn happy_path_buy_sell_page_hash_and_storage_accounting() {
        let mut c = setup_contract();

        // Create claim with 1 NEAR (covers storage + initial seed liquidity)
        set_ctx("alice.testnet", near(1), 10_000_000_000);
        let claim_id = c.create_claim(
            "Protocol X completed a Trail of Bits audit in 2025".to_string(),
            vec!["https://example.org/audit.pdf".to_string()],
            "audit_status".to_string(),
            60_000_000_000u64.into(),
        );
        assert_eq!(claim_id, 1);
        let claim = c.get_claim(1).unwrap();
        assert_eq!(claim.current_epoch, 1);
        assert_eq!(claim.status, ClaimStatus::Open);
        assert_eq!(claim.text_hash.len(), 64);

        let m0 = c.get_market(1, None).unwrap();
        assert!(m0.yes_reserve.0 > 0);
        assert_eq!(m0.yes_reserve, m0.no_reserve);
        assert_eq!(m0.yes_price_e6, 500_000);

        // Bob buys YES
        set_ctx("bob.testnet", millinear(500), 15_000_000_000);
        let shares = c.buy(1, Outcome::Yes, 1u128.into());
        assert!(shares.0 > 0);

        let p1 = c.get_price(1, None);
        assert!(p1.yes_price_e6 > 500_000);
        assert_eq!(p1.yes_bps + p1.no_bps, 10_000);

        // Verify exact vault backing invariant: outstanding + reserve == vault
        let m1 = c.get_market(1, None).unwrap();
        assert_eq!(m1.outstanding_yes.0 + m1.yes_reserve.0, m1.collateral_vault.0);
        assert_eq!(m1.outstanding_no.0 + m1.no_reserve.0, m1.collateral_vault.0);

        // Bob sells half
        set_ctx("bob.testnet", NearToken::from_yoctonear(0), 20_000_000_000);
        let _ = c.sell(1, Outcome::Yes, (shares.0 / 2).into(), 1u128.into());
        let p2 = c.get_price(1, None);
        assert!(p2.yes_price_e6 < p1.yes_price_e6);
        let m2 = c.get_market(1, None).unwrap();
        assert_eq!(m2.outstanding_yes.0 + m2.yes_reserve.0, m2.collateral_vault.0);
        assert_eq!(m2.outstanding_no.0 + m2.no_reserve.0, m2.collateral_vault.0);

        // Resolver updates page hash
        set_ctx("resolver.testnet", NearToken::from_yoctonear(0), 25_000_000_000);
        c.set_page_hash(1, "abcd1234".to_string());
        assert_eq!(c.get_claim(1).unwrap().page_hash.unwrap(), "abcd1234");
    }

    #[test]
    fn escalation_challenger_wins_challenge_window_and_next_epoch() {
        let mut c = setup_contract();

        set_ctx("creator.testnet", near(2), 1_000_000_000);
        let id = c.create_claim(
            "Protocol Y TVL exceeded $1B on mainnet".to_string(),
            vec!["https://defillama.com/protocol/y".to_string()],
            "tvl".to_string(),
            3_600_000_000_000u64.into(),
        );

        // Bob buys YES pushing price > 50%
        set_ctx("bob.testnet", near(1), 2_000_000_000);
        let bob_yes = c.buy(id, Outcome::Yes, 1u128.into());

        // Carol buys NO
        set_ctx("carol.testnet", millinear(200), 3_000_000_000);
        let carol_no = c.buy(id, Outcome::No, 1u128.into());

        let m_before = c.get_market(id, Some(1)).unwrap();
        assert!(m_before.yes_price_e6 > 500_000);
        assert!(m_before.fee_pool.0 > 0);

        // Dave escalates (omits side -> contrarian No; wait let's test explicit Yes win first)
        set_ctx("dave.testnet", near(2), 4_000_000_000);
        c.escalate(id, Some(Outcome::Yes));
        let m_esc = c.get_market(id, Some(1)).unwrap();
        assert_eq!(m_esc.status, MarketStatus::Escalated);
        assert_eq!(m_esc.challenger_side, Some(Outcome::Yes));

        // Resolver submits Verdict::True
        set_ctx("resolver.testnet", NearToken::from_yoctonear(0), 5_000_000_000);
        c.submit_ruling(id, Verdict::True, "att_hash_true".to_string());
        let m_ruled = c.get_market(id, Some(1)).unwrap();
        assert_eq!(m_ruled.status, MarketStatus::Ruled);
        let deadline = m_ruled.challenge_deadline.unwrap().0;

        // Settle after challenge window
        set_ctx("anyone.testnet", NearToken::from_yoctonear(0), deadline);
        let _ = c.settle(id);

        // Epoch 1 is Settled, Epoch 2 is Open with retained liquidity
        let m1_settled = c.get_market(id, Some(1)).unwrap();
        assert_eq!(m1_settled.status, MarketStatus::Settled);
        assert!(m1_settled.retained_liquidity.0 > 0);
        assert_eq!(c.get_jury_cost_fund().0, 0); // challenger won -> not slashed

        let claim_after = c.get_claim(id).unwrap();
        assert_eq!(claim_after.current_epoch, 2);
        assert_eq!(claim_after.status, ClaimStatus::Open);
        let m2 = c.get_market(id, Some(2)).unwrap();
        assert_eq!(m2.status, MarketStatus::Open);
        assert_eq!(m2.yes_reserve, m1_settled.retained_liquidity);

        // Bob redeems winning YES shares from epoch 1
        set_ctx("bob.testnet", NearToken::from_yoctonear(0), deadline + 1);
        let _ = c.redeem(id, Some(1));
        let bob_pos = c.get_position(id, acc("bob.testnet"), Some(1));
        assert_eq!(bob_pos.yes_shares.0, 0);
        assert!(bob_yes.0 > 0 && carol_no.0 > 0);
        assert_eq!(c.get_market(id, Some(1)).unwrap().collateral_vault.0, 0);
    }

    #[test]
    fn escalation_challenger_wrong_slashes_bond_and_counter_challenge_works() {
        let mut c = setup_contract();

        set_ctx("creator.testnet", near(2), 1_000_000_000);
        let id = c.create_claim(
            "Founders of Protocol Z are doxxed".to_string(),
            vec!["https://example.org/team".to_string()],
            "authorship".to_string(),
            3_600_000_000_000u64.into(),
        );

        // Dave escalates asserting YES with 1 NEAR bond
        set_ctx("dave.testnet", near(2), 2_000_000_000);
        c.escalate(id, Some(Outcome::Yes));

        // Resolver submits Verdict::False
        set_ctx("resolver.testnet", NearToken::from_yoctonear(0), 3_000_000_000);
        c.submit_ruling(id, Verdict::False, "att_1".to_string());

        // Erin counter-challenges inside challenge window asserting YES (wrong!) with 2 NEAR bond
        set_ctx("erin.testnet", near(3), 4_000_000_000);
        c.challenge_ruling(id, Some(Outcome::Yes));
        assert_eq!(c.get_market(id, Some(1)).unwrap().status, MarketStatus::Escalated);

        // Resolver re-confirms Verdict::False
        set_ctx("resolver.testnet", NearToken::from_yoctonear(0), 5_000_000_000);
        c.submit_ruling(id, Verdict::False, "att_2".to_string());
        let deadline = c.get_market(id, Some(1)).unwrap().challenge_deadline.unwrap().0;

        // Settle: BOTH Dave (1 NEAR) and Erin (2 NEAR) were wrong -> 3 NEAR slashed to jury_cost_fund!
        set_ctx("anyone.testnet", NearToken::from_yoctonear(0), deadline);
        let _ = c.settle(id);
        assert_eq!(c.get_jury_cost_fund().0, near(3).as_yoctonear());
    }

    #[test]
    fn unresolved_ruling_redeems_at_snapshot_price_and_stays_solvent() {
        let mut c = setup_contract();

        set_ctx("creator.testnet", near(2), 1_000_000_000);
        let id = c.create_claim(
            "Protocol Q has hidden admin multisig".to_string(),
            vec!["https://example.org/docs".to_string()],
            "audit_status".to_string(),
            3_600_000_000_000u64.into(),
        );

        // Bob buys YES, Carol buys NO
        set_ctx("bob.testnet", near(1), 2_000_000_000);
        let _ = c.buy(id, Outcome::Yes, 1u128.into());
        set_ctx("carol.testnet", millinear(400), 3_000_000_000);
        let _ = c.buy(id, Outcome::No, 1u128.into());

        // Escalate -> snapshots price
        set_ctx("dave.testnet", near(2), 4_000_000_000);
        c.escalate(id, None);
        let snap = c.get_market(id, Some(1)).unwrap().snap_yes_price_e6.unwrap();

        // Resolver submits Verdict::Unresolved
        set_ctx("resolver.testnet", NearToken::from_yoctonear(0), 5_000_000_000);
        c.submit_ruling(id, Verdict::Unresolved, "att_unresolved".to_string());
        let deadline = c.get_market(id, Some(1)).unwrap().challenge_deadline.unwrap().0;

        set_ctx("anyone.testnet", NearToken::from_yoctonear(0), deadline);
        let _ = c.settle(id);

        // Both Bob and Carol redeem at snapshotted price; vault never underflows!
        set_ctx("bob.testnet", NearToken::from_yoctonear(0), deadline + 1);
        let _ = c.redeem(id, Some(1));
        set_ctx("carol.testnet", NearToken::from_yoctonear(0), deadline + 2);
        let _ = c.redeem(id, Some(1));

        let m_end = c.get_market(id, Some(1)).unwrap();
        assert_eq!(m_end.snap_yes_price_e6, Some(snap));
        assert!(m_end.collateral_vault.0 <= 2); // at most <=2 yocto rounding dust
    }

    #[test]
    fn failed_transfer_callback_credits_claimable_refund_without_panicking() {
        let mut c = setup_contract();

        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id(acc("perpetua.testnet"))
            .predecessor_account_id(acc("perpetua.testnet"));
        testing_env!(
            builder.build(),
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            Default::default(),
            vec![PromiseResult::Failed]
        );

        let out = c.on_transfer_complete(acc("bob.testnet"), millinear(250).as_yoctonear().into());
        assert_eq!(out.0, 0);
        assert_eq!(
            c.get_claimable_refund(acc("bob.testnet")).0,
            millinear(250).as_yoctonear()
        );

        // Withdraw clears refund balance before transfer
        set_ctx("bob.testnet", NearToken::from_yoctonear(0), 10_000_000_000);
        let _ = c.withdraw_refund();
        assert_eq!(c.get_claimable_refund(acc("bob.testnet")).0, 0);
    }

    #[test]
    #[should_panic(expected = "Only resolver account can submit rulings")]
    fn non_resolver_cannot_submit_ruling() {
        let mut c = setup_contract();
        set_ctx("creator.testnet", near(2), 1_000_000_000);
        let id = c.create_claim(
            "Test claim".to_string(),
            vec![],
            "audit_status".to_string(),
            10_000_000_000u64.into(),
        );
        set_ctx("dave.testnet", near(2), 2_000_000_000);
        c.escalate(id, None);
        set_ctx("attacker.testnet", NearToken::from_yoctonear(0), 3_000_000_000);
        c.submit_ruling(id, Verdict::True, "fake".to_string());
    }

    #[test]
    #[should_panic(expected = "Challenge window has not expired yet")]
    fn cannot_settle_before_challenge_window_expires() {
        let mut c = setup_contract();
        set_ctx("creator.testnet", near(2), 1_000_000_000);
        let id = c.create_claim(
            "Test claim".to_string(),
            vec![],
            "audit_status".to_string(),
            10_000_000_000u64.into(),
        );
        set_ctx("dave.testnet", near(2), 2_000_000_000);
        c.escalate(id, None);
        set_ctx("resolver.testnet", NearToken::from_yoctonear(0), 3_000_000_000);
        c.submit_ruling(id, Verdict::True, "hash".to_string());
        set_ctx("anyone.testnet", NearToken::from_yoctonear(0), 3_000_000_001);
        let _ = c.settle(id);
    }

    #[test]
    fn uncontested_epoch_advances_after_epoch_end() {
        let mut c = setup_contract();
        set_ctx("creator.testnet", near(2), 1_000_000_000);
        let id = c.create_claim(
            "Test claim".to_string(),
            vec![],
            "audit_status".to_string(),
            10_000_000_000u64.into(),
        );
        set_ctx("anyone.testnet", NearToken::from_yoctonear(0), 12_000_000_000);
        let next = c.advance_epoch(id);
        assert_eq!(next, 2);
        assert_eq!(c.get_claim(id).unwrap().current_epoch, 2);
        assert_eq!(c.get_market(id, Some(1)).unwrap().status, MarketStatus::Settled);
        assert_eq!(c.get_market(id, Some(2)).unwrap().status, MarketStatus::Open);
    }

    #[test]
    fn default_bond_constant_matches_spec() {
        assert_eq!(DEFAULT_ESCALATION_BOND, millinear(500).as_yoctonear());
    }
}

