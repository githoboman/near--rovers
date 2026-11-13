"use client";

import React, { useEffect, useRef, useState } from "react";

interface RevealProps {
  children?: React.ReactNode;
  delay?: number;
  as?: "div" | "section" | "li" | "header" | "p" | "span";
  /** Renders a hairline that draws in rather than a content wrapper. */
  line?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Scroll-triggered reveal. The hidden state only exists in CSS when scripting
 * is enabled and reduced motion is NOT requested, so content is never lost.
 */
export function Reveal({ children, delay = 0, as = "div", line = false, className = "", style }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const Tag = as as React.ElementType;
  return (
    <Tag
      ref={ref}
      className={`${line ? "reveal-line" : "reveal"} ${shown ? "in" : ""} ${className}`.trim()}
      style={{ ...style, ["--reveal-delay" as string]: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}
