"use client";

import React, { useMemo } from "react";
import { formatNear } from "@/lib/amm";
import { usePerpetua } from "@/providers/PerpetuaStore";
import { Reveal } from "@/components/Reveal";

function formatWindow(ns: string): string {
  try {
    const seconds = Number(BigInt(ns) / 1_000_000_000n);
    if (seconds < 120) return `${seconds}s`;
    if (seconds < 7200) return `${Math.round(seconds / 60)} min`;
    if (seconds < 172800) return `${Math.round(seconds / 3600)} h`;
    return `${Math.round(seconds / 86400)} d`;
  } catch {
    return "—";
  }
}

export function Architecture() {
  const { bundles, config, mode } = usePerpetua();

  const evidenceCount = useMemo(
    () => bundles.reduce((acc, b) => acc + b.claim.evidence_uris.length, 0),
    [bundles]
  );
  const asset =
    config.collateral_asset === "NativeNear" ? "Native NEAR" : `NEP-141 · ${config.collateral_asset.Nep141.token_id}`;

  const layers = [
    {
      index: "01",
      title: "Evidence-backed claims",
      body: "Every claim is a single, falsifiable statement stored on-chain with its evidence links. The encyclopedia article is generated from the claim, its evidence and the current market, and its page hash is attested so readers can check what they are reading.",
      facts: [
        ["Evidence sources", `${evidenceCount}`],
        ["Claims", `${bundles.length}`],
      ],
    },
    {
      index: "02",
      title: "Continuous prediction markets",
      body: "Each claim has a perpetual binary market. YES and NO shares trade against an automated market maker, so confidence is always priced and always moving, with no order books and no waiting for a round to close.",
      facts: [
        ["Trading fee", `${(config.fee_bps / 100).toFixed(2)}%`],
        ["Collateral", asset],
      ],
    },
    {
      index: "03",
      title: "AI jury",
      body: "A contested claim can be escalated by posting a bond. The market freezes at its current price while NEAR AI Cloud's attested jury of models weighs the evidence. Each vote and the combined verdict are recorded with an attestation.",
      facts: [
        ["Escalation bond", `${formatNear(config.escalation_bond, 2)} Ⓝ`],
        ["Counter-challenge", `${formatNear((BigInt(config.escalation_bond) * 2n).toString(), 2)} Ⓝ`],
      ],
    },
    {
      index: "04",
      title: "On-chain settlement",
      body: "A ruling is not final the moment it lands. It opens a challenge window in which it can be counter-challenged at a higher bond. Once the window closes, the market settles and holders redeem from the collateral vault on NEAR.",
      facts: [
        ["Challenge window", `${formatWindow(config.challenge_window_ns)}${mode === "demo" ? " (demo)" : ""}`],
        ["Settlement", "Contract-enforced"],
      ],
    },
  ];

  return (
    <section id="architecture" className="l-section" aria-labelledby="arch-title">
      <div className="l-wrap">
        <div className="l-grid" style={{ alignItems: "end", marginBottom: 56 }}>
          <Reveal>
            <p className="eyebrow">Verification architecture</p>
            <h2 id="arch-title" className="l-heading" style={{ marginTop: 18 }}>
              Four layers between a claim and a verdict.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="l-lede" style={{ marginTop: 0, maxWidth: 520 }}>
              Perpetua runs on NEAR Protocol alone. Parameters shown below are read from the active configuration
              {mode === "demo" ? " (Demo Ledger defaults)" : ""}.
            </p>
          </Reveal>
        </div>

        <ol className="arch-list">
          {layers.map((l, i) => (
            <Reveal as="li" key={l.index} className="arch-item" delay={(i % 2) * 90}>
              <span className="step-index">{l.index}</span>
              <h3 className="arch-title">{l.title}</h3>
              <p className="arch-body">{l.body}</p>
              <div className="arch-fact tabular">
                {l.facts.map(([k, v]) => (
                  <span key={k}>
                    {k} <b>{v}</b>
                  </span>
                ))}
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
