"use client";

import React from "react";
import { usePathname } from "next/navigation";

/**
 * Wraps route content. The landing page is full-bleed; app routes sit in the
 * constrained container. Keying on pathname replays a short enter transition.
 */
export function PageShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === "/";
  return (
    <main
      id="main"
      key={pathname}
      className={isLanding ? "landing page-enter" : "container page-enter"}
    >
      {children}
    </main>
  );
}
