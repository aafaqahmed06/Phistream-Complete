"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";
import type { ReactNode } from "react";
import { REVEAL_TRANSITION, REVEAL_VIEWPORT } from "@/lib/motion";

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
 * Under reduced motion it renders a plain div: no animation, no transform,
 * nothing left mid-state.
 */
export function Reveal({
  children,
  className = "",
  delay = 0,
  y = 24,
}: RevealProps) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={REVEAL_VIEWPORT}
      transition={{ ...REVEAL_TRANSITION, delay }}
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

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      variants={parentVariants}
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

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div className={className} variants={childVariants}>
      {children}
    </motion.div>
  );
}
