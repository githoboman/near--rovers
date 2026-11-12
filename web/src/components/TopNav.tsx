"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet, LogOut, FlaskConical, Radio } from "lucide-react";
import { formatNear } from "@/lib/amm";
import { CONTRACT_ID, NETWORK_LABEL } from "@/lib/near";
import { useNear } from "@/providers/NearProvider";
import { usePerpetua } from "@/providers/PerpetuaStore";

export function TopNav() {
  const pathname = usePathname();
  const { accountId, balanceYocto, connecting, signIn, signOut } = useNear();
  const { mode, setMode } = usePerpetua();

  return (
    <header className="shell-header">
      <div className="shell-header-inner">
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <Link href="/" className="brand-link" aria-label="Perpetua home">
            {/* Geometric truth balance mark: continuous confidence cpmm */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="2" y="2" width="20" height="20" rx="4" stroke="currentColor" strokeWidth="1.75" />
              <path d="M6 16L10 11.5L14 13.5L18 7.5" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="18" cy="7.5" r="1.5" fill="#10b981" />
            </svg>
            <span style={{ fontWeight: 600, letterSpacing: "-0.015em" }}>Perpetua</span>
            <span className="pill tabular" style={{ fontSize: 11, height: 20 }}>
              {NETWORK_LABEL}
            </span>
          </Link>

          <nav className="nav-links" aria-label="Primary navigation">
            <Link
              href="/"
              className={`nav-item ${pathname === "/" ? "active" : ""}`}
            >
              Encyclopedia
            </Link>
            <Link
              href="/create"
              className={`nav-item ${pathname === "/create" ? "active" : ""}`}
            >
              Propose Claim
            </Link>
          </nav>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setMode(mode === "demo" ? "live" : "demo")}
            title={
              mode === "demo"
                ? `Using seeded offline AMM & article simulator; click to query NEAR ${NETWORK_LABEL}`
                : `Querying on-chain contract: ${CONTRACT_ID || `NEAR ${NETWORK_LABEL}`}`
            }
          >
            {mode === "demo" ? (
              <>
                <FlaskConical size={13} color="var(--contested)" />
                <span>Demo Ledger</span>
              </>
            ) : (
              <>
                <Radio size={13} color="var(--yes)" />
                <span style={{ color: "var(--yes)" }}>Live {NETWORK_LABEL}</span>
              </>
            )}
          </button>

          {accountId ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                className="pill tabular"
                style={{
                  height: 32,
                  padding: "0 10px",
                  background: "var(--surface-muted)",
                  border: "1px solid var(--border-strong)",
                  color: "var(--ink)",
                }}
                title={accountId}
              >
                <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {accountId}
                </span>
                {balanceYocto ? ` · ${formatNear(balanceYocto, 2)} Ⓝ` : ""}
              </span>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void signOut()}
                title="Disconnect wallet"
                aria-label="Disconnect wallet"
              >
                <LogOut size={13} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void signIn()}
              disabled={connecting}
            >
              <Wallet size={13} />
              <span>{connecting ? "Connecting..." : "Connect Wallet"}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
