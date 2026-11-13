"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Sparkles, Scale, AlertCircle } from "lucide-react";
import { IntentsDepositPreview } from "@/components/IntentsDepositPreview";
import { NETWORK_LABEL } from "@/lib/near";
import { usePerpetua } from "@/providers/PerpetuaStore";

export default function CreateClaimPage() {
  const router = useRouter();
  const { mode, executeCreateClaim } = usePerpetua();
  const [text, setText] = useState("");
  const [category, setCategory] = useState("audit_status");
  const [urisRaw, setUrisRaw] = useState("https://github.com/");
  const [epochHours, setEpochHours] = useState(168);
  const [seedNear, setSeedNear] = useState("1.0");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedSeed = useMemo(() => {
    const val = parseFloat(seedNear);
    return isNaN(val) || val <= 0 ? 1.0 : val;
  }, [seedNear]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const evidenceUris = urisRaw
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const id = await executeCreateClaim({
        text: text.trim(),
        evidenceUris,
        category,
        epochHours,
        seedNear,
      });
      router.push(`/claims/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create claim");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <Link
        href="/encyclopedia"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12.5,
          color: "var(--muted)",
          transition: "color 0.15s ease",
        }}
      >
        <ArrowLeft size={13} />
        <span>Back to Encyclopedia</span>
      </Link>

      <div>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: "-0.015em",
            color: "var(--ink)",
          }}
        >
          Propose Protocol Fact Claim
        </h1>
        <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
          Initializes an epoch-1 continuous constant-product market at 50/50 equilibrium on NEAR{" "}
          {mode === "demo" ? "(Demo Ledger)" : `(${NETWORK_LABEL})`}.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="panel"
        style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}
      >
        <div>
          <label
            htmlFor="claim-text"
            style={{ display: "block", fontSize: 12.5, fontWeight: 500, color: "var(--ink)", marginBottom: 6 }}
          >
            Factual Claim Statement
          </label>
          <textarea
            id="claim-text"
            required
            rows={3}
            maxLength={1024}
            className="field-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Protocol X core router passed a formal security audit by Trail of Bits prior to mainnet launch"
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label
              htmlFor="claim-cat"
              style={{ display: "block", fontSize: 12.5, fontWeight: 500, color: "var(--ink)", marginBottom: 6 }}
            >
              Domain Category
            </label>
            <select
              id="claim-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="field-input"
            >
              <option value="audit_status">Audit Status</option>
              <option value="authorship">Who Built What</option>
              <option value="tvl">TVL Claims</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="claim-seed"
              style={{ display: "block", fontSize: 12.5, fontWeight: 500, color: "var(--ink)", marginBottom: 6 }}
            >
              Initial Seed Liquidity (NEAR)
            </label>
            <input
              id="claim-seed"
              type="text"
              required
              className="field-input tabular"
              value={seedNear}
              onChange={(e) => setSeedNear(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="claim-epoch"
            style={{ display: "block", fontSize: 12.5, fontWeight: 500, color: "var(--ink)", marginBottom: 6 }}
          >
            Epoch Resolution Horizon (hours)
          </label>
          <input
            id="claim-epoch"
            type="number"
            min={1}
            max={8760}
            className="field-input tabular"
            value={epochHours}
            onChange={(e) => setEpochHours(Number(e.target.value) || 24)}
          />
        </div>

        <div>
          <label
            htmlFor="claim-uris"
            style={{ display: "block", fontSize: 12.5, fontWeight: 500, color: "var(--ink)", marginBottom: 6 }}
          >
            Evidence Citation URIs (one per line)
          </label>
          <textarea
            id="claim-uris"
            rows={3}
            className="field-textarea tabular"
            style={{ fontSize: 12.5 }}
            value={urisRaw}
            onChange={(e) => setUrisRaw(e.target.value)}
          />
        </div>

        {/* Starting Pool Accounting Preview */}
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 6,
            background: "var(--surface-muted)",
            border: "1px solid var(--border)",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--muted)" }}>
            <Scale size={13} color="var(--accent)" />
            <span>Market Initialization:</span>
          </div>
          <span className="tabular" style={{ color: "var(--ink)", fontWeight: 500 }}>
            YES {(parsedSeed / 2).toFixed(2)} Ⓝ · NO {(parsedSeed / 2).toFixed(2)} Ⓝ · 50.0% Implied
          </span>
        </div>

        {error && (
          <div
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              background: "var(--no-bg)",
              border: "1px solid var(--no-border)",
              color: "var(--no)",
              fontSize: 12.5,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <AlertCircle size={13} />
            <span>{error}</span>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
          <Link href="/encyclopedia" className="btn">
            Cancel
          </Link>
          <button type="submit" className="btn btn-primary" disabled={submitting || !text.trim()}>
            <Sparkles size={13} />
            <span>{submitting ? "Deploying on NEAR..." : "Propose Claim & Seed Market"}</span>
          </button>
        </div>
      </form>

      <IntentsDepositPreview />
    </div>
  );
}
