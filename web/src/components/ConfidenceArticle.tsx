"use client";

import React, { useState } from "react";
import { ShieldCheck, Cpu } from "lucide-react";
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
    <section className="panel" style={{ padding: "20px 24px" }}>
      {/* Header bar: Model & Attested Page Hash */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          paddingBottom: 12,
          marginBottom: 16,
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Cpu size={14} color="var(--accent)" />
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
            Synthesized Encyclopedia Entry · Epoch #{article.epoch}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="pill tabular" style={{ fontSize: 11, color: "var(--muted)" }}>
            {article.model.split("/").pop()}
          </span>
          <span
            className={`pill tabular ${hashMatches ? "pill-yes" : ""}`}
            style={{ fontSize: 11 }}
            title={`On-chain page_hash = sha256(snapshot + prompt + model):\n${article.pageHash}`}
          >
            <ShieldCheck size={12} />
            {onChainPageHash ? `Attested ${onChainPageHash.slice(0, 10)}…` : "Local Draft"}
          </span>
        </div>
      </div>

      {/* Article Body */}
      <div
        className="serif"
        style={{
          fontSize: 17.5,
          lineHeight: 1.7,
          color: "var(--ink)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {article.sentences.map((sentence, idx) => {
          const isSelected = idx === selectedIdx;
          const bandClass =
            sentence.band === "high"
              ? "pill-yes"
              : sentence.band === "low"
              ? "pill-no"
              : "pill-contested";

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
                    ? {
                        outline: "1px solid var(--accent)",
                        outlineOffset: 2,
                        background:
                          sentence.band === "high"
                            ? "rgba(16, 185, 129, 0.18)"
                            : sentence.band === "low"
                            ? "rgba(244, 63, 94, 0.18)"
                            : "rgba(245, 158, 11, 0.18)",
                      }
                    : undefined
                }
              >
                {sentence.text}
              </span>{" "}
              <span
                className={`pill tabular ${bandClass}`}
                style={{
                  fontSize: 10.5,
                  height: 18,
                  padding: "0 6px",
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

      {/* Selected Sentence Provenance Card */}
      {selected && (
        <div
          style={{
            marginTop: 18,
            padding: "10px 14px",
            borderRadius: 6,
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
            {selected.citation ?? "Consensus market snapshot"} · Confidence{" "}
            <span className="tabular" style={{ color: "var(--ink)", fontWeight: 600 }}>
              {formatPct(selected.confidenceE6, 1)}
            </span>
          </div>
          <div className="tabular" style={{ fontSize: 11, color: "var(--muted-light)" }}>
            Snapshot {formatPct(article.snapshotPriceE6, 1)} YES · Hash {article.pageHash.slice(0, 10)}…
          </div>
        </div>
      )}
    </section>
  );
}
