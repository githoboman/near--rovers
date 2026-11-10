import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import { describe, it } from "node:test";
import { NearAiCloudClient, sha256Hex } from "../src/ai/nearAiClient.ts";
import { priceE6, quoteBuy, quoteSell, YOCTO_PER_NEAR } from "../src/amm.ts";
import type { PerpetuaServiceConfig } from "../src/config.ts";
import { PerpetuaDatabase } from "../src/db/index.ts";
import { PageGeneratorService } from "../src/generator/index.ts";
import { OneClickIntentsClient } from "../src/intents/oneClick.ts";
import { JuryService, tallySupermajority } from "../src/jury/index.ts";
import type { PerpetuaNearClient } from "../src/near/client.ts";
import type { ClaimView, MarketView } from "../src/types.ts";

function makeSampleClaimAndMarket(id = 1): { claim: ClaimView; market: MarketView } {
  const claim: ClaimView = {
    id,
    creator: "alice.testnet",
    text: "Uniswap v3 core passed Trail of Bits and ABDK audits prior to May 2021 launch",
    text_hash: sha256Hex("sample"),
    evidence_uris: ["https://github.com/Uniswap/v3-core/tree/main/audits"],
    category: "audit_status",
    epoch_length: String(7 * 86_400 * 1_000_000_000),
    current_epoch: 1,
    status: "Escalated",
    page_hash: null,
    page_hash_updated_at: null,
    created_at: "1700000000000000000",
  };
  const reserve = YOCTO_PER_NEAR;
  const market: MarketView = {
    claim_id: id,
    epoch: 1,
    yes_reserve: reserve.toString(),
    no_reserve: reserve.toString(),
    collateral_vault: reserve.toString(),
    outstanding_yes: "0",
    outstanding_no: "0",
    fee_pool: "0",
    fee_bps: 100,
    opened_at: "1700000000000000000",
    epoch_end: "1700604800000000000",
    status: "Escalated",
    yes_price_e6: 500_000,
    no_price_e6: 500_000,
    challenger: "bob.testnet",
    challenger_side: "No",
    challenger_bond: ((YOCTO_PER_NEAR * 5n) / 10n).toString(),
    counter_challenger: null,
    counter_side: null,
    counter_bond: "0",
    escalated_at: "1700000100000000000",
    snap_yes_price_e6: 500_000,
    verdict: null,
    attestation_hash: null,
    ruled_at: null,
    challenge_deadline: null,
    settled_at: null,
    retained_liquidity: "0",
  };
  return { claim, market };
}

function baseConfig(): PerpetuaServiceConfig {
  return {
    networkId: "testnet",
    nearRpcUrl: "https://test.rpc.fastnear.com",
    contractId: "",
    resolverAccountId: "",
    resolverPrivateKey: "",
    nearAiBaseUrl: "http://127.0.0.1:0/v1",
    nearAiApiKey: "sk-test",
    juryModels: [
      "deepseek-ai/DeepSeek-V4.1-Flash-1017",
      "Qwen/Qwen3.8-27B",
      "z-ai/glm-5.3-flash",
    ],
    pageModel: "Qwen/Qwen3.8-27B",
    jurySupermajorityNumerator: 2,
    jurySupermajorityDenominator: 3,
    oneClickApiUrl: "https://1click.chaindefuser.com",
    oneClickJwt: "",
    dbPath: ":memory:",
    port: 0,
    pollIntervalMs: 4000,
    autoRunJury: true,
    autoGeneratePages: true,
    allowUnverifiedFallback: false,
    corsOrigin: "*",
  };
}

function makeStubNearClient(): PerpetuaNearClient {
  return {
    isConfigured: () => false,
    hasResolverSigner: () => false,
  } as unknown as PerpetuaNearClient;
}

describe("AMM integer parity", () => {
  it("computes equal reserves at 50% and preserves invariant on buy/sell quotes", () => {
    const p0 = priceE6(YOCTO_PER_NEAR, YOCTO_PER_NEAR);
    assert.equal(p0.yes, 500_000);
    assert.equal(p0.no, 500_000);

    const buy = quoteBuy(YOCTO_PER_NEAR, YOCTO_PER_NEAR, "Yes", YOCTO_PER_NEAR, 100);
    assert.ok(buy.sharesOut > YOCTO_PER_NEAR);
    assert.ok(buy.newYes * buy.newNo >= YOCTO_PER_NEAR * YOCTO_PER_NEAR);

    const p1 = priceE6(buy.newYes, buy.newNo);
    assert.ok(p1.yes > 500_000);
    assert.equal(p1.yes + p1.no, 1_000_000);

    const sell = quoteSell(buy.newYes, buy.newNo, "Yes", buy.sharesOut / 2n, 100);
    assert.ok(sell.netCollateralOut > 0n);
    assert.ok(sell.netCollateralOut < sell.grossCollateralOut);
  });
});

