import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  AnnotatedSentence,
  ClaimView,
  GeneratedPageRecord,
  JuryModelVoteRecord,
  JuryRulingRecord,
  MarketView,
  Outcome,
  PriceHistoryPoint,
  Verdict,
} from "../types.ts";

export interface StoredClaimRow extends ClaimView {
  updated_at: number;
}

export class PerpetuaDatabase {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    if (dbPath !== ":memory:") {
      fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS claims (
        id INTEGER PRIMARY KEY,
        creator TEXT NOT NULL,
        text TEXT NOT NULL,
        text_hash TEXT NOT NULL,
        evidence_uris_json TEXT NOT NULL,
        category TEXT NOT NULL,
        created_at TEXT NOT NULL,
        epoch_length TEXT NOT NULL,
        current_epoch INTEGER NOT NULL,
        status TEXT NOT NULL,
        page_hash TEXT,
        page_hash_updated_at TEXT,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS markets (
        claim_id INTEGER NOT NULL,
        epoch INTEGER NOT NULL,
        yes_reserve TEXT NOT NULL,
        no_reserve TEXT NOT NULL,
        collateral_vault TEXT NOT NULL,
        outstanding_yes TEXT NOT NULL,
        outstanding_no TEXT NOT NULL,
        fee_pool TEXT NOT NULL,
        fee_bps INTEGER NOT NULL,
        opened_at TEXT NOT NULL,
        epoch_end TEXT NOT NULL,
        status TEXT NOT NULL,
        yes_price_e6 INTEGER NOT NULL,
        no_price_e6 INTEGER NOT NULL,
        challenger TEXT,
        challenger_side TEXT,
        challenger_bond TEXT NOT NULL,
        counter_challenger TEXT,
        counter_side TEXT,
        counter_bond TEXT NOT NULL,
        escalated_at TEXT,
        snap_yes_price_e6 INTEGER,
        verdict TEXT,
        attestation_hash TEXT,
        ruled_at TEXT,
        challenge_deadline TEXT,
        settled_at TEXT,
        retained_liquidity TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (claim_id, epoch)
      );

      CREATE TABLE IF NOT EXISTS price_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        claim_id INTEGER NOT NULL,
        epoch INTEGER NOT NULL,
        timestamp_ms INTEGER NOT NULL,
        yes_price_e6 INTEGER NOT NULL,
        no_price_e6 INTEGER NOT NULL,
        yes_reserve TEXT NOT NULL,
        no_reserve TEXT NOT NULL,
        fee_pool TEXT NOT NULL,
        trigger_event TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_price_history_claim_epoch
        ON price_history (claim_id, epoch, timestamp_ms);

      CREATE TABLE IF NOT EXISTS jury_rulings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        claim_id INTEGER NOT NULL,
        epoch INTEGER NOT NULL,
        ruling_round INTEGER NOT NULL DEFAULT 1,
        verdict TEXT NOT NULL,
        supermajority_count INTEGER NOT NULL,
        total_models INTEGER NOT NULL,
        required_majority INTEGER NOT NULL,
        evidence_packet_json TEXT NOT NULL,
        evidence_hash TEXT NOT NULL,
        attestation_bundle_json TEXT NOT NULL,
        attestation_hash TEXT NOT NULL,
        submitted_tx_hash TEXT,
        mode TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      DROP INDEX IF EXISTS idx_jury_rulings_claim_epoch;

      CREATE TABLE IF NOT EXISTS jury_model_outputs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ruling_id INTEGER NOT NULL,
        model TEXT NOT NULL,
        vote TEXT NOT NULL,
        confidence INTEGER NOT NULL,
        reasoning TEXT NOT NULL,
        raw_request TEXT NOT NULL,
        raw_response TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        response_hash TEXT NOT NULL,
        chat_id TEXT,
        signature_kind TEXT,
        signature_valid INTEGER NOT NULL,
        signing_address TEXT,
        signing_algo TEXT,
        attestation_nonce TEXT,
        gateway_nonce_matched INTEGER NOT NULL,
        model_attestation_present INTEGER NOT NULL,
        error TEXT,
        FOREIGN KEY (ruling_id) REFERENCES jury_rulings (id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS generated_pages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        claim_id INTEGER NOT NULL,
        epoch INTEGER NOT NULL,
        yes_price_e6 INTEGER NOT NULL,
        no_price_e6 INTEGER NOT NULL,
        snapshot_json TEXT NOT NULL,
        prompt TEXT NOT NULL,
        prompt_hash TEXT NOT NULL,
        model TEXT NOT NULL,
        summary TEXT NOT NULL,
        markdown TEXT NOT NULL,
        sentences_json TEXT NOT NULL,
        page_hash TEXT NOT NULL,
        signature_kind TEXT,
        signature_valid INTEGER NOT NULL,
        chat_id TEXT,
        mode TEXT NOT NULL,
        submitted_tx_hash TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_generated_pages_claim
        ON generated_pages (claim_id, id DESC);

      CREATE TABLE IF NOT EXISTS indexer_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    const cols = this.db
      .prepare("PRAGMA table_info('jury_rulings')")
      .all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === "ruling_round")) {
      this.db.exec(
        "ALTER TABLE jury_rulings ADD COLUMN ruling_round INTEGER NOT NULL DEFAULT 1;",
      );
    }
    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_jury_rulings_claim_epoch_round
        ON jury_rulings (claim_id, epoch, ruling_round);
    `);
  }

  close(): void {
    this.db.close();
  }

  getKv(key: string): string | null {
    const row = this.db
      .prepare("SELECT value FROM indexer_state WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row ? row.value : null;
  }

  setKv(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO indexer_state (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }

  upsertClaim(claim: ClaimView, nowMs = Date.now()): void {
    this.db
      .prepare(
        `INSERT INTO claims (
          id, creator, text, text_hash, evidence_uris_json, category,
          created_at, epoch_length, current_epoch, status, page_hash, page_hash_updated_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          creator = excluded.creator,
          text = excluded.text,
          text_hash = excluded.text_hash,
          evidence_uris_json = excluded.evidence_uris_json,
          category = excluded.category,
          created_at = excluded.created_at,
          epoch_length = excluded.epoch_length,
          current_epoch = excluded.current_epoch,
          status = excluded.status,
          page_hash = excluded.page_hash,
          page_hash_updated_at = excluded.page_hash_updated_at,
          updated_at = excluded.updated_at`,
      )
      .run(
        claim.id,
        claim.creator,
        claim.text,
        claim.text_hash,
        JSON.stringify(claim.evidence_uris),
        claim.category,
        claim.created_at,
        claim.epoch_length,
        claim.current_epoch,
        claim.status,
        claim.page_hash,
        claim.page_hash_updated_at,
        nowMs,
      );
  }

  upsertMarket(market: MarketView, nowMs = Date.now()): void {
    this.db
      .prepare(
        `INSERT INTO markets (
          claim_id, epoch, yes_reserve, no_reserve, collateral_vault,
          outstanding_yes, outstanding_no, fee_pool, fee_bps,
          opened_at, epoch_end, status, yes_price_e6, no_price_e6,
          challenger, challenger_side, challenger_bond,
          counter_challenger, counter_side, counter_bond,
          escalated_at, snap_yes_price_e6, verdict, attestation_hash,
          ruled_at, challenge_deadline, settled_at, retained_liquidity, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(claim_id, epoch) DO UPDATE SET
          yes_reserve = excluded.yes_reserve,
          no_reserve = excluded.no_reserve,
          collateral_vault = excluded.collateral_vault,
          outstanding_yes = excluded.outstanding_yes,
          outstanding_no = excluded.outstanding_no,
          fee_pool = excluded.fee_pool,
          fee_bps = excluded.fee_bps,
          opened_at = excluded.opened_at,
          epoch_end = excluded.epoch_end,
          status = excluded.status,
          yes_price_e6 = excluded.yes_price_e6,
          no_price_e6 = excluded.no_price_e6,
          challenger = excluded.challenger,
          challenger_side = excluded.challenger_side,
          challenger_bond = excluded.challenger_bond,
          counter_challenger = excluded.counter_challenger,
          counter_side = excluded.counter_side,
          counter_bond = excluded.counter_bond,
          escalated_at = excluded.escalated_at,
          snap_yes_price_e6 = excluded.snap_yes_price_e6,
          verdict = excluded.verdict,
          attestation_hash = excluded.attestation_hash,
          ruled_at = excluded.ruled_at,
          challenge_deadline = excluded.challenge_deadline,
          settled_at = excluded.settled_at,
          retained_liquidity = excluded.retained_liquidity,
          updated_at = excluded.updated_at`,
      )
      .run(
        market.claim_id,
        market.epoch,
        market.yes_reserve,
        market.no_reserve,
        market.collateral_vault,
        market.outstanding_yes,
        market.outstanding_no,
        market.fee_pool,
        market.fee_bps,
        market.opened_at,
        market.epoch_end,
        market.status,
        market.yes_price_e6,
        market.no_price_e6,
        market.challenger,
        market.challenger_side,
        market.challenger_bond,
        market.counter_challenger,
        market.counter_side,
        market.counter_bond,
        market.escalated_at,
        market.snap_yes_price_e6,
        market.verdict,
        market.attestation_hash,
        market.ruled_at,
        market.challenge_deadline,
        market.settled_at,
        market.retained_liquidity,
        nowMs,
      );
  }

  recordPricePointIfChanged(point: PriceHistoryPoint): boolean {
    const latest = this.db
      .prepare(
        `SELECT yes_price_e6, yes_reserve, no_reserve, fee_pool
         FROM price_history
         WHERE claim_id = ? AND epoch = ?
         ORDER BY id DESC LIMIT 1`,
      )
      .get(point.claim_id, point.epoch) as
      | {
          yes_price_e6: number;
          yes_reserve: string;
          no_reserve: string;
          fee_pool: string;
        }
      | undefined;

    if (
      latest &&
      latest.yes_price_e6 === point.yes_price_e6 &&
      latest.yes_reserve === point.yes_reserve &&
      latest.no_reserve === point.no_reserve &&
      latest.fee_pool === point.fee_pool
    ) {
      return false;
    }

    this.db
      .prepare(
        `INSERT INTO price_history (
          claim_id, epoch, timestamp_ms, yes_price_e6, no_price_e6,
          yes_reserve, no_reserve, fee_pool, trigger_event
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        point.claim_id,
        point.epoch,
        point.timestamp_ms,
        point.yes_price_e6,
        point.no_price_e6,
        point.yes_reserve,
        point.no_reserve,
        point.fee_pool,
        point.trigger_event,
      );
    return true;
  }

  getPriceHistory(claimId: number, epoch?: number): PriceHistoryPoint[] {
    const rows =
      epoch !== undefined
        ? (this.db
            .prepare(
              `SELECT * FROM price_history WHERE claim_id = ? AND epoch = ? ORDER BY id ASC`,
            )
            .all(claimId, epoch) as unknown as PriceHistoryPoint[])
        : (this.db
            .prepare(
              `SELECT * FROM price_history WHERE claim_id = ? ORDER BY id ASC`,
            )
            .all(claimId) as unknown as PriceHistoryPoint[]);
    return rows;
  }

  private mapClaimRow(r: Record<string, unknown>): StoredClaimRow {
    return {
      id: Number(r.id),
      creator: String(r.creator),
      text: String(r.text),
      text_hash: String(r.text_hash),
      evidence_uris: JSON.parse(String(r.evidence_uris_json)) as string[],
      category: String(r.category),
      epoch_length: String(r.epoch_length),
      current_epoch: Number(r.current_epoch),
      status: String(r.status) as ClaimView["status"],
      page_hash: r.page_hash ? String(r.page_hash) : null,
      page_hash_updated_at: r.page_hash_updated_at ? String(r.page_hash_updated_at) : null,
      created_at: String(r.created_at),
      updated_at: Number(r.updated_at),
    };
  }

  listClaims(): StoredClaimRow[] {
    const rows = this.db
      .prepare(`SELECT * FROM claims ORDER BY id ASC`)
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapClaimRow(r));
  }

