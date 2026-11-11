"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet, LogOut, FlaskConical, Radio } from "lucide-react";
import { formatNear } from "@/lib/amm";
import { CONTRACT_ID } from "@/lib/near";
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
            {/* Perpetua custom geometric mark: truth balance / twin reserves */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="2" y="2" width="20" height="20" rx="5" stroke="currentColor" strokeWidth="1.75" />
              <path d="M7 15.5L10.5 11L13.5 13.5L17 8.5" stroke="#0f6d4a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="17" cy="8.5" r="1.5" fill="#0f6d4a" />
            </svg>
            <span>Perpetua</span>
            <span className="pill" style={{ fontSize: 11, height: 20, color: "var(--muted)" }}>
              Testnet
            </span>
          </Link>

          <nav className="nav-links" aria-label="Primary">
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
              New Claim
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
                ? "Using seeded offline AMM & article simulator; click to query NEAR Testnet"
                : `Querying ${CONTRACT_ID || "NEAR Testnet"}`
            }
          >
            {mode === "demo" ? (
              <>
                <FlaskConical size={14} />
                <span>Demo Ledger</span>
              </>
            ) : (
              <>
                <Radio size={14} color="#0f6d4a" />
                <span>Live Testnet</span>
              </>
            )}
          </button>

          {accountId ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                className="pill tabular"
                style={{ height: 32, padding: "0 10px", background: "var(--surface)" }}
              >
                {accountId}
                {balanceYocto ? ` · ${formatNear(balanceYocto, 2)} Ⓝ` : ""}
              </span>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void signOut()}
                title="Disconnect wallet"
                aria-label="Disconnect wallet"
              >
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void signIn()}
              disabled={connecting}
            >
              <Wallet size={14} />
              <span>{connecting ? "Connecting..." : "Connect NEAR Wallet"}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