describe("SQLite DB persistence & price deduplication", () => {
  it("stores claims, deduplicates unchanged prices, and records subsequent moves", () => {
    const db = new PerpetuaDatabase(":memory:");
    const { claim, market } = makeSampleClaimAndMarket(1);
    db.upsertClaim(claim);
    db.upsertMarket(market);

    const first = db.recordPricePointIfChanged({
      claim_id: 1,
      epoch: 1,
      timestamp_ms: 1000,
      yes_price_e6: 500_000,
      no_price_e6: 500_000,
      yes_reserve: market.yes_reserve,
      no_reserve: market.no_reserve,
      fee_pool: "0",
      trigger_event: "init",
    });
    assert.equal(first, true);

    const dup = db.recordPricePointIfChanged({
      claim_id: 1,
      epoch: 1,
      timestamp_ms: 2000,
      yes_price_e6: 500_000,
      no_price_e6: 500_000,
      yes_reserve: market.yes_reserve,
      no_reserve: market.no_reserve,
      fee_pool: "0",
      trigger_event: "poll",
    });
    assert.equal(dup, false);

    const moved = db.recordPricePointIfChanged({
      claim_id: 1,
      epoch: 1,
      timestamp_ms: 3000,
      yes_price_e6: 680_000,
      no_price_e6: 320_000,
      yes_reserve: "500",
      no_reserve: "1500",
      fee_pool: "10",
      trigger_event: "trade",
    });
    assert.equal(moved, true);
    assert.equal(db.getPriceHistory(1, 1).length, 2);
    db.close();
  });
});

describe("Jury supermajority tally", () => {
  it("resolves 2/3 supermajority True/False and returns Unresolved on split or abstains", () => {
    const t = tallySupermajority(
      [{ vote: "True" }, { vote: "True" }, { vote: "False" }],
      3,
      2,
      3,
    );
    assert.equal(t.verdict, "True");
    assert.equal(t.supermajorityCount, 2);

    const f = tallySupermajority(
      [{ vote: "False" }, { vote: "False" }, { vote: "Unresolved" }],
      3,
      2,
      3,
    );
    assert.equal(f.verdict, "False");

    const split = tallySupermajority(
      [{ vote: "True" }, { vote: "False" }, { vote: "Unresolved" }],
      3,
      2,
      3,
    );
    assert.equal(split.verdict, "Unresolved");

    const abstain = tallySupermajority(
      [{ vote: "True" }, { vote: "Abstain" }, { vote: "Abstain" }],
      3,
      2,
      3,
    );
    assert.equal(abstain.verdict, "Unresolved");
  });
});

