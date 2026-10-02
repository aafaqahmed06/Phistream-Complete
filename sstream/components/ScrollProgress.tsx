"use client";

import { motion, useScroll, useSpring } from "motion/react";

/**
 * The progress bar. Sits on the bottom edge of the fixed header and fills as
 * you read down the page.
 *
 * Gold, which is safe because of where it lives: the header is either
 * transparent over the ink hero at the top of the page, or solid ink once
 * scrolled. Against ink that is 6.15:1; against 90%-ink-over-cream it computes
 * to 4.63:1. Both clear the 3:1 non-text threshold, and neither surface is
 * cream.
 *
 * Transform-only (scaleX), so it never triggers layout while scrolling.
 */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 220,
    damping: 40,
    restDelta: 0.001,
  });

  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX }}
      className="absolute inset-x-0 bottom-0 h-[3px] origin-left bg-gold"
    />
  );
}
