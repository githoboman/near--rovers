"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Gavel, Scale } from "lucide-react";
import { formatNear, formatPct } from "@/lib/amm";
import { JuryRulingRecord, MarketView, Outcome, PositionView, Verdict } from "@/lib/types";
import { usePerpetua } from "@/providers/PerpetuaStore";

interface EscalatePanelProps {
  claimId: number;
  market: MarketView;
  ruling: JuryRulingRecord | null;
  position?: PositionView;
}

const STEPS: Array<MarketView["status"]> = ["Open", "Escalated", "Ruled", "Settled"];

export function EscalatePanel({ claimId, market, ruling, position }: EscalatePanelProps) {
  const {
    mode,
    config,
    executeEscalate,
    executeChallengeRuling,
    runDemoJuryFlow,
    fastForwardDemoChallengeWindow,
    executeSettle,
    executeRedeem,
  } = usePerpetua();
  const [side, setSide] = useState<Outcome>(market.yes_price_e6 >= 500_000 ? "No" : "Yes");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (market.status !== "Ruled") return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [market.status]);

  const bondFormatted = formatNear(config.escalation_bond, 2);
  const counterBondFormatted = formatNear((BigInt(config.escalation_bond) * 2n).toString(), 2);
  const counterSide: Outcome = market.verdict === "True" ? "No" : "Yes";
  const deadlineMs = market.challenge_deadline
    ? Number(BigInt(market.challenge_deadline) / 1_000_000n)
    : 0;
  const remainingSec = Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
  const windowOpen = market.status === "Ruled" && remainingSec > 0;

  const handleEscalate = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await executeEscalate(claimId, side);
      setMsg(`Claim escalated with ${bondFormatted} Ⓝ bond asserting ${side}.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Escalation failed");
    } finally {
      setBusy(false);
    }
  };

  const handleChallengeRuling = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await executeChallengeRuling(claimId, counterSide);
      setMsg(`Counter-challenged ruling asserting ${counterSide} with ${counterBondFormatted} Ⓝ bond.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Counter-challenge failed");
    } finally {
      setBusy(false);
    }
  };

  const handleSettle = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await executeSettle(claimId);
      setMsg("Epoch settled and next epoch seeded from retained liquidity.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Settlement failed");
    } finally {
      setBusy(false);
    }
  };

  const handleRedeem = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await executeRedeem(claimId, market.epoch);
      setMsg("Winning shares redeemed.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Redemption failed");
    } finally {
      setBusy(false);
    }
  };

  const hasPosition =
    position && (BigInt(position.yes_shares) > 0n || BigInt(position.no_shares) > 0n);

  return (
    <section className="panel" style={{ padding: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Gavel size={15} />
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>Optimistic Escalation</h2>
        </div>
        <span className="pill" style={{ fontSize: 11.5 }}>
          {market.status}
        </span>
      </div>

      {/* State machine stepper */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 4,
          marginBottom: 16,
        }}
      >
        {STEPS.map((step) => {
          const active = market.status === step;
          const passed = STEPS.indexOf(market.status) > STEPS.indexOf(step);
          return (
            <div
              key={step}
              style={{
                padding: "5px 4px",
                textAlign: "center",
                borderRadius: 6,
                fontSize: 11.5,
                fontWeight: active ? 600 : 500,
                border: "1px solid var(--border)",
                background: active
                  ? "var(--ink)"
                  : passed
                  ? "var(--yes-bg)"
                  : "var(--surface-muted)",
                color: active ? "#ffffff" : passed ? "var(--yes)" : "var(--muted)",
              }}
            >
              {step}
            </div>
          );
        })}
      </div>

      {market.status === "Open" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            Dispute the current market confidence ({formatPct(market.yes_price_e6, 1)} YES) by
            posting a <strong className="tabular" style={{ color: "var(--ink)" }}>{bondFormatted} Ⓝ</strong>{" "}
            bond. An attested 3-model NEAR AI Cloud jury resolves the epoch.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {(["Yes", "No"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                className="btn btn-sm"
                onClick={() => setSide(opt)}
                style={{
                  borderColor: side === opt ? "var(--ink)" : "var(--border)",
                  background: side === opt ? "var(--surface-muted)" : "var(--surface)",
                  fontWeight: side === opt ? 600 : 400,
                }}
              >
                Assert {opt}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleEscalate()}
            disabled={busy}
            style={{ width: "100%" }}
          >
            <AlertTriangle size={14} />
            <span>
              {busy ? "Escalating..." : `Escalate with ${bondFormatted} Ⓝ Bond (${side})`}
            </span>
          </button>
        </div>
      )}

      {market.status === "Escalated" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            Market frozen at{" "}
            <strong className="tabular" style={{ color: "var(--ink)" }}>
              {formatPct(market.snap_yes_price_e6 ?? market.yes_price_e6, 1)} YES
            </strong>
            . Challenger asserted <strong>{market.challenger_side}</strong> with{" "}
            <span className="tabular">{formatNear(market.challenger_bond, 2)} Ⓝ</span> bond.
          </p>

          {mode === "demo" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>
                Simulate NEAR AI Cloud Jury Ruling:
              </span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                {(["True", "False", "Unresolved"] as Verdict[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    className="btn btn-sm"
                    onClick={() => runDemoJuryFlow(claimId, v)}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p style={{ fontSize: 12.5, color: "var(--muted)" }}>
              Waiting for Phase 2 Jury Runner (3+ NEAR AI Cloud TEE models) to call{" "}
              <code className="tabular">submit_ruling</code>.
            </p>
          )}
        </div>
      )}

      {market.status === "Ruled" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 7,
              background: "var(--surface-muted)",
              fontSize: 13,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
              <Scale size={14} />
              <span>Verdict: {market.verdict}</span>
            </div>
            {market.attestation_hash && (
              <div className="tabular" style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>
                Attestation: {market.attestation_hash}
              </div>
            )}
            <div
              className="tabular"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: windowOpen ? "var(--contested)" : "var(--yes)",
                marginTop: 6,
              }}
            >
              <Clock size={12} />
              <span>
                {windowOpen
                  ? `Challenge window closes in ${remainingSec}s`
                  : "Challenge window elapsed — ready to settle"}
              </span>
            </div>
          </div>

          {windowOpen && !market.counter_challenger && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void handleChallengeRuling()}
              disabled={busy}
              style={{ width: "100%" }}
            >
              <AlertTriangle size={13} />
              <span>
                Counter-Challenge ({counterSide}) · {counterBondFormatted} Ⓝ (2x Bond)
              </span>
            </button>
          )}

          {mode === "demo" && windowOpen && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => fastForwardDemoChallengeWindow(claimId)}
              style={{ width: "100%" }}
            >
              Fast-Forward Demo Challenge Window
            </button>
          )}

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleSettle()}
            disabled={busy || windowOpen}
            style={{ width: "100%" }}
          >
            <CheckCircle2 size={14} />
            <span>
              {busy
                ? "Settling..."
                : windowOpen
                ? `Settle locked (${remainingSec}s)`
                : "Settle & Open Next Epoch"}
            </span>
          </button>
        </div>
      )}

      {ruling && ruling.modelVotes.length > 0 && (
        <div
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTop: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600 }}>
            Attested Jury Votes ({ruling.modelVotes.length} TEE Models)
          </div>
          {ruling.modelVotes.map((mv) => (
            <div
              key={mv.model}
              style={{
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                fontSize: 12,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                <span className="tabular">{mv.model.split("/").pop()}</span>
                <span className="tabular">
                  {mv.verdict} (
                  {mv.confidence <= 1
                    ? Math.round(mv.confidence * 100)
                    : Math.round(mv.confidence)}
                  %)
                </span>
              </div>
              <p style={{ color: "var(--muted)", marginTop: 3 }}>{mv.rationale}</p>
            </div>
          ))}
        </div>
      )}

      {hasPosition && market.status === "Settled" && (
        <button
          type="button"
          className="btn btn-yes"
          style={{ width: "100%", marginTop: 12 }}
          onClick={() => void handleRedeem()}
          disabled={busy}
        >
          Redeem Epoch #{market.epoch} Shares
        </button>
      )}

      {msg && <p style={{ marginTop: 10, fontSize: 12.5, color: "var(--muted)" }}>{msg}</p>}
    </section>
  );
}
