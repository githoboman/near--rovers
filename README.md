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
14. **Default TEE jury & page models:** Defaults to three distinct NEAR-hosted (`owned_by: "nearai"`) Confidential TEE models verified in `/v1/models` — `deepseek-ai/DeepSeek-V4.1-Flash-1017`, `Qwen/Qwen3.6-35B-A3B-FP8`, and `z-ai/glm-5.3-flash` — requiring a `ceil(2N/3)` (`2/3`) supermajority and falling back to `Verdict::Unresolved` on split/abstention, with `Qwen/Qwen3-VL-30B-A3B-Instruct` as the low-latency non-reasoning page generator. Live tests showed `Qwen/Qwen3.8-27B` consumes `>3000` reasoning tokens before emitting JSON; `JURY_MODELS`, `PAGE_MODEL`, supermajority ratio, RPC URL, and DB path are configurable via `.env`.
15. **Cited evidence packet fetching:** [`JuryService`](services/src/jury/index.ts) performs bounded (`10s` timeout, public `https://` only, private/localhost blocked, HTML-stripped `<= 2800` chars) source excerpt snapshots into the hashed `evidence_packet_json` so jurors evaluate actual cited page content alongside claim text and price history.

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

- `cargo test --lib`: **13 passed, 0 failed** (`2.41s`).
- `RUSTFLAGS="--cfg near" cargo build --target wasm32-unknown-unknown --release`: compiled `perpetua_contract.wasm` (**305,707 bytes** with `strip = "symbols"` and opt-level = "z").

---

## Phase 2: Offchain Services (`services/`)

### Built Components

- [`services/src/config.ts`](services/src/config.ts) & [`services/src/types.ts`](services/src/types.ts): Environment loader (`NEAR_CONTRACT_ID`, `NEAR_RESOLVER_PRIVATE_KEY`, `NEAR_AI_API_KEY`, `JURY_MODELS`, `PAGE_MODEL`, `PERPETUA_DB_PATH`, `SERVICES_PORT`) and exact contract-aligned types.
- [`services/src/db/index.ts`](services/src/db/index.ts): SQLite store (`claims`, `markets`, `price_history`, `jury_rulings`, `jury_model_outputs`, `generated_pages`, `indexer_state`).
- [`services/src/near/client.ts`](services/src/near/client.ts): `near-api-js@7.4.0` RPC reader (`JsonRpcProvider`) + resolver transaction signer (`Account.callFunction`) for `create_claim`, `buy`, `escalate`, `submit_ruling`, `settle`, `redeem`, `set_page_hash`, and `getPosition`.
- [`services/src/ai/nearAiClient.ts`](services/src/ai/nearAiClient.ts): NEAR AI Cloud preflight attestation fetcher, raw-byte SHA-256 request/response hasher, and `node:crypto` Ed25519 signature verifier (`provider_tee` and `gateway` payloads).
- [`services/src/indexer/index.ts`](services/src/indexer/index.ts): Contract state & price-history poller.
- [`services/src/jury/index.ts`](services/src/jury/index.ts): Evidence packet builder, parallel 3-model TEE jury runner, supermajority tallier, raw-output & attestation archival, and `submit_ruling` submitter.
- [`services/src/generator/index.ts`](services/src/generator/index.ts): Confidence-annotated article synthesizer computing `sha256(snapshot + prompt + model)` and publishing via `set_page_hash`.
- [`services/src/server.ts`](services/src/server.ts) & [`services/src/orchestrator.ts`](services/src/orchestrator.ts): Dependency-free `node:http` API exposing `/health`, `/api/claims`, `/api/claims/:id`, `/api/claims/:id/sync`, plus Phase 4 1Click preview routes `/api/intents/tokens` and `/api/intents/quote` (`dry: true` enforced on testnet).
- [`services/src/scripts/seed-claims.ts`](services/src/scripts/seed-claims.ts), [`services/src/scripts/deploy-testnet.ts`](services/src/scripts/deploy-testnet.ts), [`services/src/scripts/demo-price-mover.ts`](services/src/scripts/demo-price-mover.ts) & [`services/src/scripts/e2e-testnet.ts`](services/src/scripts/e2e-testnet.ts): pure-Node contract deployer, 24 contested Web3 claim seeder, price-mover script, and full live Testnet end-to-end verification runner.

