import { priceE6 } from "../amm.ts";
import type { PerpetuaServiceConfig } from "../config.ts";
import type { PerpetuaDatabase } from "../db/index.ts";
import type { PerpetuaNearClient } from "../near/client.ts";
import type { ClaimView, MarketView } from "../types.ts";

export interface SyncSummary {
  claimsSynced: number;
  marketsSynced: number;
  pricePointsRecorded: number;
  escalatedMarkets: Array<{ claim: ClaimView; market: MarketView }>;
  settledOrChangedClaims: Array<{ claim: ClaimView; market: MarketView }>;
}

export class PerpetuaIndexer {
  private readonly db: PerpetuaDatabase;
  private readonly nearClient: PerpetuaNearClient;

  constructor(
    _config: PerpetuaServiceConfig,
    db: PerpetuaDatabase,
    nearClient: PerpetuaNearClient,
  ) {
    this.db = db;
    this.nearClient = nearClient;
  }

  async syncOnce(triggerEvent = "poll"): Promise<SyncSummary> {
    if (!this.nearClient.isConfigured()) {
      return {
        claimsSynced: 0,
        marketsSynced: 0,
        pricePointsRecorded: 0,
        escalatedMarkets: [],
        settledOrChangedClaims: [],
      };
    }

    const [contractConfig, totalClaims] = await Promise.all([
      this.nearClient.getConfig(),
      this.nearClient.getClaimsCount(),
    ]);
    this.db.setKv("contract_config", JSON.stringify(contractConfig));

    const pageSize = 50;
    let claimsSynced = 0;
    let marketsSynced = 0;
    let pricePointsRecorded = 0;
    const escalatedMarkets: Array<{ claim: ClaimView; market: MarketView }> = [];
    const settledOrChangedClaims: Array<{ claim: ClaimView; market: MarketView }> = [];

    for (let fromIndex = 0; fromIndex < totalClaims; fromIndex += pageSize) {
      const batch = await this.nearClient.getClaims(fromIndex, pageSize);
      for (const claim of batch) {
        this.db.upsertClaim(claim);
        claimsSynced += 1;
      }

      const marketConcurrency = 5;
      for (let i = 0; i < batch.length; i += marketConcurrency) {
        const slice = batch.slice(i, i + marketConcurrency);
        const markets = await Promise.all(
          slice.map((c) => this.nearClient.getMarket(c.id, c.current_epoch)),
        );

        for (let j = 0; j < slice.length; j++) {
          const claim = slice[j];
          const market = markets[j];
          if (!market) continue;

          const prevMarket = this.db.getMarket(claim.id, market.epoch);
          this.db.upsertMarket(market);
          marketsSynced += 1;

          const prices = priceE6(BigInt(market.yes_reserve), BigInt(market.no_reserve));
          const recorded = this.db.recordPricePointIfChanged({
            claim_id: claim.id,
            epoch: market.epoch,
            timestamp_ms: Date.now(),
            yes_price_e6: prices.yes,
            no_price_e6: prices.no,
            yes_reserve: market.yes_reserve,
            no_reserve: market.no_reserve,
            fee_pool: market.fee_pool,
            trigger_event: triggerEvent,
          });
          if (recorded) {
            pricePointsRecorded += 1;
          }

          if (market.status === "Escalated") {
            escalatedMarkets.push({ claim, market });
          }

          const priceChanged =
            recorded || !prevMarket || prevMarket.status !== market.status;
          if (priceChanged) {
            settledOrChangedClaims.push({ claim, market });
          }
        }
      }
    }

    this.db.setKv("last_sync_ms", String(Date.now()));

    return {
      claimsSynced,
      marketsSynced,
      pricePointsRecorded,
      escalatedMarkets,
      settledOrChangedClaims,
    };
  }
}
