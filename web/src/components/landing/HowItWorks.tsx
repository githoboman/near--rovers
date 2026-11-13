import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/Reveal";

const STEPS = [
  {
    title: "Submit a factual claim",
    body: "Anyone can propose a falsifiable statement, attach the evidence behind it, and seed its market with NEAR collateral. The claim becomes a page in the encyclopedia.",
  },
  {
    title: "Let the market price its confidence",
    body: "Traders buy and sell YES and NO shares in a continuous automated market. The YES price is the market's running confidence, and it moves with every trade.",
  },
  {
    title: "Resolve contested claims with an attested AI jury",
    body: "When a claim is disputed, a challenger posts a bond to escalate it. NEAR AI Cloud's attested jury reviews the evidence and returns a verdict with an attestation hash recorded against the market.",
  },
  {
    title: "Settle the market",
    body: "After a challenge window in which the ruling can be counter-challenged, the market settles and winning positions are redeemed from the collateral vault.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="l-section" aria-labelledby="how-title">
      <div className="l-wrap l-grid">
        <div className="sticky-col">
          <Reveal>
            <p className="eyebrow">How Perpetua works</p>
            <h2 id="how-title" className="l-heading" style={{ marginTop: 18 }}>
              From a claim to a settled price.
            </h2>
            <p className="l-lede">
              Four steps turn an open question into a continuously priced, evidence-backed entry.
            </p>
            <div style={{ marginTop: 28 }}>
              <Link href="/create" className="btn">
                <span>Propose a claim</span>
                <ArrowRight size={14} className="arrow" aria-hidden="true" />
              </Link>
            </div>
          </Reveal>
        </div>

        <ol className="steps">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.title} className="step" delay={60}>
              <span className="step-index">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <h3 className="step-title">{s.title}</h3>
                <p className="step-body">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
