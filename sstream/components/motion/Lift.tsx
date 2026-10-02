"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { SPRING_HOVER } from "@/lib/motion";

type LiftProps = {
  children: ReactNode;
  className?: string;
  /** 1.02 for large panels, higher for small cards. */
  scale?: number;
};

/**
 * Spring hover wrapper for cards and media panels. Motion is used here rather
 * than a CSS transition because the spring's slight overshoot is what makes a
 * hover feel physical -- but it is bypassed entirely under reduced motion.
 */
export function Lift({ children, className = "", scale = 1.02 }: LiftProps) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className={className}
      whileHover={reduce ? undefined : { scale }}
      transition={SPRING_HOVER}
    >
      {children}
    </motion.div>
  );
}
