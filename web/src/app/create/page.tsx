"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { IntentsDepositPreview } from "@/components/IntentsDepositPreview";
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
    <div style={{ maxWidth: 680, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
      <Link
        href="/"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--muted)" }}
      >
        <ArrowLeft size={14} />
        <span>Back to Encyclopedia</span>
      </Link>

      <div>
        <h1 className="serif" style={{ fontSize: 28, fontWeight: 600 }}>
          Propose a Protocol Claim
        </h1>
        <p style={{ fontSize: 14, color: "var(--muted)", marginTop: 4 }}>
          Every claim initializes an epoch-1 constant-product market at 50/50 confidence ({mode === "demo" ? "Demo Ledger" : "NEAR Testnet"}).
        </p>
      </div>

      <form onSubmit={handleSubmit} className="panel" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label htmlFor="claim-text" style={{ display: "block", fontSize: 13.5, fontWeight: 500, marginBottom: 6 }}>
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
            placeholder="e.g. Protocol X core router passed a formal audit by Trail of Bits prior to v2 launch"
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label htmlFor="claim-cat" style={{ display: "block", fontSize: 13.5, fontWeight: 500, marginBottom: 6 }}>
              Category
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
            <label htmlFor="claim-seed" style={{ display: "block", fontSize: 13.5, fontWeight: 500, marginBottom: 6 }}>
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
          <label htmlFor="claim-epoch" style={{ display: "block", fontSize: 13.5, fontWeight: 500, marginBottom: 6 }}>
            Epoch Length (hours)
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
          <label htmlFor="claim-uris" style={{ display: "block", fontSize: 13.5, fontWeight: 500, marginBottom: 6 }}>
            Primary Evidence URIs (one per line)
          </label>
          <textarea
            id="claim-uris"
            rows={3}
            className="field-textarea tabular"
            style={{ fontSize: 13 }}
            value={urisRaw}
            onChange={(e) => setUrisRaw(e.target.value)}
          />
        </div>

        {error && <p style={{ fontSize: 13, color: "var(--no)" }}>{error}</p>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Link href="/" className="btn">
            Cancel
          </Link>
          <button type="submit" className="btn btn-primary" disabled={submitting || !text.trim()}>
            {submitting ? "Creating..." : "Create Claim & Seed Market"}
          </button>
        </div>
      </form>

      <IntentsDepositPreview />
    </div>
  );
}

