"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Gavel, Scale, ShieldCheck } from "lucide-react";
import { formatNear, formatPct } from "@/lib/amm";
import { JuryRulingRecord, MarketView, Outcome, PositionView, Verdict } from "@/lib/types";
import { usePerpetua } from "@/providers/PerpetuaStore";

interface EscalatePanelProps {
  claimId: number;
  market: MarketView;
  ruling: JuryRulingRecord | null;
  position?: PositionView;
  /** Set false when the page already renders the full jury record elsewhere. */
  showVotes?: boolean;
}

const STEPS: Array<MarketView["status"]> = ["Open", "Escalated", "Ruled", "Settled"];

export function EscalatePanel({ claimId, market, ruling, position, showVotes = true }: EscalatePanelProps) {
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
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    if (market.status !== "Ruled") {
      setNowMs(0);
      return;
    }
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [market.status]);

  const bondFormatted = formatNear(config.escalation_bond, 2);
  const counterBondFormatted = formatNear((BigInt(config.escalation_bond) * 2n).toString(), 2);
  const counterSide: Outcome = market.verdict === "True" ? "No" : "Yes";
  const deadlineMs = market.challenge_deadline
    ? Number(BigInt(market.challenge_deadline) / 1_000_000n)
    : 0;
  const clockReady = nowMs > 0;
  const remainingSec = clockReady ? Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000)) : null;
  const windowOpen = market.status === "Ruled" && remainingSec !== null && remainingSec > 0;

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
    <section className="panel" style={{ padding: "18px 20px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Gavel size={14} color="var(--accent)" />
          <h2 style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink)" }}>Optimistic Escalation</h2>
        </div>
        <span
          className={`pill ${
            market.status === "Escalated" || market.status === "Ruled"
              ? "pill-contested"
              : market.status === "Settled"
              ? "pill-yes"
              : ""
          }`}
          style={{ fontSize: 11 }}
        >
          {market.status}
        </span>
      </div>

      {/* State Machine Stepper */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 4,
          marginBottom: 14,
        }}
      >
        {STEPS.map((step) => {
          const active = market.status === step;
          const passed = STEPS.indexOf(market.status) > STEPS.indexOf(step);
          return (
            <div
              key={step}
              style={{
                padding: "4px 2px",
                textAlign: "center",
                borderRadius: 4,
                fontSize: 11,
                fontWeight: active ? 600 : 400,
                border: "1px solid",
                borderColor: active
                  ? "var(--accent)"
                  : passed
                  ? "var(--yes-border)"
                  : "var(--border)",
                background: active
                  ? "var(--surface-hover)"
                  : passed
                  ? "var(--yes-bg)"
                  : "var(--surface-muted)",
                color: active ? "var(--ink)" : passed ? "var(--yes)" : "var(--muted-light)",
              }}
            >
              {step}
            </div>
          );
        })}
      </div>

      {market.status === "Open" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.45 }}>
            Dispute current implied confidence ({formatPct(market.yes_price_e6, 1)} YES) by
            attaching a <strong className="tabular" style={{ color: "var(--ink)" }}>{bondFormatted} Ⓝ</strong> bond.
            Triggers an attested 3-model TEE jury resolution.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {(["Yes", "No"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                className="btn btn-sm"
                onClick={() => setSide(opt)}
                style={{
                  borderColor: side === opt ? "var(--accent)" : "var(--border)",
                  background: side === opt ? "var(--surface-hover)" : "var(--surface-muted)",
                  color: side === opt ? "var(--ink)" : "var(--muted)",
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
            style={{ width: "100%", height: 36 }}
          >
            <AlertTriangle size={13} />
            <span>
              {busy ? "Escalating on NEAR..." : `Escalate with ${bondFormatted} Ⓝ Bond (${side})`}
            </span>
          </button>
        </div>
      )}

      {market.status === "Escalated" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.45 }}>
            Market frozen at{" "}
            <strong className="tabular" style={{ color: "var(--ink)" }}>
              {formatPct(market.snap_yes_price_e6 ?? market.yes_price_e6, 1)} YES
            </strong>
            . Challenger asserted <strong>{market.challenger_side}</strong> with{" "}
            <span className="tabular">{formatNear(market.challenger_bond, 2)} Ⓝ</span> bond.
          </p>

          {mode === "demo" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--muted)" }}>
                Simulate TEE Jury Consensus Ruling:
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
            <p style={{ fontSize: 12, color: "var(--muted-light)" }}>
              Waiting for offchain TEE jury models (DeepSeek V4.1, Qwen 3.6, GLM 5.3) to submit ruling.
            </p>
          )}
        </div>
      )}

      {market.status === "Ruled" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 6,
              background: "var(--surface-muted)",
              border: "1px solid var(--border)",
              fontSize: 12.5,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
                <Scale size={13} color="var(--accent)" />
                <span style={{ color: "var(--ink)" }}>Attested Verdict: {market.verdict}</span>
              </div>
              <span className="pill pill-contested" style={{ fontSize: 10.5 }}>
                {windowOpen ? "Challenge Active" : clockReady ? "Finalized" : "Checking"}
              </span>
            </div>

            {market.attestation_hash && (
              <div
                className="tabular"
                style={{
                  fontSize: 11,
                  color: "var(--muted-light)",
                  marginTop: 4,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                Attestation: {market.attestation_hash}
              </div>
            )}

            <div
              className="tabular"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 11.5,
                color: windowOpen ? "var(--contested)" : clockReady ? "var(--yes)" : "var(--muted)",
                marginTop: 6,
              }}
            >
              <Clock size={11} />
              <span>
                {windowOpen
                  ? `Challenge window: ${remainingSec}s remaining`
                  : clockReady
                  ? "Challenge window elapsed · Ready for settlement"
                  : "Checking challenge window…"}
              </span>
            </div>
          </div>

          {windowOpen && !market.counter_challenger && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void handleChallengeRuling()}
              disabled={busy}
              style={{ width: "100%", borderColor: "var(--contested-border)", color: "var(--contested)" }}
            >
              <AlertTriangle size={12} />
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
              Fast-Forward Demo Window
            </button>
          )}

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleSettle()}
            disabled={busy || !clockReady || windowOpen}
            style={{ width: "100%", height: 36 }}
          >
            <CheckCircle2 size={13} />
            <span>
              {busy
                ? "Settling on NEAR..."
                : !clockReady
                ? "Checking challenge window..."
                : windowOpen
                ? `Settle Locked (${remainingSec}s)`
                : "Settle & Open Next Epoch"}
            </span>
          </button>
        </div>
      )}

      {/* Attested Jury Votes Cards */}
      {showVotes && ruling && ruling.modelVotes.length > 0 && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--muted)", display: "flex", alignItems: "center", gap: 5 }}>
            <ShieldCheck size={12} color="var(--yes)" />
            <span>Attested Jury Votes ({ruling.modelVotes.length} Confidential TEE Models)</span>
          </div>
          {ruling.modelVotes.map((mv) => {
            const isTrue = mv.verdict === "True";
            const isFalse = mv.verdict === "False";
            return (
              <div
                key={mv.model}
                style={{
                  padding: "8px 10px",
                  borderRadius: 5,
                  background: "var(--surface-muted)",
                  border: "1px solid var(--border)",
                  fontSize: 11.5,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="tabular" style={{ fontWeight: 600, color: "var(--ink)" }}>
                    {mv.model.split("/").pop()}
                  </span>
                  <span
                    className={`pill tabular ${
                      isTrue ? "pill-yes" : isFalse ? "pill-no" : "pill-contested"
                    }`}
                    style={{ fontSize: 10.5, height: 18 }}
                  >
                    {mv.verdict} ({mv.confidence <= 1 ? Math.round(mv.confidence * 100) : Math.round(mv.confidence)}%)
                  </span>
                </div>
                <p style={{ color: "var(--muted)", marginTop: 4, lineHeight: 1.35, fontSize: 11 }}>
                  {mv.rationale}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {hasPosition && market.status === "Settled" && (
        <button
          type="button"
          className="btn btn-yes"
          style={{ width: "100%", marginTop: 12, height: 36 }}
          onClick={() => void handleRedeem()}
          disabled={busy}
        >
          Redeem Epoch #{market.epoch} Shares
        </button>
      )}

      {msg && <p style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>{msg}</p>}
    </section>
  );
}
