import React from "react";
import { formatNear } from "@/lib/amm";
import { chainTimeToDate, formatDateTime } from "@/lib/format";
import { MarketView } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";

/** Liquidity and epoch information for the sidebar. */
export function MarketStats({ market }: { market: MarketView }) {
  const openedAt = chainTimeToDate(market.opened_at);
  const epochEnd = chainTimeToDate(market.epoch_end);

  return (
    <section className="panel" style={{ padding: "18px 20px" }} aria-label="Market liquidity and epoch">
      <div className="eyebrow" style={{ marginBottom: 14 }}>
        Liquidity
      </div>
      <dl className="kv tabular">
        <dt>YES reserve</dt>
        <dd style={{ color: "var(--yes)" }}>{formatNear(market.yes_reserve, 3)} Ⓝ</dd>
        <dt>NO reserve</dt>
        <dd style={{ color: "var(--no)" }}>{formatNear(market.no_reserve, 3)} Ⓝ</dd>
        <dt>Collateral vault</dt>
        <dd>{formatNear(market.collateral_vault, 3)} Ⓝ</dd>
        <dt>Fee pool</dt>
        <dd>{formatNear(market.fee_pool, 4)} Ⓝ</dd>
        <dt>Trading fee</dt>
        <dd>{(market.fee_bps / 100).toFixed(2)}%</dd>
      </dl>

      <div className="eyebrow" style={{ margin: "22px 0 14px", paddingTop: 16, borderTop: "1px solid var(--border)" }}>
        Epoch
      </div>
      <dl className="kv tabular">
        <dt>Epoch</dt>
        <dd>#{market.epoch}</dd>
        <dt>Status</dt>
        <dd>
          <StatusBadge status={market.status} />
        </dd>
        <dt>Opened</dt>
        <dd>
          <time suppressHydrationWarning dateTime={openedAt?.toISOString()}>
            {formatDateTime(openedAt)}
          </time>
        </dd>
        <dt>Epoch end</dt>
        <dd>
          <time suppressHydrationWarning dateTime={epochEnd?.toISOString()}>
            {formatDateTime(epochEnd)}
          </time>
        </dd>
      </dl>
    </section>
  );
}
