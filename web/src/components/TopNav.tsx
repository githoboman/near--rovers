"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet, LogOut, Menu, X } from "lucide-react";
import { formatNear } from "@/lib/amm";
import { CONTRACT_ID, NETWORK_LABEL } from "@/lib/near";
import { useNear } from "@/providers/NearProvider";
import { usePerpetua } from "@/providers/PerpetuaStore";

const LANDING_LINKS = [
  { href: "/#overview", label: "Protocol" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#featured", label: "Claims" },
  { href: "/#architecture", label: "Architecture" },
];

const APP_LINKS = [
  { href: "/encyclopedia", label: "Encyclopedia" },
  { href: "/create", label: "Propose Claim" },
];

function BrandMark() {
  return (
    <svg className="brand-mark" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth="1.25" opacity="0.55" />
      <ellipse cx="12" cy="12" rx="9.25" ry="3.6" transform="rotate(-28 12 12)" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="12" cy="12" r="2.4" fill="#00c08b" />
    </svg>
  );
}

function ModeToggle() {
  const { mode, setMode, loading, lastError } = usePerpetua();
  const tone = lastError ? "error" : mode === "live" ? "live" : "demo";
  const label = mode === "demo" ? "Demo Ledger" : `Live ${NETWORK_LABEL}`;
  return (
    <button
      type="button"
      className="btn btn-sm"
      onClick={() => setMode(mode === "demo" ? "live" : "demo")}
      aria-label={`Data source: ${label}. Switch to ${mode === "demo" ? "live NEAR" : "demo ledger"}.`}
      title={
        mode === "demo"
          ? `Using seeded offline AMM & article simulator; click to query NEAR ${NETWORK_LABEL}`
          : `Querying on-chain contract: ${CONTRACT_ID || `NEAR ${NETWORK_LABEL}`}`
      }
    >
      <span className="status-dot" data-tone={tone} data-pulse={loading ? "true" : "false"} aria-hidden="true" />
      <span style={{ color: mode === "live" && !lastError ? "var(--yes)" : undefined }}>{label}</span>
    </button>
  );
}

function WalletControl() {
  const { accountId, balanceYocto, connecting, signIn, signOut } = useNear();

  if (accountId) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span
          className="pill tabular"
          style={{
            height: 30,
            padding: "0 10px",
            background: "var(--surface-muted)",
            border: "1px solid var(--border-strong)",
            color: "var(--ink)",
            minWidth: 0,
          }}
          title={accountId}
        >
          <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>{accountId}</span>
          {balanceYocto ? <span className="desktop-only"> · {formatNear(balanceYocto, 2)} Ⓝ</span> : null}
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
    );
  }

  return (
    <button type="button" className="btn btn-primary btn-sm" onClick={() => void signIn()} disabled={connecting}>
      <Wallet size={13} />
      <span>{connecting ? "Connecting..." : "Connect Wallet"}</span>
    </button>
  );
}

export function TopNav() {
  const pathname = usePathname();
  const isLanding = pathname === "/";
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const links = isLanding ? LANDING_LINKS : APP_LINKS;

  useEffect(() => {
    if (!isLanding) {
      setScrolled(true);
      return;
    }
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isLanding]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const isActive = (href: string) =>
    href.startsWith("/#") ? false : href === "/encyclopedia" ? pathname === href || pathname.startsWith("/claims") : pathname === href;

  const renderLinks = () => (
    <>
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`nav-item ${isActive(l.href) ? "active" : ""}`}
          aria-current={isActive(l.href) ? "page" : undefined}
        >
          {l.label}
        </Link>
      ))}
      {isLanding && (
        <Link href="/encyclopedia" className="nav-item">
          Encyclopedia
        </Link>
      )}
    </>
  );

  return (
    <header className="shell-header" data-landing={isLanding} data-scrolled={scrolled}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <div className="shell-header-inner">
        <div className="shell-left">
          <Link href="/" className="brand-link" aria-label="Perpetua home">
            <BrandMark />
            <span>Perpetua</span>
            <span className="pill tabular network-pill" style={{ fontSize: 11, height: 20 }}>
              {NETWORK_LABEL}
            </span>
          </Link>
          <nav className="nav-links" aria-label="Primary navigation">
            {renderLinks()}
          </nav>
        </div>

        <div className="shell-right">
          <div className="desktop-only">
            <ModeToggle />
          </div>
          <WalletControl />
          <button
            type="button"
            className="btn btn-sm menu-button"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X size={15} /> : <Menu size={15} />}
          </button>
        </div>
      </div>

      <div id="mobile-menu" className="mobile-menu" hidden={!menuOpen}>
        <nav aria-label="Mobile navigation" style={{ display: "flex", flexDirection: "column" }}>
          {renderLinks()}
        </nav>
        <div className="mobile-menu-actions">
          <ModeToggle />
        </div>
      </div>
    </header>
  );
}