### Commands & Verified Test Notes

```bash
cd services
pnpm install
pnpm typecheck
pnpm test
pnpm dev
```

Verified locally:

- `tsc --noEmit`: **0 errors**.
- `node --test tests/*.test.ts`: **6 passed, 0 failed** (`AMM integer parity`, `SQLite DB persistence & price deduplication`, `Jury supermajority tally`, `SSRF private-URL filter`, `NEAR AI Cloud client + Jury + Page Generator` against a cryptographic Ed25519 mock gateway/model server, and `Phase 4 OneClick Intents preview safety`).
- Live NEAR AI Cloud TEE smoke test (`cloud-api.near.ai/v1`): Verified all 3 jury models (`deepseek-ai/DeepSeek-V4.1-Flash-1017`, `Qwen/Qwen3.6-35B-A3B-FP8`, `z-ai/glm-5.3-flash`) plus page generator (`Qwen/Qwen3-VL-30B-A3B-Instruct`) returned `signature_kind: "provider_tee"`, matched preflight attestation nonces, and passed local `node:crypto` Ed25519 signature verification (`signatureValid: true`, 4/4 calls).

---

## Phase 3: Frontend (`web/`)

### Built Components

- **Wallet Integration ([`web/src/providers/NearProvider.tsx`](web/src/providers/NearProvider.tsx), [`web/src/lib/near.ts`](web/src/lib/near.ts)):** `@hot-labs/near-connect` (`NearConnector({ network: "testnet" })`) for wallet sign-in and `FunctionCall` transactions, paired with `near-api-js` `JsonRpcProvider` for RPC views.
- **Store & Math Parity ([`web/src/lib/amm.ts`](web/src/lib/amm.ts), [`web/src/providers/PerpetuaStore.tsx`](web/src/providers/PerpetuaStore.tsx)):** Exact `bigint` CPMM (`x * y = k`) math matching `contract/src/amm.rs`, supporting both **Live Testnet** mode (via `/services` API or direct RPC fallback) and **Demo Ledger** mode (with 24 seeded Web3 protocol claims across audit status, authorship, and TVL).
- **Views (`web/src/app/` & `web/src/components/`):**
  - Encyclopedia claim list with category/status filters and KPI strip (`/`)
  - Claim detail workspace (`/claims/[id]`): AI article with inline sentence confidence highlighting, custom SVG price history chart, buy/sell CPMM widget, optimistic escalation + jury display + settlement/redemption controls, and interactive Demo Script buttons that move prices and rewrite article prose
  - New Claim submission page (`/create`) with collapsible Phase 4 [`IntentsDepositPreview`](web/src/components/IntentsDepositPreview.tsx) card (enforces `dry=true` preview quotes via [`services/src/intents/oneClick.ts`](services/src/intents/oneClick.ts))

### Commands & Verified Build Notes

```bash
cd web
pnpm install
pnpm typecheck
pnpm build
pnpm dev
```

Verified locally:

- `npx tsc --noEmit`: **0 errors**.
- `pnpm build` (`next build` 16.4.6 Turbopack): **exit 0** — compiled cleanly (`/` static, `/_not-found` static, `/claims/[id]` dynamic, `/create` static).

---

## Live NEAR Testnet Verification

- **Deployed Testnet Contract:** `570dcb106c2e8797eb86646401cffa35dd07ea08e40a49f2973453722584ff03` (`fee_bps: 100`, demo `escalation_bond: 50000000000000000000000` [0.05 NEAR], demo `challenge_window_ns: 15000000000` [15s], seeded with **24** claims via `seed-claims.ts`, `get_claims_count() === 24`).
- **End-to-End Claim #4 Execution ([`e2e-testnet.ts`](services/src/scripts/e2e-testnet.ts)):**
  1. Initial trades (`buy(No, 0.015)` + `buy(Yes, 0.025)`) + NEAR AI Cloud TEE page v1 (`79.70% YES`, `page_hash=8df90b91...`) verified on-chain via `set_page_hash`.
  2. Price-moving trade (`buy(Yes, 0.06)`) -> page v2 regenerated (`91.93% YES`, `page_hash=90c9d699...`) with updated `page_hash` verified on-chain.
  3. `escalate` (`0.05 NEAR` bond + refundable storage buffer) -> **3/3 TEE-verified models** rendered `Unresolved` verdict (`attestation_hash=6e2a6178...`) -> `submit_ruling` -> `market_status=Ruled`.
  4. Waited 15s challenge window -> `settle` finalized Epoch 1 (`Settled`) and opened **Epoch 2** -> `redeem(4, 1)` redeemed both sides down to `(YES: 0, NO: 0)`.