  getClaim(claimId: number): StoredClaimRow | null {
    const r = this.db
      .prepare(`SELECT * FROM claims WHERE id = ?`)
      .get(claimId) as Record<string, unknown> | undefined;
    return r ? this.mapClaimRow(r) : null;
  }

  getMarket(claimId: number, epoch?: number): MarketView | null {
    const r =
      epoch !== undefined
        ? (this.db
            .prepare(`SELECT * FROM markets WHERE claim_id = ? AND epoch = ?`)
            .get(claimId, epoch) as Record<string, unknown> | undefined)
        : (this.db
            .prepare(
              `SELECT * FROM markets WHERE claim_id = ? ORDER BY epoch DESC LIMIT 1`,
            )
            .get(claimId) as Record<string, unknown> | undefined);

    if (!r) return null;
    return {
      claim_id: Number(r.claim_id),
      epoch: Number(r.epoch),
      yes_reserve: String(r.yes_reserve),
      no_reserve: String(r.no_reserve),
      collateral_vault: String(r.collateral_vault),
      outstanding_yes: String(r.outstanding_yes),
      outstanding_no: String(r.outstanding_no),
      fee_pool: String(r.fee_pool),
      fee_bps: Number(r.fee_bps),
      opened_at: String(r.opened_at),
      epoch_end: String(r.epoch_end),
      status: String(r.status) as MarketView["status"],
      yes_price_e6: Number(r.yes_price_e6),
      no_price_e6: Number(r.no_price_e6),
      challenger: r.challenger ? String(r.challenger) : null,
      challenger_side: (r.challenger_side as Outcome | null) ?? null,
      challenger_bond: String(r.challenger_bond),
      counter_challenger: r.counter_challenger ? String(r.counter_challenger) : null,
      counter_side: (r.counter_side as Outcome | null) ?? null,
      counter_bond: String(r.counter_bond),
      escalated_at: r.escalated_at ? String(r.escalated_at) : null,
      snap_yes_price_e6:
        r.snap_yes_price_e6 !== null ? Number(r.snap_yes_price_e6) : null,
      verdict: (r.verdict as Verdict | null) ?? null,
      attestation_hash: r.attestation_hash ? String(r.attestation_hash) : null,
      ruled_at: r.ruled_at ? String(r.ruled_at) : null,
      challenge_deadline: r.challenge_deadline ? String(r.challenge_deadline) : null,
      settled_at: r.settled_at ? String(r.settled_at) : null,
      retained_liquidity: String(r.retained_liquidity),
    };
  }

