"use client";

import { useEffect, useRef } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";
import { SPRING_GLOW } from "@/lib/motion";

/**
 * A soft gold lamp that trails the cursor across its section.
 *
 * MUST be a direct child of a `relative` section -- it measures its own
 * parentElement to convert viewport coordinates into local ones.
 *
 * Cheap on purpose: the light is a radial-gradient background, not a blurred
 * element, because a `filter: blur()` that repaints on every mouse move is the
 * classic way to tank a scroll. Nothing here touches layout -- it writes two
 * motion values that Motion turns into a composited transform.
 *
 * The rect is cached and only re-measured on pointerenter, scroll and resize,
 * so the pointermove handler does no layout reads at all.
 *
 * Inert on coarse pointers and under reduced motion: the lamp is still rendered
 * (so hydration matches) but parked off-screen with no listeners.
 */
export function CursorGlow({ className = "" }: { className?: string }) {
  const reduce = useReducedMotion();
  const hostRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(-9999);
  const y = useMotionValue(-9999);
  const springX = useSpring(x, SPRING_GLOW);
  const springY = useSpring(y, SPRING_GLOW);

  useEffect(() => {
    if (reduce) return;
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    const host = hostRef.current;
    const section = host?.parentElement;
    if (!host || !section) return;

    let rect = section.getBoundingClientRect();
    const measure = () => {
      rect = section.getBoundingClientRect();
    };

    const onMove = (e: PointerEvent) => {
      x.set(e.clientX - rect.left);
      y.set(e.clientY - rect.top);
    };

    section.addEventListener("pointermove", onMove, { passive: true });
    section.addEventListener("pointerenter", measure);
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);

    return () => {
      section.removeEventListener("pointermove", onMove);
      section.removeEventListener("pointerenter", measure);
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [reduce, x, y]);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      {/* -ml-52 / -mt-52 centre the 26rem lamp on the cursor without touching
          Tailwind's own translate utilities, which Motion already owns here. */}
      <motion.div
        style={{
          x: springX,
          y: springY,
          background:
            "radial-gradient(circle, var(--color-gold), transparent 68%)",
        }}
        className="absolute -ml-52 -mt-52 h-[26rem] w-[26rem] rounded-full opacity-[0.16]"
      />
    </div>
  );
}
