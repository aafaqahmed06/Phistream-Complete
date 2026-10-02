"use client";

import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { FLAP_STAGGER, REVEAL_VIEWPORT_EARLY } from "@/lib/motion";

type SplitFlapProps = {
  /** The literal final string. Authored in lib/content.ts, never assembled. */
  text: string;
  className?: string;
  /** Extra hold before the first character drops, in seconds. */
  delay?: number;
};

/**
 * Split-flap counter: each character drops onto the board from -92deg, left to
 * right, the way an airport board or a follower-count widget resolves.
 *
 * It does not count up. Counting is a delivery animation -- it shows you the
 * journey to a number. A flap shows the number arriving, and this section is
 * about the number.
 *
 * Accessibility: the animated characters are aria-hidden and the final string is
 * exposed once in an sr-only node, so assistive tech reads "£94M" rather than
 * spelling out a flipping board. Under reduced motion the string is rendered
 * plainly with no animation and no perspective.
 */
export function SplitFlap({ text, className = "", delay = 0 }: SplitFlapProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, REVEAL_VIEWPORT_EARLY);
  const reduce = useReducedMotion();

  if (reduce) {
    return (
      <span ref={ref} className={className}>
        {text}
      </span>
    );
  }

  return (
    <span ref={ref} className={className}>
      <span
        aria-hidden="true"
        className="inline-flex"
        style={{ perspective: "420px" }}
      >
        {Array.from(text).map((char, i) => (
          <motion.span
            key={`${char}-${i}`}
            className="inline-block"
            style={{ transformOrigin: "50% 100%", backfaceVisibility: "hidden" }}
            initial={{ rotateX: -92, opacity: 0, y: 8 }}
            animate={inView ? { rotateX: 0, opacity: 1, y: 0 } : undefined}
            transition={{
              duration: 0.52,
              ease: [0.16, 1, 0.3, 1],
              delay: delay + i * FLAP_STAGGER,
            }}
          >
            {char}
          </motion.span>
        ))}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  );
}
