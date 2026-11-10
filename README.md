# Perpetua

An AI-generated encyclopedia on NEAR Testnet where every factual claim is backed by a perpetual binary prediction market. Market probabilities act as live confidence scores, AI pages re-render as probabilities move, and contested claims are settled optimistically by an attested multi-model AI jury via NEAR AI Cloud.

> **Testnet Only.** No real funds are used. All contract deposits and trades use NEAR Testnet native NEAR behind a collateral abstraction.

---

## Monorepo Layout

```text
perpetua/
├── contract/     # Phase 1: Rust smart contract (near-sdk 5.30.1 + near-workspaces 0.24.0)
├── services/     # Phase 2 (+ Phase 4 helper): TypeScript indexer, NEAR AI Cloud jury runner, page generator, HTTP API
├── web/          # Phase 3: Next.js + @hot-labs/near-connect frontend
├── .env.example
└── README.md
```

---

## Decisions

Per project rule #4, ambiguous design choices were resolved with the simplest sound option:

1. **Collateral abstraction (`NativeNear` first, `Nep141` slot ready):** Collateral deposits and callback-guarded payouts go through [`contract/src/collateral.rs`](contract/src/collateral.rs) (`CollateralAsset::NativeNear` for MVP; `CollateralAsset::Nep141 { token_id }` stubbed cleanly for post-MVP `ft_on_transfer` / `ft_transfer`).
2. **Complete-set + Constant-Product (`x * y = k`) binary AMM:**
   - Every complete set (`1 YES + 1 NO`) is backed 1-to-1 by `1 yoctoNEAR` inside `Market.collateral_vault`, ensuring 100% solvency across `True`, `False`, and `Unresolved` outcomes.
   - `p_yes = no_reserve / (yes_reserve + no_reserve)` in `1e6` fixed-point scale (`PRICE_SCALE = 1_000_000`, with `p_no = 1_000_000 - p_yes`).
   - All math uses checked `u128` and an internal 256-bit unsigned integer (`U256`) with zero floating-point operations. Rounding always favors the invariant (`k_after >= k_before`) and reserve floors (`MIN_RESERVE = 1_000_000`).
3. **Trading fees segregated from share backing:** Trading fees (`fee_bps`, default `100` bps = 1%) accrue in `Market.fee_pool` separately from `collateral_vault` so share redemptions can never dip into fee rewards or vice versa.
4. **Storage staking accounting:** `create_claim`, `buy`, `escalate`, `challenge_ruling`, and `seed_next_epoch` flush `near_sdk::store` collections and measure exact `env::storage_usage()` deltas, deducting `delta * env::storage_byte_cost()` from the caller's attached deposit before crediting collateral/bonds.
5. **Escalation side & bond outcomes:**
   - `escalate(claim_id, asserted_outcome)` accepts an optional `asserted_outcome`; if omitted, it defaults to the contrarian side against the prevailing market price (`No` if `yes_price_e6 >= 500_000`, else `Yes`).
   - If the challenger's side matches the final verdict, the challenger receives their bond plus `50%` (`5000` bps) of `fee_pool`; the remaining fee pool seeds the next epoch.
   - If the challenger's side is wrong, their bond is slashed into `jury_cost_fund`.
   - If the verdict is `Unresolved`, bonds are returned (no reward, no slash) and YES/NO shares redeem at the fixed-point price `snap_yes_price_e6` recorded at escalation.
6. **Challenge window & counter-challenges:**
   - `submit_ruling` moves the market from `Escalated` to `Ruled` and opens `challenge_deadline = now + challenge_window_ns` (default 5 minutes).
   - Before `challenge_deadline`, `challenge_ruling` allows one counter-challenge (`>= 2x escalation_bond`) asserting an outcome different from the disputed ruling, returning the market to `Escalated` for re-ruling.
   - `settle` can only run once `now >= challenge_deadline`.
7. **Perpetual epochs & historical redemption:**
   - Upon `settle`, epoch `E` records `MarketStatus::Settled` while unencumbered pool collateral (`collateral_vault - trader_liability`) plus leftover fees seed epoch `E + 1` at 50/50 reserves whenever `next_seed >= MIN_SEED_LIQUIDITY` (`0.01 NEAR`). Users holding epoch `E` winning shares can call `redeem(claim_id, Some(epoch))` anytime.
   - Uncontested epochs with no active positions can roll forward after `epoch_end` via `advance_epoch(claim_id)`.