  getJuryRuling(
    claimId: number,
    epoch: number,
    rulingRound?: number,
  ): JuryRulingRecord | null {
    const r =
      rulingRound !== undefined
        ? (this.db
            .prepare(
              `SELECT * FROM jury_rulings WHERE claim_id = ? AND epoch = ? AND ruling_round = ?`,
            )
            .get(claimId, epoch, rulingRound) as
            | Record<string, unknown>
            | undefined)
        : (this.db
            .prepare(
              `SELECT * FROM jury_rulings WHERE claim_id = ? AND epoch = ? ORDER BY ruling_round DESC LIMIT 1`,
            )
            .get(claimId, epoch) as Record<string, unknown> | undefined);
    if (!r) return null;

    const votesRaw = this.db
      .prepare(`SELECT * FROM jury_model_outputs WHERE ruling_id = ? ORDER BY id ASC`)
      .all(Number(r.id)) as Array<Record<string, unknown>>;

    const votes: JuryModelVoteRecord[] = votesRaw.map((v) => ({
      model: String(v.model),
      vote: String(v.vote) as JuryModelVoteRecord["vote"],
      confidence: Number(v.confidence),
      reasoning: String(v.reasoning),
      rawRequest: String(v.raw_request),
      rawResponse: String(v.raw_response),
      requestHash: String(v.request_hash),
      responseHash: String(v.response_hash),
      chatId: v.chat_id ? String(v.chat_id) : null,
      signatureKind: v.signature_kind ? String(v.signature_kind) : null,
      signatureValid: Number(v.signature_valid) === 1,
      signingAddress: v.signing_address ? String(v.signing_address) : null,
      signingAlgo: v.signing_algo ? String(v.signing_algo) : null,
      attestationNonce: v.attestation_nonce ? String(v.attestation_nonce) : null,
      gatewayNonceMatched: Number(v.gateway_nonce_matched) === 1,
      modelAttestationPresent: Number(v.model_attestation_present) === 1,
      error: v.error ? String(v.error) : null,
    }));

    return {
      id: Number(r.id),
      claim_id: Number(r.claim_id),
      epoch: Number(r.epoch),
      ruling_round: Number(r.ruling_round ?? 1),
      verdict: String(r.verdict) as Verdict,
      supermajority_count: Number(r.supermajority_count),
      total_models: Number(r.total_models),
      required_majority: Number(r.required_majority),
      evidence_packet_json: String(r.evidence_packet_json),
      evidence_hash: String(r.evidence_hash),
      attestation_bundle_json: String(r.attestation_bundle_json),
      attestation_hash: String(r.attestation_hash),
      submitted_tx_hash: r.submitted_tx_hash ? String(r.submitted_tx_hash) : null,
      mode: String(r.mode) as JuryRulingRecord["mode"],
      created_at: Number(r.created_at),
      votes,
    };
  }

