"use client";

import React, { useEffect, useRef } from "react";

/**
 * Orbital network visualization (Canvas 2D).
 *
 * A NEAR Protocol node sits at the centre; four nodes orbit it in pipeline
 * order: Evidence -> Prediction Markets -> AI Jury -> Settlement. Thin lines
 * link each node to the centre and to its neighbour in the pipeline. This is a
 * conceptual map of Perpetua's own verification flow, nothing else.
 *
 * Performance notes: single canvas, DPR capped at 2, rings drawn as two batched
 * paths (front/back), no per-frame allocations beyond a few gradients, loop
 * pauses when off-screen or when the tab is hidden, and a single static frame
 * is rendered when the user prefers reduced motion.
 */

const NODES = [
  { label: "Evidence", index: "01", radius: 0.36, tilt: 1.12, rot: -0.35, period: 74, phase: 0.6 },
  { label: "Prediction Markets", index: "02", radius: 0.58, tilt: 1.0, rot: 0.42, period: 98, phase: 2.5 },
  { label: "AI Jury", index: "03", radius: 0.8, tilt: 1.18, rot: -0.12, period: 128, phase: 4.1 },
  { label: "Settlement", index: "04", radius: 1.02, tilt: 1.06, rot: 0.78, period: 164, phase: 5.5 },
] as const;

// Two extra, purely decorative hairline rings for depth.
const DECOR_RINGS = [
  { radius: 0.2, tilt: 1.0, rot: 0.2 },
  { radius: 1.22, tilt: 1.14, rot: -0.5 },
] as const;

const ACCENT = "0, 192, 139";
const INK = "244, 245, 247";
const MUTED = "146, 157, 170";
const PERSPECTIVE = 3.4;

interface Particle {
  ring: number; // index into combined ring list
  angle: number;
  speed: number; // rad/s
  jitter: number;
  size: number;
  alpha: number;
}

interface Dust {
  x: number; // 0..1
  y: number; // 0..1
  depth: number;
  drift: number;
  alpha: number;
}

type RingDef = { radius: number; tilt: number; rot: number };

const RINGS: RingDef[] = [...NODES.map((n) => ({ radius: n.radius, tilt: n.tilt, rot: n.rot })), ...DECOR_RINGS];

// Small deterministic PRNG so the scene is identical between renders.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildParticles(count: number): Particle[] {
  const rand = mulberry32(7);
  return Array.from({ length: count }, () => ({
    ring: Math.floor(rand() * RINGS.length),
    angle: rand() * Math.PI * 2,
    speed: ((Math.PI * 2) / (60 + rand() * 160)) * (rand() > 0.5 ? 1 : -1),
    jitter: (rand() - 0.5) * 0.05,
    size: 0.6 + rand() * 0.9,
    alpha: 0.25 + rand() * 0.5,
  }));
}

function buildDust(count: number): Dust[] {
  const rand = mulberry32(21);
  return Array.from({ length: count }, () => ({
    x: rand(),
    y: rand(),
    depth: 0.2 + rand() * 0.8,
    drift: 0.4 + rand() * 1.2,
    alpha: 0.12 + rand() * 0.3,
  }));
}

interface Projected {
  x: number;
  y: number;
  z: number;
  s: number;
}

