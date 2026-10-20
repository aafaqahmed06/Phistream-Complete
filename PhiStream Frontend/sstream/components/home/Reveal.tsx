"use client";

import { useEffect, useRef } from "react";

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number; // ms transition-delay for stagger
}

/**
 * Reveal — IntersectionObserver wrapper that adds .pf-on when 20% visible.
 * Also adds .pf-on immediately on focusin (keyboard users must not land on
 * an invisible element).
 *
 * CSS (.pf-rv and .pf-on) lives in home.css.
 */
export function Reveal({ children, className = "", delay }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (delay !== undefined) {
      el.style.transitionDelay = `${delay}ms`;
    }

    // Reduced-motion: browsers that honour prefers-reduced-motion will have
    // the CSS transition removed, but we still add .pf-on so content is visible.
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            el.classList.add("pf-on");
            obs.unobserve(el);
            // After entrance animation completes, clear delay so hover is snappy.
            setTimeout(() => { el.style.transitionDelay = ""; }, 1200);
          }
        });
      },
      { threshold: 0.2 },
    );
    obs.observe(el);

    const onFocus = () => el.classList.add("pf-on");
    el.addEventListener("focusin", onFocus);

    return () => {
      obs.disconnect();
      el.removeEventListener("focusin", onFocus);
    };
  }, [delay]);

  return (
    <div ref={ref} className={`pf-rv ${className}`}>
      {children}
    </div>
  );
}