  saveJuryRuling(ruling: JuryRulingRecord): number {
    const round = ruling.ruling_round ?? 1;
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(
          `DELETE FROM jury_rulings WHERE claim_id = ? AND epoch = ? AND ruling_round = ?`,
        )
        .run(ruling.claim_id, ruling.epoch, round);

      const res = this.db
        .prepare(
          `INSERT INTO jury_rulings (
            claim_id, epoch, ruling_round, verdict, supermajority_count, total_models,
            required_majority, evidence_packet_json, evidence_hash,
            attestation_bundle_json, attestation_hash, submitted_tx_hash,
            mode, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          ruling.claim_id,
          ruling.epoch,
          round,
          ruling.verdict,
          ruling.supermajority_count,
          ruling.total_models,
          ruling.required_majority,
          ruling.evidence_packet_json,
          ruling.evidence_hash,
          ruling.attestation_bundle_json,
          ruling.attestation_hash,
          ruling.submitted_tx_hash,
          ruling.mode,
          ruling.created_at,
        );

      const rulingId = Number(res.lastInsertRowid);
      const insertVote = this.db.prepare(
        `INSERT INTO jury_model_outputs (
          ruling_id, model, vote, confidence, reasoning, raw_request, raw_response,
          request_hash, response_hash, chat_id, signature_kind, signature_valid,
          signing_address, signing_algo, attestation_nonce, gateway_nonce_matched,
          model_attestation_present, error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );

      for (const v of ruling.votes) {
        insertVote.run(
          rulingId,
          v.model,
          v.vote,
          v.confidence,
          v.reasoning,
          v.rawRequest,
          v.rawResponse,
          v.requestHash,
          v.responseHash,
          v.chatId,
          v.signatureKind,
          v.signatureValid ? 1 : 0,
          v.signingAddress,
          v.signingAlgo,
          v.attestationNonce,
          v.gatewayNonceMatched ? 1 : 0,
          v.modelAttestationPresent ? 1 : 0,
          v.error,
        );
      }
      this.db.exec("COMMIT");
      return rulingId;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  markJuryRulingSubmitted(
    claimId: number,
    epoch: number,
    txHash: string,
    rulingRound = 1,
  ): void {
    this.db
      .prepare(
        `UPDATE jury_rulings SET submitted_tx_hash = ? WHERE claim_id = ? AND epoch = ? AND ruling_round = ?`,
      )
      .run(txHash, claimId, epoch, rulingRound);
  }

  saveGeneratedPage(page: GeneratedPageRecord): number {
    const res = this.db
      .prepare(
        `INSERT INTO generated_pages (
          claim_id, epoch, yes_price_e6, no_price_e6, snapshot_json, prompt,
          prompt_hash, model, summary, markdown, sentences_json, page_hash,
          signature_kind, signature_valid, chat_id, mode, submitted_tx_hash, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        page.claim_id,
        page.epoch,
        page.yes_price_e6,
        page.no_price_e6,
        page.snapshot_json,
        page.prompt,
        page.prompt_hash,
        page.model,
        page.summary,
        page.markdown,
        JSON.stringify(page.sentences),
        page.page_hash,
        page.signature_kind,
        page.signature_valid ? 1 : 0,
        page.chat_id,
        page.mode,
        page.submitted_tx_hash,
        page.created_at,
      );
    return Number(res.lastInsertRowid);
  }

  getLatestGeneratedPage(claimId: number): GeneratedPageRecord | null {
    const r = this.db
      .prepare(
        `SELECT * FROM generated_pages WHERE claim_id = ? ORDER BY id DESC LIMIT 1`,
      )
      .get(claimId) as Record<string, unknown> | undefined;
    if (!r) return null;
    return {
      id: Number(r.id),
      claim_id: Number(r.claim_id),
      epoch: Number(r.epoch),
      yes_price_e6: Number(r.yes_price_e6),
      no_price_e6: Number(r.no_price_e6),
      snapshot_json: String(r.snapshot_json),
      prompt: String(r.prompt),
      prompt_hash: String(r.prompt_hash),
      model: String(r.model),
      summary: String(r.summary),
      markdown: String(r.markdown),
      sentences: JSON.parse(String(r.sentences_json)) as AnnotatedSentence[],
      page_hash: String(r.page_hash),
      signature_kind: r.signature_kind ? String(r.signature_kind) : null,
      signature_valid: Number(r.signature_valid) === 1,
      chat_id: r.chat_id ? String(r.chat_id) : null,
      mode: String(r.mode) as GeneratedPageRecord["mode"],
      submitted_tx_hash: r.submitted_tx_hash ? String(r.submitted_tx_hash) : null,
      created_at: Number(r.created_at),
    };
  }
}
