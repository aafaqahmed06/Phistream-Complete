"use client";

import { useEffect, useRef, useState } from "react";
import { heroCaptions, serviceCaption } from "@/lib/content-home";
import { stageFor, hintVisible } from "@/lib/tunnel/captions";
import { PhiMark } from "./PhiMark";

type Mode = "pending" | "3d" | "static";

function captionFor(stage: number) {
  if (stage === 0) return heroCaptions.intro;
  if (stage === 3) return heroCaptions.close;
  return serviceCaption(stage - 10);
}

/**
 * HeroStage — fixed full-viewport canvas driven by scroll.
 *
 * SSR: the intro caption (h1 + p) is server-rendered HTML so the headline
 * is real HTML at first paint (LCP). Three.js loads after first paint.
 *
 * Phase 3 of the implementation plan.
 */
export function HeroStage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const capRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("pending");
  const [shown, setShown] = useState(0);       // caption stage on screen
  const [out, setOut] = useState(false);       // fading out
  const [hint, setHint] = useState(true);
  const [ready, setReady] = useState(false);   // first 3D frame drawn → fade the poster φ
  const cur = useRef(0);

  useEffect(() => {
    const root = document.documentElement;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    if (reduce || saveData) { setMode("static"); root.dataset.hero = "static"; return; }

    let engine: import("@/lib/tunnel/engine").TunnelEngine | undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const spacer = document.getElementById("pf-spacer")!;

    const read = () => {
      const sH = Math.max(1, spacer.offsetHeight - innerHeight);
      const y = scrollY;
      const state = y > sH + innerHeight ? "gone" : y > sH ? "past" : "in";
      if (root.dataset.hero !== state) root.dataset.hero = state;
      engine?.setTarget(y / sH);
      if (state === "gone" || document.hidden) engine?.stop(); else engine?.start();
    };

    const onFrame = (p: number) => {
      const s = stageFor(p);
      if (s !== cur.current) {
        cur.current = s;
        setOut(true);
        clearTimeout(timer);
        timer = setTimeout(() => { setShown(s); setOut(false); }, 300);
      }
      setHint((h) => (h === hintVisible(p) ? h : hintVisible(p)));
    };

    const boot = async () => {
      try {
        const family = getComputedStyle(capRef.current!).fontFamily;
        const { TunnelEngine } = await import("@/lib/tunnel/engine");
        await Promise.all([
          document.fonts.load(`500 58px ${family}`, "Aa"),
          document.fonts.load(`400 30px ${family}`, "Aa"),
        ]).catch(() => {});
        if (cancelled) return;

        // WebGL context loss fallback (Phase 6 §6.6)
        const canvas = canvasRef.current!;
        canvas.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          setMode("static");
          root.dataset.hero = "static";
        });

        engine = new TunnelEngine({
          canvas, fontFamily: family, onFrame,
          onFirstFrame: () => setReady(true),
        });
        let fitTimeout: ReturnType<typeof setTimeout> | undefined;
        const fit = () => {
          // Debounce resize by ~100ms (Phase 6 §6.7)
          clearTimeout(fitTimeout);
          fitTimeout = setTimeout(() => engine!.resize(innerWidth, innerHeight), 100);
        };
        engine.resize(innerWidth, innerHeight);
        addEventListener("resize", fit);
        (engine as unknown as { _fit: () => void })._fit = fit;
        setMode("3d");
        read();
      } catch {
        setMode("static"); root.dataset.hero = "static";       // WebGL unavailable → A8 fallback
      }
    };

    const idle = () => (window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 1)))(boot, { timeout: 1200 } as never);
    requestAnimationFrame(() => requestAnimationFrame(idle));

    addEventListener("scroll", read, { passive: true });
    addEventListener("resize", read);
    document.addEventListener("visibilitychange", read);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      removeEventListener("scroll", read);
      removeEventListener("resize", read);
      document.removeEventListener("visibilitychange", read);
      const fit = (engine as unknown as { _fit?: () => void } | undefined)?._fit;
      if (fit) removeEventListener("resize", fit);
      engine?.dispose();
      delete root.dataset.hero;
    };
  }, []);

  const c = captionFor(shown) as { eyebrow: string; title: string; body: string; cta?: { label: string; href: string } };
  const isService = shown >= 10;
  const right = isService; // the focused card rests on the left of the ring
  const Title = shown === 0 ? "h1" : "h2";

  return (
    <section id="top" className={`pf-stage${mode === "static" ? " pf-static" : ""}`} aria-label="Phistreams">
      {/* Poster φ: shown until the first 3D frame (and permanently in static mode). */}
      <PhiMark className={`pf-poster${mode === "3d" && ready ? " pf-poster-off" : ""}`} />
      <canvas ref={canvasRef} aria-hidden="true" />
      <div
        ref={capRef}
        className={`pf-cap${right ? " pf-r" : ""}${out ? " pf-o" : ""}`}
        aria-hidden={isService || undefined}
      >
        <small>{c.eyebrow}</small>
        <Title>{c.title}</Title>
        <p>{c.body}</p>
        {c.cta ? <a className="pf-pill" href={c.cta.href}>{c.cta.label}</a> : null}
      </div>
      <div className="pf-hint" style={{ opacity: hint ? 1 : 0 }}>Scroll ↓</div>
    </section>
  );
}