- **Live HTTP & Intents Check:** Verified `services` (`GET /health`, `GET /api/claims` returning `total: 24`, `GET /api/claims/4`, `GET /api/intents/tokens`, `POST /api/intents/quote` returning a live `dry=true` quote from `1click.chaindefuser.com`).

---

## Pre-Mainnet Hardening & Security Audit Fixes

A comprehensive multi-vector code audit was conducted across smart contract, offchain services, and frontend before Mainnet readiness:

| Layer | Component | Finding & Vulnerability | Remediation Applied |
| :--- | :--- | :--- | :--- |
| **Contract** | `market.rs` | Unbounded `epoch_length` could cause `u64` overflow in `opened_at + epoch_length`. | Added `MIN_EPOCH_LENGTH_NS` (10s) and `MAX_EPOCH_LENGTH_NS` (10 years) validation bounds in `create_claim_internal`. |
| **Contract** | `market.rs` | `challenge_ruling_internal` retained previous ruling's `attestation_hash`. | Reset `market.attestation_hash = None` upon counter-challenge to ensure clean state for re-ruling. |
| **Contract** | `market.rs` | Linear $O(N)$ key skip in `get_claims` pagination. | Replaced with $O(\text{limit})$ indexed key scan `start_id..end_id`. |
| **Contract** | `collateral.rs` | Direct `Promise::new(recipient).transfer()` in `refund_excess` could lock funds if caller smart contract rejects receipt. | Routed `refund_excess` through `Self::transfer_with_callback` with `claimable_refunds` fallback. |
| **Contract** | `lib.rs` | Immutable contract parameters prevented governance parameter updates. | Added `set_owner(new_owner)` and `update_config(fee_bps, escalation_bond, challenge_window_ns)` restricted to `owner_id`. |
| **Services** | `jury/index.ts` | SSRF / IP spoofing via malicious evidence URLs pointing to localhost or private cloud metadata. | Implemented strict DNS pre-resolution rejecting loopback, RFC1918/CGNAT/link-local/multicast IPs and non-HTTPS targets with a 64KB bounded stream reader. |
| **Services** | `jury/index.ts` | AI prompt injection via crafted claim texts or scraped evidence. | Escaped and wrapped untrusted strings within delimited `<UNTRUSTED_CLAIM>` and `<UNTRUSTED_EVIDENCE>` XML tags with strict system prompt anti-hijacking rules. |
| **Services** | `jury/index.ts` | Invalid/unverified model signatures could be tallied. | Filtered out unverified model outputs (counted as Abstain) and mandated `provider_tee` verification on Mainnet. |
| **Services** | `db/index.ts` | Unique constraint conflict on counter-challenge rulings (`claim_id, epoch`). | Added `ruling_round` column and migration (`idx_jury_rulings_claim_epoch_round`) to track multi-round dispute histories. |
| **Services** | `amm.ts` | Offchain trading fee calculation rounded down, diverging from on-chain ceiling rounding. | Switched to `divCeil(collateralIn * BigInt(feeBps), BPS_DENOM)` and added `MIN_RESERVE` guards to ensure exact integer parity. |
| **Services** | `nearAiClient.ts` | Unbounded HTTP connections could hang jury processes during network latency. | Added `AbortSignal.timeout` (10s on attestation/signatures, 35s on chat completions). |
| **Services** | `server.ts` | Unauthenticated public endpoints susceptible to sync spam. | Added optional `ADMIN_API_TOKEN` bearer auth and a 3-second cooldown on `POST /api/claims/:id/sync`. |
| **Frontend** | `near.ts` & `TopNav` | Hardcoded `"testnet"` network references in UI elements and RPC defaults. | Generalized to dynamic `NEXT_PUBLIC_NEAR_NETWORK` (`testnet` / `mainnet`), auto-selecting `rpc.mainnet.fastnear.com` on Mainnet. |
| **Frontend** | `PerpetuaStore.tsx` | String `.split(".")` decimal arithmetic risks precision errors on irregular inputs. | Replaced with strict `parseNearToYocto` integer multiplier math. |
| **Frontend** | `EscalatePanel.tsx` | Missing UI workflow for counter-challenging a disputed ruling. | Added one-click Counter-Challenge button with dynamic 2x bond calculation during active challenge windows. |

