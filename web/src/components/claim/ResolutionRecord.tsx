import React from "react";
import { ShieldCheck } from "lucide-react";
import { formatNear, formatPct } from "@/lib/amm";
import { chainTimeToDate, formatDateTime, shortHash } from "@/lib/format";
import { ClaimBundle } from "@/lib/types";

function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 13.5, color: "var(--muted)" }}>{children}</p>;
}

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h3 className="eyebrow" style={{ marginBottom: 12 }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

export function ResolutionRecord({ bundle }: { bundle: ClaimBundle }) {
  const { claim, market, ruling } = bundle;
  const escalatedAt = chainTimeToDate(market.escalated_at);
  const ruledAt = chainTimeToDate(market.ruled_at);
  const deadline = chainTimeToDate(market.challenge_deadline);
  const settledAt = chainTimeToDate(market.settled_at);
  const createdAt = chainTimeToDate(claim.created_at);
  const openedAt = chainTimeToDate(market.opened_at);

  const events: Array<{ label: string; detail?: string; at: Date | null; done: boolean; tone?: "amber" }> = [
    { label: "Claim created", detail: `by ${claim.creator}`, at: createdAt, done: true },
    { label: `Epoch #${market.epoch} opened`, at: openedAt, done: true },
    {
      label: "Escalated to AI jury",
      detail: market.challenger
        ? `${market.challenger} asserted ${market.challenger_side} · market frozen at ${formatPct(
            market.snap_yes_price_e6 ?? market.yes_price_e6,
            1
          )} YES`
        : undefined,
      at: escalatedAt,
      done: Boolean(market.escalated_at),
      tone: "amber",
    },
    {
      label: "Jury verdict recorded",
      detail: market.verdict ? `Verdict: ${market.verdict}` : undefined,
      at: ruledAt,
      done: Boolean(market.ruled_at),
      tone: "amber",
    },
    {
      label: "Challenge window closes",
      detail: market.counter_challenger ? "Ruling was counter-challenged" : undefined,
      at: deadline,
      done: market.status === "Settled",
    },
    { label: "Market settled", at: settledAt, done: market.status === "Settled" },
  ];

  return (
    <div>
      {/* Evidence is rendered separately; this block covers the dispute lifecycle */}
      <Sub title="AI jury decisions">
        {ruling && ruling.modelVotes.length > 0 ? (
          <div>
            <p style={{ fontSize: 13.5, color: "var(--muted)", marginBottom: 14 }}>
              Combined verdict{" "}
              <strong style={{ color: "var(--ink)" }}>{ruling.finalVerdict}</strong> from {ruling.modelVotes.length}{" "}
              models.
            </p>
            <ul style={{ listStyle: "none", borderTop: "1px solid var(--border)" }}>
              {ruling.modelVotes.map((mv) => {
                const pill = mv.verdict === "True" ? "pill-yes" : mv.verdict === "False" ? "pill-no" : "pill-contested";
                const conf = mv.confidence <= 1 ? Math.round(mv.confidence * 100) : Math.round(mv.confidence);
                return (
                  <li key={mv.model} style={{ padding: "16px 0", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <span className="tabular" style={{ fontWeight: 600 }}>
                        {mv.model.split("/").pop()}
                      </span>
                      <span className={`pill tabular ${pill}`}>
                        {mv.verdict} · {conf}%
                      </span>
                    </div>
                    <p style={{ marginTop: 8, fontSize: 14, color: "var(--muted)", lineHeight: 1.6 }}>{mv.rationale}</p>
                    {(mv.signatureKind || mv.signingAddress) && (
                      <p className="tabular" style={{ marginTop: 8, fontSize: 11.5, color: "var(--muted-light)", overflowWrap: "anywhere" }}>
                        {mv.signatureKind === "provider_tee" ? "TEE-signed" : mv.signatureKind === "gateway" ? "Gateway-signed" : "Signed"}
                        {mv.signingAddress ? ` · ${mv.signingAddress}` : ""}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <Empty>
            {market.status === "Escalated"
              ? "The jury is reviewing this claim. Votes appear here once a ruling is submitted."
              : "No jury ruling for this claim. A ruling is requested only if the claim is escalated."}
          </Empty>
        )}
      </Sub>

      <Sub title="Attestation">
        {market.attestation_hash || ruling?.attestationHash ? (
          <dl className="kv tabular" style={{ gridTemplateColumns: "auto 1fr" }}>
            <dt>Attestation hash</dt>
            <dd title={market.attestation_hash ?? ruling?.attestationHash}>
              <ShieldCheck size={12} color="var(--yes)" style={{ marginRight: 6, verticalAlign: "-1px" }} />
              {shortHash(market.attestation_hash ?? ruling?.attestationHash ?? "", 14, 8)}
            </dd>
            <dt>Verdict</dt>
            <dd>{market.verdict ?? ruling?.finalVerdict ?? "—"}</dd>
            <dt>Recorded</dt>
            <dd>
              <time suppressHydrationWarning dateTime={ruledAt?.toISOString()}>
                {formatDateTime(ruledAt)}
              </time>
            </dd>
          </dl>
        ) : (
          <Empty>No attestation has been recorded for this epoch.</Empty>
        )}
      </Sub>

      <Sub title="Disputes">
        {market.challenger ? (
          <dl className="kv tabular">
            <dt>Challenger</dt>
            <dd>{market.challenger}</dd>
            <dt>Asserted outcome</dt>
            <dd>{market.challenger_side ?? "—"}</dd>
            <dt>Bond</dt>
            <dd>{formatNear(market.challenger_bond, 2)} Ⓝ</dd>
            <dt>Escalated</dt>
            <dd>
              <time suppressHydrationWarning dateTime={escalatedAt?.toISOString()}>
                {formatDateTime(escalatedAt)}
              </time>
            </dd>
          </dl>
        ) : (
          <Empty>No dispute has been filed in this epoch.</Empty>
        )}
      </Sub>

      <Sub title="Counter-challenges">
        {market.counter_challenger ? (
          <dl className="kv tabular">
            <dt>Counter-challenger</dt>
            <dd>{market.counter_challenger}</dd>
            <dt>Asserted outcome</dt>
            <dd>{market.counter_side ?? "—"}</dd>
            <dt>Bond</dt>
            <dd>{formatNear(market.counter_bond, 2)} Ⓝ</dd>
          </dl>
        ) : (
          <Empty>The ruling has not been counter-challenged.</Empty>
        )}
      </Sub>

      <Sub title="Settlement history">
        <ol className="timeline">
          {events.map((e) => (
            <li key={e.label} data-done={e.done} data-tone={e.tone}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 14, color: e.done ? "var(--ink)" : "var(--muted-light)" }}>{e.label}</span>
                <span className="tabular" style={{ fontSize: 12, color: "var(--muted-light)" }}>
                  {e.done || e.at ? (
                    <time suppressHydrationWarning dateTime={e.at?.toISOString()}>
                      {formatDateTime(e.at)}
                    </time>
                  ) : "Pending"}
                </span>
              </div>
              {e.detail && e.done && (
                <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2, overflowWrap: "anywhere" }}>{e.detail}</p>
              )}
            </li>
          ))}
        </ol>
      </Sub>
    </div>
  );
}
