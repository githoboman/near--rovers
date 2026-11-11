"use client";

import React, { useState } from "react";
import { ShieldCheck, Sparkles } from "lucide-react";
import { formatPct } from "@/lib/amm";
import { ArticleSentence, GeneratedArticle } from "@/lib/types";

interface ConfidenceArticleProps {
  article: GeneratedArticle;
  onChainPageHash: string | null;
}

export function ConfidenceArticle({ article, onChainPageHash }: ConfidenceArticleProps) {
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const selected: ArticleSentence | undefined = article.sentences[selectedIdx] ?? article.sentences[0];
  const hashMatches =
    onChainPageHash !== null &&
    onChainPageHash.toLowerCase() === article.pageHash.toLowerCase();

  return (
    <section className="panel" style={{ padding: "24px 28px" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          paddingBottom: 14,
          marginBottom: 18,
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Sparkles size={15} color="var(--muted)" />
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            AI-Synthesized Entry · Epoch #{article.epoch}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="pill" style={{ fontSize: 11.5, color: "var(--muted)" }}>
            Model: {article.model}
          </span>
          <span
            className={`pill tabular ${hashMatches ? "pill-yes" : ""}`}
            style={{ fontSize: 11.5 }}
            title={`page_hash = hash(snapshot + prompt + model): ${article.pageHash}`}
          >
            <ShieldCheck size={12} />
            {onChainPageHash ? `Hash ${onChainPageHash.slice(0, 10)}…` : "Draft"}
          </span>
        </div>
      </div>

      <div
        className="serif"
        style={{
          fontSize: 18.5,
          lineHeight: 1.75,
          color: "var(--ink)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {article.sentences.map((sentence, idx) => {
          const isSelected = idx === selectedIdx;
          return (
            <p key={idx} style={{ margin: 0 }}>
              <span
                role="button"
                tabIndex={0}
                onClick={() => setSelectedIdx(idx)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedIdx(idx);
                  }
                }}
                className={`conf-sentence band-${sentence.band}`}
                style={
                  isSelected
                    ? { outline: "1px solid var(--border-strong)", outlineOffset: 2 }
                    : undefined
                }
              >
                {sentence.text}
              </span>{" "}
              <span
                className={`pill tabular ${
                  sentence.band === "high"
                    ? "pill-yes"
                    : sentence.band === "low"
                    ? "pill-no"
                    : "pill-contested"
                }`}
                style={{
                  fontSize: 11,
                  height: 20,
                  verticalAlign: "middle",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {formatPct(sentence.confidenceE6, 1)}
              </span>
            </p>
          );
        })}
      </div>

      {selected && (
        <div
          style={{
            marginTop: 20,
            padding: "12px 14px",
            borderRadius: 8,
            background: "var(--surface-muted)",
            border: "1px solid var(--border)",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            fontSize: 12.5,
            color: "var(--muted)",
          }}
        >
          <div>
            <strong style={{ color: "var(--ink)" }}>Sentence #{selectedIdx + 1} provenance:</strong>{" "}
            {selected.citation ?? "Market snapshot"} · Confidence{" "}
            <span className="tabular" style={{ color: "var(--ink)", fontWeight: 600 }}>
              {formatPct(selected.confidenceE6, 1)}
            </span>
          </div>
          <div className="tabular" style={{ fontSize: 11.5 }}>
            Snapshot {formatPct(article.snapshotPriceE6, 1)} YES · PageHash{" "}
            {article.pageHash.slice(0, 12)}…
          </div>
        </div>
      )}
    </section>
  );
}

