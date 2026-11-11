import type { PerpetuaServiceConfig } from "./config.ts";
import type { PerpetuaDatabase } from "./db/index.ts";
import type { PageGeneratorService } from "./generator/index.ts";
import type { PerpetuaIndexer, SyncSummary } from "./indexer/index.ts";
import type { JuryService } from "./jury/index.ts";

export interface CycleResult {
  sync: SyncSummary;
  rulingsProcessed: number;
  pagesGenerated: number;
}

export class PerpetuaOrchestrator {
  private readonly config: PerpetuaServiceConfig;
  private readonly db: PerpetuaDatabase;
  private readonly indexer: PerpetuaIndexer;
  private readonly jury: JuryService;
  private readonly generator: PageGeneratorService;

  constructor(opts: {
    config: PerpetuaServiceConfig;
    db: PerpetuaDatabase;
    indexer: PerpetuaIndexer;
    jury: JuryService;
    generator: PageGeneratorService;
  }) {
    this.config = opts.config;
    this.db = opts.db;
    this.indexer = opts.indexer;
    this.jury = opts.jury;
    this.generator = opts.generator;
  }

  async runCycle(trigger = "poll"): Promise<CycleResult> {
    const sync = await this.indexer.syncOnce(trigger);
    let rulingsProcessed = 0;
    let pagesGenerated = 0;

    if (this.config.autoRunJury) {
      for (const { claim, market } of sync.escalatedMarkets) {
        const existing = this.db.getJuryRuling(claim.id, market.epoch);
        if (!existing || !existing.submitted_tx_hash) {
          await this.jury.resolveEscalatedClaim(claim, market);
          rulingsProcessed += 1;
        }
      }
    }

    if (this.config.autoGeneratePages) {
      const processedIds = new Set<number>();
      for (const { claim, market } of sync.settledOrChangedClaims) {
        processedIds.add(claim.id);
        await this.generator.generateAndPublishPage(claim, market);
        pagesGenerated += 1;
      }

      // Also generate pages for synced claims that have never had a page generated yet.
      for (const stored of this.db.listClaims()) {
        if (processedIds.has(stored.id)) continue;
        if (this.db.getLatestGeneratedPage(stored.id)) continue;
        const market = this.db.getMarket(stored.id, stored.current_epoch);
        if (!market) continue;
        await this.generator.generateAndPublishPage(stored, market);
        pagesGenerated += 1;
      }
    }

    return { sync, rulingsProcessed, pagesGenerated };
  }
}

