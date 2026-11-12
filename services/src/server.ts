import http, { type IncomingMessage, type ServerResponse } from "node:http";
import type { PerpetuaServiceConfig } from "./config.ts";
import type { PerpetuaDatabase } from "./db/index.ts";
import { OneClickIntentsClient } from "./intents/oneClick.ts";
import type { PerpetuaOrchestrator } from "./orchestrator.ts";
import type { ClaimView, ContractConfigView } from "./types.ts";

function sendJson(
  res: ServerResponse,
  status: number,
  payload: unknown,
  corsOrigin: string,
): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(body);
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

function buildFrontendBundle(db: PerpetuaDatabase, claim: ClaimView) {
  const market = db.getMarket(claim.id, claim.current_epoch);
  if (!market) return null;

  const history = db.getPriceHistory(claim.id, claim.current_epoch).map((p) => ({
    timestampMs: p.timestamp_ms,
    yesPriceE6: p.yes_price_e6,
    eventLabel: p.trigger_event,
  }));

  const page = db.getLatestGeneratedPage(claim.id);
  const yesPct = (market.yes_price_e6 / 10_000).toFixed(1);
  const band: "high" | "contested" | "low" =
    market.yes_price_e6 >= 650_000
      ? "high"
      : market.yes_price_e6 <= 350_000
        ? "low"
        : "contested";
  const article = page
    ? {
        claimId: page.claim_id,
        epoch: page.epoch,
        title: claim.text,
        summary: page.summary,
        sentences: page.sentences,
        markdown: page.markdown,
        model: page.model,
        promptHash: page.prompt_hash,
        snapshotPriceE6: page.yes_price_e6,
        generatedAtMs: page.created_at,
        pageHash: page.page_hash,
      }
    : {
        claimId: claim.id,
        epoch: market.epoch,
        title: claim.text,
        summary: `On-chain market implies ${yesPct}% YES confidence (${market.status}).`,
        sentences: [
          {
            text: `Epoch ${market.epoch} market pricing (${yesPct}% YES) is synced from NEAR and awaiting offchain article synthesis.`,
            confidenceE6: market.yes_price_e6,
            band,
          },
        ],
        markdown: `Epoch ${market.epoch} market pricing (${yesPct}% YES) is synced from NEAR and awaiting offchain article synthesis.`,
        model: "pending-generation",
        promptHash: "",
        snapshotPriceE6: market.yes_price_e6,
        generatedAtMs: Date.now(),
        pageHash: claim.page_hash ?? "pending",
      };

  const jury = db.getJuryRuling(claim.id, claim.current_epoch);
  const ruling = jury
    ? {
        claimId: jury.claim_id,
        epoch: jury.epoch,
        finalVerdict: jury.verdict,
        attestationHash: jury.attestation_hash,
        modelVotes: jury.votes.map((v) => ({
          model: v.model,
          verdict: v.vote === "Abstain" ? ("Unresolved" as const) : v.vote,
          confidence: v.confidence,
          rationale: v.reasoning,
          signatureKind:
            v.signatureKind === "provider_tee" || v.signatureKind === "gateway"
              ? v.signatureKind
              : undefined,
          signingAddress: v.signingAddress ?? undefined,
        })),
        createdAtMs: jury.created_at,
      }
    : null;

  return {
    claim,
    market,
    history,
    article,
    ruling,
  };
}