describe("NEAR AI Cloud client + Jury + Page Generator (cryptographic Ed25519 mock)", () => {
  it("verifies preflight nonces, provider_tee/gateway Ed25519 signatures, jury ruling, and page hash", async () => {
    const gatewayKeys = crypto.generateKeyPairSync("ed25519");
    const modelKeys = crypto.generateKeyPairSync("ed25519");

    const gatewayPubHex = Buffer.from(
      gatewayKeys.publicKey.export({ format: "der", type: "spki" }),
    )
      .subarray(-32)
      .toString("hex");
    const modelPubHex = Buffer.from(
      modelKeys.publicKey.export({ format: "der", type: "spki" }),
    )
      .subarray(-32)
      .toString("hex");

    const signatures = new Map<
      string,
      { model: string; reqHash: string; resHash: string; kind: "provider_tee" | "gateway" }
    >();
    let seq = 0;

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1");

      if (req.method === "GET" && url.pathname === "/v1/attestation/report") {
        const nonce = url.searchParams.get("nonce") || "";
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            gateway_attestation: {
              signing_address: gatewayPubHex,
              signing_algo: "ed25519",
              request_nonce: nonce,
              intel_quote: "deadbeef",
              event_log: "[]",
              report_data: nonce,
            },
            model_attestations: [
              {
                signing_address: modelPubHex,
                signing_algo: "ed25519",
                request_nonce: nonce,
                intel_quote: "cafe",
              },
            ],
          }),
        );
        return;
      }

      if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(Buffer.from(c));
        const rawReq = Buffer.concat(chunks);
        const body = JSON.parse(rawReq.toString("utf8")) as {
          model: string;
          messages: Array<{ content: string }>;
        };
        seq += 1;
        const chatId = `chatcmpl_mock_${seq}`;
        const isPageGen = body.messages.some((m) =>
          m.content.includes("encyclopedia entry"),
        );

        let contentJson: unknown;
        if (isPageGen) {
          contentJson = {
            summary: "Market consensus favors this claim under current liquidity.",
            markdown: "Market consensus favors this claim under current liquidity.",
            sentences: [
              {
                text: "Market consensus favors this claim under current liquidity.",
                confidenceE6: 680_000,
                citation: "https://github.com/Uniswap/v3-core/tree/main/audits",
              },
            ],
          };
        } else {
          const vote = body.model.includes("glm") ? "UNRESOLVED" : "TRUE";
          contentJson = {
            vote,
            confidence: vote === "TRUE" ? 91 : 45,
            reasoning: `Mocked verdict from ${body.model}`,
          };
        }

        const respPayload = Buffer.from(
          JSON.stringify({
            id: chatId,
            choices: [{ message: { content: JSON.stringify(contentJson) } }],
          }),
          "utf8",
        );

        signatures.set(chatId, {
          model: body.model,
          reqHash: sha256Hex(rawReq),
          resHash: sha256Hex(respPayload),
          kind: isPageGen ? "gateway" : "provider_tee",
        });

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(respPayload);
        return;
      }

      const sigMatch = url.pathname.match(/^\/v1\/signature\/(.+)$/);
      if (req.method === "GET" && sigMatch) {
        const chatId = decodeURIComponent(sigMatch[1]);
        const entry = signatures.get(chatId);
        if (!entry) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: { message: "not found" } }));
          return;
        }

        const isTee = entry.kind === "provider_tee";
        const text = isTee
          ? `${entry.model}:${entry.reqHash}:${entry.resHash}`
          : `${entry.reqHash}:${entry.resHash}`;
        const keyPair = isTee ? modelKeys : gatewayKeys;
        const sigHex = crypto
          .sign(null, Buffer.from(text, "utf8"), keyPair.privateKey)
          .toString("hex");
        const signingAddress = isTee ? modelPubHex : gatewayPubHex;

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            text,
            signature: sigHex,
            signature_kind: entry.kind,
            signing_address: signingAddress,
            signing_algo: "ed25519",
          }),
        );
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    assert.ok(addr && typeof addr === "object");

    const config: PerpetuaServiceConfig = {
      ...baseConfig(),
      nearAiBaseUrl: `http://127.0.0.1:${addr.port}/v1`,
    };
    const db = new PerpetuaDatabase(":memory:");
    const nearClient = makeStubNearClient();
    const aiClient = new NearAiCloudClient({
      baseUrl: config.nearAiBaseUrl,
      apiKey: config.nearAiApiKey,
    });
    const jury = new JuryService(config, db, nearClient, aiClient);
    const generator = new PageGeneratorService(config, db, nearClient, aiClient);

    try {
      const { claim, market } = makeSampleClaimAndMarket(1);
      db.upsertClaim(claim);
      db.upsertMarket(market);

      const ruling = await jury.resolveEscalatedClaim(claim, market, {
        submitOnChain: false,
      });
      assert.equal(ruling.verdict, "True");
      assert.equal(ruling.supermajority_count, 2);
      assert.equal(ruling.total_models, 3);
      assert.equal(ruling.votes.length, 3);
      for (const v of ruling.votes) {
        assert.equal(v.gatewayNonceMatched, true);
        assert.equal(v.signatureKind, "provider_tee");
        assert.equal(v.signatureValid, true);
      }

      const page1 = await generator.generateAndPublishPage(claim, market, {
        submitOnChain: false,
      });
      assert.equal(page1.mode, "near-ai-cloud-tee");
      assert.equal(page1.signature_kind, "gateway");
      assert.equal(page1.signature_valid, true);

      const movedMarket: MarketView = {
        ...market,
        yes_reserve: (YOCTO_PER_NEAR / 4n).toString(),
        no_reserve: (YOCTO_PER_NEAR * 3n).toString(),
      };
      const page2 = await generator.generateAndPublishPage(claim, movedMarket, {
        submitOnChain: false,
      });
      assert.notEqual(page2.page_hash, page1.page_hash);
    } finally {
      db.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe("Phase 4 OneClick Intents preview safety", () => {
  it("forces dry=true and emits testnet notice when running on testnet", async () => {
    const capturedBodies: Array<Record<string, unknown>> = [];
    const mockFetch: typeof fetch = async (_input, init) => {
      capturedBodies.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
      return new Response(
        JSON.stringify({
          quote: { amountOut: "1000000000000000000000000", timeEstimate: 18 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const client = new OneClickIntentsClient(baseConfig(), mockFetch);
    const preview = (await client.previewQuote({
      originAsset: "nep141:eth.omft.near",
      amount: "10000000000000000",
      recipient: "alice.near",
      refundTo: "0x1234",
    })) as { dryOnly: boolean; testnetNotice: string | null };

    assert.equal(preview.dryOnly, true);
    assert.ok(preview.testnetNotice?.includes("dry=true"));
    assert.equal(capturedBodies[0]?.dry, true);
  });
});
