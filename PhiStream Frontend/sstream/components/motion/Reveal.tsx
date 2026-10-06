"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";
import type { ReactNode } from "react";
import { REVEAL_TRANSITION, REVEAL_VIEWPORT } from "@/lib/motion";

const INSTANT = { duration: 0 };

type RevealProps = {
  children: ReactNode;
  className?: string;
  /** Stagger offset in seconds, for hand-sequenced groups. */
  delay?: number;
  /** Override the travel distance. 24px is the default; 0 fades in place. */
  y?: number;
};

/**
 * Scroll reveal. Fires once, animates transform and opacity only -- never a
 * layout property -- so it cannot contribute to CLS or hurt INP.
 *
 * Under reduced motion the content appears without animating. The markup is
 * the same either way: the server cannot know the preference, so branching on
 * it would fail hydration and rebuild the tree on the client.
 */
export function Reveal({
  children,
  className = "",
  delay = 0,
  y = 24,
}: RevealProps) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={REVEAL_VIEWPORT}
      transition={reduce ? INSTANT : { ...REVEAL_TRANSITION, delay }}
    >
      {children}
    </motion.div>
  );
}

const parentVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

const childVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: REVEAL_TRANSITION },
};

const instantChildVariants: Variants = {
  hidden: childVariants.hidden,
  visible: { opacity: 1, y: 0, transition: INSTANT },
};

/**
 * Staggered group. Parent and child must be a RevealGroup / RevealItem pair --
 * the child variants are meaningless without the parent orchestrating them.
 */
export function RevealGroup({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className={className}
      variants={reduce ? undefined : parentVariants}
      initial="hidden"
      whileInView="visible"
      viewport={REVEAL_VIEWPORT}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className={className}
      variants={reduce ? instantChildVariants : childVariants}
    >
      {children}
    </motion.div>
  );
}