---

## Mainnet Deployment Checklist & Runbook

When deploying Perpetua to NEAR Mainnet:

1. **Prerequisites:**
   - A funded NEAR Mainnet account (e.g. `perpetua.near` or a 64-char implicit account) with at least 15-20 NEAR for contract storage and initial liquidity seeding.
   - NEAR AI Cloud API key with TEE compute credits.
2. **Configuration (`.env` & `web/.env.local`):**
   ```bash
   NEAR_NETWORK=mainnet
   NEAR_RPC_URL=https://rpc.mainnet.fastnear.com
   NEAR_CONTRACT_ID=<your-mainnet-account.near>
   NEAR_RESOLVER_ACCOUNT_ID=<your-mainnet-account.near>
   NEAR_RESOLVER_PRIVATE_KEY=ed25519:<your-mainnet-private-key>
   NEAR_AI_API_KEY=sk-...
   ALLOW_UNVERIFIED_FALLBACK=false
   ADMIN_API_TOKEN=<random-secure-secret>
   NEXT_PUBLIC_NEAR_NETWORK=mainnet
   NEXT_PUBLIC_NEAR_CONTRACT_ID=<your-mainnet-account.near>
   ```
3. **Compile & Deploy Contract:**
   ```bash
   # Recompile stripped release WASM
   cd contract && RUSTFLAGS="--cfg near" cargo build --target wasm32-unknown-unknown --release

   # Deploy and initialize contract via Node script
   cd ../services && npx tsx src/scripts/deploy-testnet.ts
   ```
4. **Seed Initial Production Claims:**
   ```bash
   cd services && npx tsx src/scripts/seed-claims.ts
   ```
5. **Start Production Services & Web Application:**
   ```bash
   # Start background indexer, AI jury, and API
   cd services && pnpm start

   # Start frontend (or deploy to Vercel)
   cd web && pnpm build && pnpm start
   ```

---

## Known Limitations

- **`near-sandbox-rs` platform support:** `near-workspaces` integration tests require Linux (`x86_64`/`aarch64`) or macOS (`arm64`) at runtime because `near-sandbox-rs` does not ship a native Windows sandbox binary. On Windows, `cargo test --lib` runs full `VMContextBuilder` unit tests.
- **Intel TDX DCAP quote chain offline verification:** [`services/src/ai/nearAiClient.ts`](services/src/ai/nearAiClient.ts) verifies preflight nonce echoing, signer matching, raw-byte SHA-256 hashes, and Ed25519 response signatures locally, while full Intel DCAP certificate-chain / NVIDIA GPU NRAS quote validation (`dcap-qvl`, Rust/WASM) is left for a verifier sidecar post-MVP.
- **Uncontested epoch rollover with open positions:** `advance_epoch` only rolls over an uncontested `Open` market when `outstanding_yes == 0 && outstanding_no == 0`; markets with open positions require escalation/settlement so existing shareholders are properly settled.
- **Per-epoch market reset price:** When epoch `E` settles and seeds epoch `E + 1`, the new epoch initializes at 50/50 (`500_000` e6) reserves rather than carrying over an arbitrary skew from the resolved epoch.
- **NEAR Intents Testnet gap (Phase 4):** NEAR Intents / 1Click Swap API does not offer a testnet deployment; cross-chain deposit routes enforce `dry: true` preview quotes in testnet mode.