export function OrbitalNetwork({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context2d = canvas.getContext("2d");
    if (!context2d) return;
    const ctx: CanvasRenderingContext2D = context2d;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = motionQuery.matches;

    const fontFamily =
      getComputedStyle(canvas).getPropertyValue("--font-mono").trim() ||
      "ui-monospace, SFMono-Regular, Menlo, monospace";

    let width = 0;
    let height = 0;
    let dpr = 1;
    let cx = 0;
    let cy = 0;
    let R = 200;
    let narrow = false;
    let particles = buildParticles(56);
    let dust = buildDust(44);

    let visible = true;
    let pageVisible = !document.hidden;
    let raf = 0;
    let last = 0;
    let t = reduced ? 9 : 0;

    // Pointer parallax (smoothed)
    let targetYaw = 0;
    let targetPitch = 0;
    let yaw = 0;
    let pitch = 0;
    let pointerX = 0;
    let pointerY = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      narrow = width < 900;
      if (narrow) {
        cx = width / 2;
        cy = height * 0.3;
        R = Math.min(width * 0.4, height * 0.24);
      } else {
        cx = width * 0.67;
        cy = height * 0.5;
        R = Math.min(width * 0.3, height * 0.4);
      }
      const pCount = narrow ? 34 : 60;
      if (particles.length !== pCount) particles = buildParticles(pCount);
      const dCount = narrow ? 26 : 46;
      if (dust.length !== dCount) dust = buildDust(dCount);
      draw();
    };

    const project = (
      radius: number,
      angle: number,
      ring: RingDef,
      radiusJitter = 0
    ): Projected => {
      const r = radius + radiusJitter;
      const px = r * Math.cos(angle);
      const py0 = r * Math.sin(angle);
      // tilt about X
      const py1 = py0 * Math.cos(ring.tilt);
      const pz1 = py0 * Math.sin(ring.tilt);
      // in-plane rotation about Z
      const cr = Math.cos(ring.rot);
      const sr = Math.sin(ring.rot);
      const x2 = px * cr - py1 * sr;
      const y2 = px * sr + py1 * cr;
      // pointer yaw (about Y)
      const cyw = Math.cos(yaw);
      const syw = Math.sin(yaw);
      const x3 = x2 * cyw + pz1 * syw;
      const z3 = -x2 * syw + pz1 * cyw;
      // pointer pitch (about X)
      const cpt = Math.cos(pitch);
      const spt = Math.sin(pitch);
      const y4 = y2 * cpt - z3 * spt;
      const z4 = y2 * spt + z3 * cpt;
      const s = PERSPECTIVE / (PERSPECTIVE - z4);
      return { x: cx + x3 * R * s, y: cy + y4 * R * s, z: z4, s };
    };

    const drawRing = (ring: RingDef, emphasis: number) => {
      const steps = narrow ? 64 : 96;
      const backPath = new Path2D();
      const frontPath = new Path2D();
      let prev = project(ring.radius, 0, ring);
      for (let i = 1; i <= steps; i++) {
        const p = project(ring.radius, (i / steps) * Math.PI * 2, ring);
        const target = (p.z + prev.z) / 2 >= 0 ? frontPath : backPath;
        target.moveTo(prev.x, prev.y);
        target.lineTo(p.x, p.y);
        prev = p;
      }
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(${MUTED}, ${0.06 * emphasis})`;
      ctx.stroke(backPath);
      ctx.strokeStyle = `rgba(${MUTED}, ${0.17 * emphasis})`;
      ctx.stroke(frontPath);
    };

    const glow = (x: number, y: number, radius: number, alpha: number, rgb = ACCENT) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
      g.addColorStop(0, `rgba(${rgb}, ${alpha})`);
      g.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    };

    function draw() {
      ctx.clearRect(0, 0, width, height);

      // Scroll parallax: scene drifts up and fades as the hero leaves view.
      const scrollP = Math.min(1, Math.max(0, window.scrollY / Math.max(1, height)));
      ctx.save();
      ctx.translate(0, -scrollP * 48);
      ctx.globalAlpha = 1 - scrollP * 0.75;

      // Background dust (parallax by depth)
      for (const d of dust) {
        const dx = (d.x * width + t * d.drift * 2 + pointerX * d.depth * -16) % (width + 4);
        const dy = d.y * height + pointerY * d.depth * -10;
        ctx.fillStyle = `rgba(${MUTED}, ${d.alpha * d.depth})`;
        ctx.fillRect(dx < 0 ? dx + width : dx, dy, 1, 1);
      }

      // Rings
      RINGS.forEach((ring, i) => drawRing(ring, i < NODES.length ? 1 : 0.6));

      // Particles drifting along the rings
      for (const p of particles) {
        const ring = RINGS[p.ring];
        const pos = project(ring.radius, p.angle + t * p.speed, ring, p.jitter);
        const depthAlpha = 0.45 + 0.55 * ((pos.z + 1.3) / 2.6);
        ctx.fillStyle = `rgba(${INK}, ${p.alpha * Math.max(0.15, Math.min(1, depthAlpha)) * 0.7})`;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, p.size * pos.s, 0, Math.PI * 2);
        ctx.fill();
      }

      // Centre projection (pointer parallax also moves the core a touch)
      const centre = project(0, 0, RINGS[0]);

      // Node positions
      const nodePos = NODES.map((n) => project(n.radius, n.phase + (t * Math.PI * 2) / n.period, RINGS[NODES.indexOf(n)]));

      // Connection lines: centre -> node
      ctx.lineWidth = 1;
      nodePos.forEach((p, i) => {
        const g = ctx.createLinearGradient(centre.x, centre.y, p.x, p.y);
        g.addColorStop(0, `rgba(${ACCENT}, 0.28)`);
        g.addColorStop(1, `rgba(${ACCENT}, 0.05)`);
        ctx.strokeStyle = g;
        ctx.beginPath();
        ctx.moveTo(centre.x, centre.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();

        // Travelling pulse centre -> node (periodic, staggered)
        const period = 7.5;
        const u = ((t + i * 1.9) % period) / period;
        if (u < 0.55) {
          const k = u / 0.55;
          const e = 1 - Math.pow(1 - k, 3);
          const px = centre.x + (p.x - centre.x) * e;
          const py = centre.y + (p.y - centre.y) * e;
          const a = Math.sin(k * Math.PI) * 0.9;
          glow(px, py, 9, a * 0.35);
          ctx.fillStyle = `rgba(${ACCENT}, ${a})`;
          ctx.beginPath();
          ctx.arc(px, py, 1.4, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // Pipeline lines: Evidence -> Markets -> Jury -> Settlement
      for (let i = 0; i < nodePos.length - 1; i++) {
        const a = nodePos[i];
        const b = nodePos[i + 1];
        ctx.strokeStyle = `rgba(${MUTED}, 0.16)`;
        ctx.setLineDash([2, 5]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.setLineDash([]);

        const period = 11;
        const u = ((t * 0.9 + i * 3.4) % period) / period;
        if (u < 0.5) {
          const k = u / 0.5;
          const px = a.x + (b.x - a.x) * k;
          const py = a.y + (b.y - a.y) * k;
          ctx.fillStyle = `rgba(${INK}, ${Math.sin(k * Math.PI) * 0.6})`;
          ctx.beginPath();
          ctx.arc(px, py, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Central NEAR node
      const breath = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t * 0.9);
      const coreR = Math.max(11, R * 0.06);
      glow(centre.x, centre.y, R * 0.62, 0.16 + breath * 0.07);
      glow(centre.x, centre.y, R * 0.2, 0.3 + breath * 0.1);

      // Ripple
      const ripPeriod = 6;
      const rp = reduced ? 0.35 : (t % ripPeriod) / ripPeriod;
      ctx.strokeStyle = `rgba(${ACCENT}, ${(1 - rp) * 0.35})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, coreR * (1.6 + rp * 4.2), 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "#07120f";
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, coreR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(${ACCENT}, 0.9)`;
      ctx.lineWidth = 1.25;
      ctx.stroke();
      ctx.strokeStyle = `rgba(${ACCENT}, 0.35)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, coreR * 1.55, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(${ACCENT}, ${0.85 + breath * 0.15})`;
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, coreR * 0.32, 0, Math.PI * 2);
      ctx.fill();

      // Centre label
      const labelSize = narrow ? 9.5 : 10.5;
      ctx.font = `${labelSize}px ${fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "1.6px";
      ctx.fillStyle = `rgba(${INK}, 0.78)`;
      ctx.fillText("NEAR PROTOCOL", centre.x, centre.y + coreR * 1.55 + 10);

      // Orbiting nodes (back-to-front so near nodes overlap far ones)
      const order = nodePos.map((p, i) => ({ p, i })).sort((a, b) => a.p.z - b.p.z);
      for (const { p, i } of order) {
        const node = NODES[i];
        const depth = Math.max(0, Math.min(1, (p.z + 1.2) / 2.4));
        const nodeR = (narrow ? 4.2 : 5.2) * p.s;
        const alpha = 0.55 + depth * 0.45;

        glow(p.x, p.y, nodeR * 5.5, 0.14 * alpha);
        ctx.fillStyle = "#0b1118";
        ctx.beginPath();
        ctx.arc(p.x, p.y, nodeR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(${ACCENT}, ${0.9 * alpha})`;
        ctx.lineWidth = 1.25;
        ctx.stroke();
        ctx.fillStyle = `rgba(${ACCENT}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, nodeR * 0.38, 0, Math.PI * 2);
        ctx.fill();

        // Soft ripple on arrival of a centre pulse (same cadence as the pulse)
        const period = 7.5;
        const u = ((t + i * 1.9) % period) / period;
        if (!reduced && u >= 0.5 && u < 0.78) {
          const k = (u - 0.5) / 0.28;
          ctx.strokeStyle = `rgba(${ACCENT}, ${(1 - k) * 0.4})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, nodeR * (1.4 + k * 2.4), 0, Math.PI * 2);
          ctx.stroke();
        }

        // Label
        const right = p.x >= centre.x;
        ctx.textAlign = right ? "left" : "right";
        ctx.textBaseline = "middle";
        const gap = nodeR + 10;
        const lx = p.x + (right ? gap : -gap);
        ctx.font = `${narrow ? 9 : 10}px ${fontFamily}`;
        ctx.fillStyle = `rgba(${ACCENT}, ${0.75 * alpha})`;
        ctx.fillText(node.index, lx, p.y - 7);
        ctx.font = `${narrow ? 9.5 : 11}px ${fontFamily}`;
        ctx.fillStyle = `rgba(${INK}, ${0.88 * alpha})`;
        ctx.fillText(node.label.toUpperCase(), lx, p.y + 7);
      }

      (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "0px";
      ctx.restore();
    }

    const frame = (now: number) => {
      if (!last) last = now;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      yaw += (targetYaw - yaw) * Math.min(1, dt * 2.4);
      pitch += (targetPitch - pitch) * Math.min(1, dt * 2.4);
      draw();
      raf = requestAnimationFrame(frame);
    };

    const syncLoop = () => {
      const shouldRun = visible && pageVisible && !reduced;
      if (shouldRun && !raf) {
        last = 0;
        raf = requestAnimationFrame(frame);
      } else if (!shouldRun && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      pointerX = (e.clientX / window.innerWidth - 0.5) * 2;
      pointerY = (e.clientY / window.innerHeight - 0.5) * 2;
      targetYaw = pointerX * 0.14;
      targetPitch = pointerY * 0.09;
    };

    const onVisibility = () => {
      pageVisible = !document.hidden;
      syncLoop();
    };

    const onMotionChange = () => {
      reduced = motionQuery.matches;
      if (reduced) {
        t = 9;
        yaw = pitch = targetYaw = targetPitch = pointerX = pointerY = 0;
        draw();
      }
      syncLoop();
    };

    const onScrollStatic = () => {
      if (reduced) draw();
    };

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries.some((e) => e.isIntersecting);
        syncLoop();
      },
      { threshold: 0 }
    );
    io.observe(canvas);

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("scroll", onScrollStatic, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    motionQuery.addEventListener("change", onMotionChange);

    resize();
    syncLoop();
    // Fonts load asynchronously; repaint once so canvas labels use them.
    void document.fonts?.ready.then(() => draw());

    return () => {
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("scroll", onScrollStatic);
      document.removeEventListener("visibilitychange", onVisibility);
      motionQuery.removeEventListener("change", onMotionChange);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      role="img"
      aria-label="Orbital diagram. A NEAR Protocol node sits at the centre with four nodes orbiting it: Evidence, Prediction Markets, AI Jury and Settlement."
    />
  );
}
