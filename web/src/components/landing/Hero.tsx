import React from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight } from "lucide-react";
import { OrbitalNetwork } from "@/components/landing/OrbitalNetwork";

const LEGEND = [
  ["01", "Evidence"],
  ["02", "Prediction Markets"],
  ["03", "AI Jury"],
  ["04", "Settlement"],
] as const;

export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <OrbitalNetwork className="hero-canvas" />
      <div className="hero-vignette" aria-hidden="true" />

      <div className="hero-inner">
        <div className="hero-copy">
          <p className="eyebrow" style={{ color: "var(--accent)" }}>
            Prediction-market encyclopedia on NEAR
          </p>
          <h1 id="hero-title" className="hero-title">
            Truth, priced in real&nbsp;time<span className="dot">.</span>
          </h1>
          <p className="hero-lede">
            An evolving encyclopedia where every claim is backed by a perpetual prediction market and AI-powered
            verification.
          </p>
          <div className="hero-actions">
            <Link href="/encyclopedia" className="btn btn-primary btn-lg">
              <span>Explore the Encyclopedia</span>
              <ArrowRight size={16} className="arrow" aria-hidden="true" />
            </Link>
            <a href="#how-it-works" className="btn btn-ghost btn-lg">
              <span>How it works</span>
              <ArrowDown size={15} aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>

      <ol className="hero-legend" aria-label="Verification pipeline">
        {LEGEND.map(([idx, label]) => (
          <li key={idx}>
            <span>{idx}</span>
            <span>{label}</span>
          </li>
        ))}
      </ol>

      <a href="#overview" className="scroll-cue" aria-label="Scroll to protocol overview">
        <span className="scroll-line" aria-hidden="true" />
        <span>Scroll</span>
      </a>
    </section>
  );
}
