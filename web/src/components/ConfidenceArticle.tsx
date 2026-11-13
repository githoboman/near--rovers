"use client";

import React, { useState } from "react";
import { ShieldCheck, Cpu } from "lucide-react";
import { formatPct } from "@/lib/amm";
import { ArticleSentence, GeneratedArticle } from "@/lib/types";

interface ConfidenceArticleProps {
  article: GeneratedArticle;
  onChainPageHash: string | null;
  /** Claim evidence URIs; used to link inline citation markers to the evidence list. */
  evidenceUris?: string[];
}

export function ConfidenceArticle({ article, onChainPageHash, evidenceUris = [] }: ConfidenceArticleProps) {
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const selected: ArticleSentence | undefined = article.sentences[selectedIdx] ?? article.sentences[0];
  const hashMatches =
    onChainPageHash !== null &&
    onChainPageHash.toLowerCase() === article.pageHash.toLowerCase();

  return (
    <article aria-label="Encyclopedia entry">
      {/* Meta bar */}
      <div className="section-title" style={{ flexWrap: "wrap" }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Cpu size={13} color="var(--accent)" aria-hidden="true" />
          Encyclopedia entry · Epoch #{article.epoch}
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="pill tabular" style={{ fontSize: 11 }}>
            {article.model.split("/").pop()}
          </span>
          <span
            className={`pill tabular ${hashMatches ? "pill-yes" : ""}`}
            style={{ fontSize: 11 }}
            title={`On-chain page_hash = sha256(snapshot + prompt + model):\n${article.pageHash}`}
          >
            <ShieldCheck size={12} aria-hidden="true" />
            {onChainPageHash ? `Attested ${onChainPageHash.slice(0, 10)}…` : "Local Draft"}
          </span>
        </div>
      </div>

      {/* Confidence legend */}
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", fontSize: 11.5, color: "var(--muted)", marginBottom: 22 }}
        aria-label="Confidence legend"
      >
        {[
          ["var(--yes)", "High confidence · 65%+"],
          ["var(--contested)", "Contested · 35–65%"],
          ["var(--no)", "Low confidence · under 35%"],
        ].map(([c, l]) => (
          <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span aria-hidden="true" style={{ width: 14, height: 2, background: c }} />
            {l}
          </span>
        ))}
      </div>

      {/* Article body */}
      <div
        className="serif"
        style={{
          fontSize: 19,
          lineHeight: 1.85,
          color: "var(--ink)",
          display: "flex",
          flexDirection: "column",
          gap: 20,
          maxWidth: "68ch",
        }}
      >
        {article.sentences.map((sentence, idx) => {
          const isSelected = idx === selectedIdx;
          const evIdx = sentence.citation ? evidenceUris.indexOf(sentence.citation) : -1;
          return (
            <p key={idx} style={{ margin: 0 }}>
              <span
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                title={`Confidence ${formatPct(sentence.confidenceE6, 1)}`}
                onClick={() => setSelectedIdx(idx)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedIdx(idx);
                  }
                }}
                className={`conf-sentence band-${sentence.band}`}
              >
                {sentence.text}
              </span>
              {evIdx >= 0 && (
                <a href={`#evidence-${evIdx + 1}`} className="cite-mark" aria-label={`Evidence ${evIdx + 1}`}>
                  [{evIdx + 1}]
                </a>
              )}
            </p>
          );
        })}
      </div>

      {/* Selected sentence provenance */}
      {selected && (
        <div
          style={{
            marginTop: 28,
            paddingTop: 14,
            borderTop: "1px solid var(--border)",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            fontSize: 12.5,
            color: "var(--muted)",
          }}
          aria-live="polite"
        >
          <div style={{ overflowWrap: "anywhere" }}>
            <strong style={{ color: "var(--ink)" }}>Sentence {selectedIdx + 1}</strong> · {selected.citation ?? "Consensus market snapshot"} ·{" "}
            <span
              className="tabular"
              style={{
                fontWeight: 600,
                color:
                  selected.band === "high" ? "var(--yes)" : selected.band === "low" ? "var(--no)" : "var(--contested)",
              }}
            >
              {formatPct(selected.confidenceE6, 1)}
            </span>
          </div>
          <div className="tabular" style={{ fontSize: 11, color: "var(--muted-light)" }}>
            Snapshot {formatPct(article.snapshotPriceE6, 1)} YES · Hash {article.pageHash.slice(0, 10)}…
          </div>
        </div>
      )}
    </article>
  );
}
