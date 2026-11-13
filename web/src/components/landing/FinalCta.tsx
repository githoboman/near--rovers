import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/Reveal";

export function FinalCta() {
  return (
    <>
      <section className="l-section final-cta" aria-labelledby="cta-title">
        <div className="l-wrap">
          <Reveal>
            <p className="eyebrow" style={{ color: "var(--accent)" }}>
              Start here
            </p>
            <h2 id="cta-title" className="l-heading" style={{ marginTop: 22 }}>
              Every claim has a market. Find the ones worth testing.
            </h2>
          </Reveal>
          <Reveal delay={140}>
            <div style={{ marginTop: 44, display: "flex", flexWrap: "wrap", gap: 12 }}>
              <Link href="/encyclopedia" className="btn btn-primary btn-lg">
                <span>Explore the Encyclopedia</span>
                <ArrowRight size={16} className="arrow" aria-hidden="true" />
              </Link>
              <Link href="/create" className="btn btn-ghost btn-lg">
                <span>Propose a claim</span>
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
      <footer className="site-footer">
        <div className="l-wrap">
          <span>Perpetua · Prediction-market encyclopedia on NEAR</span>
          <span style={{ display: "flex", gap: 20 }}>
            <Link href="/encyclopedia">Encyclopedia</Link>
            <Link href="/create">Propose Claim</Link>
            <a href="https://github.com/githoboman/near--rovers" target="_blank" rel="noreferrer">
              Source
            </a>
          </span>
        </div>
      </footer>
    </>
  );
}