8. **Safe async callbacks:** Outbound NEAR transfers in `sell`, `redeem`, `settle`, `withdraw_refund`, and `withdraw_jury_fund` follow Checks-Effects-Interactions and attach `#[private] on_transfer_complete`. If a transfer receipt fails, the callback never panics; it credits `claimable_refunds[recipient]` for pull recovery via `withdraw_refund()`.
9. **Page hash access control:** `set_page_hash(claim_id, hash)` is restricted to `resolver_account_id` or `owner_id` to prevent arbitrary hash spoofing.
10. **Storage collections:** Uses `near_sdk::store::{IterableMap, LookupMap}` (the current non-legacy SDK collections) instead of deprecated `near_sdk::collections::UnorderedMap`.
11. **Rust toolchain compatibility:** `contract/rust-toolchain.toml` pins `1.97.1` with `wasm32-unknown-unknown` to satisfy `near-sdk 5.30.1` and `near-workspaces 0.24.0` (`rust-version = "1.95"`, `edition = "2024"`).
12. **Offchain indexing & SQLite via Node built-ins:** [`services/`](services/) polls contract view state via `near-api-js` (`JsonRpcProvider`) into Node's built-in `node:sqlite` (`DatabaseSync`), avoiding external indexer API rate limits and native C++ SQLite addon builds on Windows.
13. **Direct NEAR AI Cloud REST + Ed25519 verification:** Rather than bundling `@nearai/inference-sdk` (which documents Node `>= 24.22.1` vs local Node `24.11.1`), [`services/src/ai/nearAiClient.ts`](services/src/ai/nearAiClient.ts) calls `GET /v1/attestation/report`, `POST /v1/chat/completions` (`stream: false`, `x-no-aliasing: true`, raw byte preservation), and `GET /v1/signature/{chat_id}` (`signing_algo=ed25519`), checking preflight nonce/signer binding and verifying Ed25519 signatures over `SHA-256(exact_bytes)` with `node:crypto`.
14. **Default TEE jury & page models:** Defaults to three distinct NEAR-hosted (`owned_by: "nearai"`) chat models verified in `/v1/models` — `deepseek-ai/DeepSeek-V4.1-Flash-1017`, `Qwen/Qwen3.8-27B`, and `z-ai/glm-5.3-flash` — requiring a `ceil(2N/3)` (`2/3`) supermajority and falling back to `Verdict::Unresolved` on split/abstention. Models, supermajority ratio, RPC URL, and DB path are configurable via `.env`.

---

## Phase 1: Smart Contract (`contract/`)

### Built Components
- [`contract/src/types.rs`](contract/src/types.rs): `Claim`, `Market`, `Position`, `Verdict`, `Outcome`, status enums, `CollateralAsset`, and JSON view types.
- [`contract/src/amm.rs`](contract/src/amm.rs): Checked `U256` arithmetic (`mul_u128`, `div_rem`, `isqrt_floor`/`isqrt_ceil`), `price_e6`, `quote_buy`, and `quote_sell`.
- [`contract/src/collateral.rs`](contract/src/collateral.rs): Collateral deposit extraction, excess refund, and callback-safe payout adapter.
- [`contract/src/events.rs`](contract/src/events.rs): NEP-297 `perpetua` event logs (`ClaimCreated`, `TradeExecuted`, `ClaimEscalated`, `RulingSubmitted`, `RulingChallenged`, `EpochSettled`, `EpochAdvanced`, `SharesRedeemed`, `PageHashUpdated`, `TransferFailedRefundCredited`).
- [`contract/src/market.rs`](contract/src/market.rs) & [`contract/src/lib.rs`](contract/src/lib.rs): Contract entrypoint methods and access controls.
- [`contract/src/tests.rs`](contract/src/tests.rs): In-process unit & VMContext tests covering AMM invariants, overflow/rounding edges, escalation both ways, counter-challenge window, `UNRESOLVED` snapshot redemption, and failed async callback recovery.
- [`contract/workspaces-tests/tests/workspaces.rs`](contract/workspaces-tests/tests/workspaces.rs): `near-workspaces-rs` sandbox integration tests (`default-features = false, features = ["rustls"]` so the contract crate itself builds cleanly on Windows).

### Commands & Verified Build Notes

```bash
cd contract
# Build on-chain WASM artifact (sets #[cfg(near)] host functions)
RUSTFLAGS="--cfg near" cargo build --target wasm32-unknown-unknown --release

# Run unit tests (Windows uses contract/.cargo/config.toml AWS_LC_SYS_PREBUILT_NASM=1)
cargo test --lib

# Run near-workspaces sandbox integration tests (Linux / macOS / WSL2)
cd workspaces-tests && cargo test
```

Verified locally:
- `cargo test --lib`: **11 passed, 0 failed** (`1.92s`).
- `RUSTFLAGS="--cfg near" cargo build --target wasm32-unknown-unknown --release`: compiled `perpetua_contract.wasm` (**530,951 bytes**).

---

## Phase 2: Offchain Services (`services/`)