export function createPerpetuaServer(opts: {
  config: PerpetuaServiceConfig;
  db: PerpetuaDatabase;
  orchestrator?: PerpetuaOrchestrator;
}): http.Server {
  const { config, db, orchestrator } = opts;
  const oneClick = new OneClickIntentsClient(config);
  let lastManualSyncMs = 0;
  const SYNC_COOLDOWN_MS = 3000;

  return http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": config.corsOrigin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      });
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;

    try {
      if (req.method === "GET" && pathname === "/health") {
        sendJson(
          res,
          200,
          {
            ok: true,
            networkId: config.networkId,
            contractId: config.contractId || null,
            resolverConfigured: Boolean(
              config.resolverAccountId && config.resolverPrivateKey,
            ),
            nearAiConfigured: Boolean(config.nearAiApiKey),
            juryModels: config.juryModels,
            pageModel: config.pageModel,
            lastSyncMs: Number(db.getKv("last_sync_ms") || 0),
          },
          config.corsOrigin,
        );
        return;
      }

      if (req.method === "GET" && pathname === "/api/claims") {
        const configJson = db.getKv("contract_config");
        const contractConfig = configJson
          ? (JSON.parse(configJson) as ContractConfigView)
          : undefined;
        const bundles = db
          .listClaims()
          .map((claim) => buildFrontendBundle(db, claim))
          .filter((b): b is NonNullable<typeof b> => b !== null);

        sendJson(
          res,
          200,
          { bundles, config: contractConfig, total: bundles.length },
          config.corsOrigin,
        );
        return;
      }

      const claimMatch = pathname.match(/^\/api\/claims\/(\d+)$/);
      if (req.method === "GET" && claimMatch) {
        const claimId = Number(claimMatch[1]);
        const claim = db.getClaim(claimId);
        if (!claim) {
          sendJson(res, 404, { error: `Claim ${claimId} not found` }, config.corsOrigin);
          return;
        }
        const bundle = buildFrontendBundle(db, claim);
        const juryRuling = db.getJuryRuling(claimId, claim.current_epoch);
        const generatedPage = db.getLatestGeneratedPage(claimId);
        sendJson(
          res,
          200,
          { bundle, juryRuling, generatedPage },
          config.corsOrigin,
        );
        return;
      }

      const syncMatch = pathname.match(/^\/api\/claims\/(\d+)\/sync$/);
      if (req.method === "POST" && syncMatch) {
        if (config.adminApiToken) {
          const authHeader = req.headers.authorization || "";
          if (authHeader !== `Bearer ${config.adminApiToken}`) {
            sendJson(res, 401, { error: "Unauthorized" }, config.corsOrigin);
            return;
          }
        }
        const now = Date.now();
        if (now - lastManualSyncMs < SYNC_COOLDOWN_MS) {
          sendJson(
            res,
            429,
            { error: "Sync cooldown active; try again in a few seconds" },
            config.corsOrigin,
          );
          return;
        }
        lastManualSyncMs = now;
        await readJsonBody(req).catch(() => ({}));
        if (!orchestrator) {
          sendJson(res, 503, { error: "Orchestrator unavailable" }, config.corsOrigin);
          return;
        }
        const cycle = await orchestrator.runCycle("manual-sync");
        sendJson(res, 200, cycle, config.corsOrigin);
        return;
      }

      if (req.method === "GET" && pathname === "/api/intents/tokens") {
        const result = await oneClick.listTokens();
        sendJson(res, 200, result, config.corsOrigin);
        return;
      }

      if (req.method === "POST" && pathname === "/api/intents/quote") {
        const body = await readJsonBody(req);
        if (
          typeof body.originAsset !== "string" ||
          typeof body.amount !== "string" ||
          typeof body.recipient !== "string" ||
          typeof body.refundTo !== "string"
        ) {
          sendJson(
            res,
            400,
            {
              error:
                "Required fields: originAsset, amount, recipient, refundTo",
            },
            config.corsOrigin,
          );
          return;
        }
        const quote = await oneClick.previewQuote({
          originAsset: body.originAsset,
          destinationAsset:
            typeof body.destinationAsset === "string"
              ? body.destinationAsset
              : undefined,
          amount: body.amount,
          recipient: body.recipient,
          refundTo: body.refundTo,
          slippageTolerance:
            typeof body.slippageTolerance === "number"
              ? body.slippageTolerance
              : undefined,
          dry: typeof body.dry === "boolean" ? body.dry : undefined,
        });
        sendJson(res, 200, quote, config.corsOrigin);
        return;
      }

      sendJson(res, 404, { error: "Not found" }, config.corsOrigin);
    } catch (err) {
      sendJson(
        res,
        500,
        { error: err instanceof Error ? err.message : String(err) },
        config.corsOrigin,
      );
    }
  });
}