### Built Components
- [`services/src/config.ts`](services/src/config.ts) & [`services/src/types.ts`](services/src/types.ts): Environment loader (`NEAR_CONTRACT_ID`, `NEAR_RESOLVER_PRIVATE_KEY`, `NEAR_AI_API_KEY`, `JURY_MODELS`, `PAGE_MODEL`, `PERPETUA_DB_PATH`, `SERVICES_PORT`) and exact contract-aligned types.
- [`services/src/db/index.ts`](services/src/db/index.ts): SQLite store (`claims`, `markets`, `price_history`, `jury_rulings`, `jury_model_outputs`, `generated_pages`, `indexer_state`).
- [`services/src/near/client.ts`](services/src/near/client.ts): `near-api-js@7.4.0` RPC reader (`JsonRpcProvider`) + resolver transaction signer (`Account.callFunction`) for `create_claim`, `buy`, `escalate`, `submit_ruling`, `settle`, `set_page_hash`.
- [`services/src/ai/nearAiClient.ts`](services/src/ai/nearAiClient.ts): NEAR AI Cloud preflight attestation fetcher, raw-byte SHA-256 request/response hasher, and `node:crypto` Ed25519 signature verifier (`provider_tee` and `gateway` payloads).
- [`services/src/indexer/index.ts`](services/src/indexer/index.ts): Contract state & price-history poller.
- [`services/src/jury/index.ts`](services/src/jury/index.ts): Evidence packet builder, parallel 3-model TEE jury runner, supermajority tallier, raw-output & attestation archival, and `submit_ruling` submitter.
- [`services/src/generator/index.ts`](services/src/generator/index.ts): Confidence-annotated article synthesizer computing `sha256(snapshot + prompt + model)` and publishing via `set_page_hash`.
- [`services/src/server.ts`](services/src/server.ts) & [`services/src/orchestrator.ts`](services/src/orchestrator.ts): Dependency-free `node:http` API exposing `/health`, `/api/claims`, `/api/claims/:id`, `/api/claims/:id/sync`, plus Phase 4 1Click preview routes `/api/intents/tokens` and `/api/intents/quote` (`dry: true` enforced on testnet).
- [`services/src/scripts/seed-claims.ts`](services/src/scripts/seed-claims.ts) & [`services/src/scripts/demo-price-mover.ts`](services/src/scripts/demo-price-mover.ts): 24 contested Web3 claim seeder and live trade -> re-index -> page-rewrite demonstration script.

### Commands & Verified Test Notes

```bash
cd services
pnpm install
pnpm typecheck
pnpm test
pnpm dev
```

Verified locally:
- `npx tsc --noEmit`: **0 errors**.
- `node --test tests/*.test.ts`: **5 passed, 0 failed** (`AMM integer parity`, `SQLite DB persistence & price deduplication`, `Jury supermajority tally`, `NEAR AI Cloud client + Jury + Page Generator` against a cryptographic Ed25519 mock gateway/model server, and `Phase 4 OneClick Intents preview safety`).

---

## Phase 3: Frontend (`web/`)

### Built Components
- **Wallet Integration ([`web/src/providers/NearProvider.tsx`](web/src/providers/NearProvider.tsx), [`web/src/lib/near.ts`](web/src/lib/near.ts)):** `@hot-labs/near-connect` (`NearConnector({ network: "testnet" })`) for wallet sign-in and `FunctionCall` transactions, paired with `near-api-js` `JsonRpcProvider` for RPC views.
- **Store & Math Parity ([`web/src/lib/amm.ts`](web/src/lib/amm.ts), [`web/src/providers/PerpetuaStore.tsx`](web/src/providers/PerpetuaStore.tsx)):** Exact `bigint` CPMM (`x * y = k`) math matching `contract/src/amm.rs`, supporting both **Live Testnet** mode (via `/services` API or direct RPC fallback) and **Demo Ledger** mode (with 24 seeded Web3 protocol claims across audit status, authorship, and TVL).
- **Views (`web/src/app/` & `web/src/components/`):**
  - Encyclopedia claim list with category/status filters and KPI strip (`/`)
  - Claim detail workspace (`/claims/[id]`): AI article with inline sentence confidence highlighting, custom SVG price history chart, buy/sell CPMM widget, optimistic escalation + jury display + settlement/redemption controls, and interactive Demo Script buttons that move prices and rewrite article prose
  - New Claim submission page (`/create`)

*(Frontend build & typecheck verification pending dependency installation completion.)*

---

## Known Limitations

- **`near-sandbox-rs` platform support:** `near-workspaces` integration tests require Linux (`x86_64`/`aarch64`) or macOS (`arm64`) at runtime because `near-sandbox-rs` does not ship a native Windows sandbox binary. On Windows, `cargo test --lib` runs full `VMContextBuilder` unit tests.
- **Intel TDX DCAP quote chain offline verification:** [`services/src/ai/nearAiClient.ts`](services/src/ai/nearAiClient.ts) verifies preflight nonce echoing, signer matching, raw-byte SHA-256 hashes, and Ed25519 response signatures locally, while full Intel DCAP certificate-chain / NVIDIA GPU NRAS quote validation (`dcap-qvl`, Rust/WASM) is left for a verifier sidecar post-MVP.
- **Uncontested epoch rollover with open positions:** `advance_epoch` only rolls over an uncontested `Open` market when `outstanding_yes == 0 && outstanding_no == 0`; markets with open positions require escalation/settlement so existing shareholders are properly settled.
- **Per-epoch market reset price:** When epoch `E` settles and seeds epoch `E + 1`, the new epoch initializes at 50/50 (`500_000` e6) reserves rather than carrying over an arbitrary skew from the resolved epoch.
- **NEAR Intents Testnet gap (Phase 4):** NEAR Intents / 1Click Swap API does not offer a testnet deployment; cross-chain deposit routes enforce `dry: true` preview quotes in testnet mode.
