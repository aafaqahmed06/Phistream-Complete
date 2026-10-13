import type { Transition } from "motion/react";

/**
 * Expo-out, slow. Long tail, quick start -- reads as "considered" rather than
 * "bouncy". The distance travelled is small (see Reveal) so the duration can be
 * generous without anything feeling like it is dragging.
 */
export const REVEAL_TRANSITION: Transition = {
  duration: 0.9,
  ease: [0.16, 1, 0.3, 1],
};

/** Used for hover scale on cards. */
export const SPRING_HOVER: Transition = {
  type: "spring",
  stiffness: 300,
  damping: 24,
};

/** Standard viewport config: fire once, when a fifth of the element is in. */
export const REVEAL_VIEWPORT = { once: true, amount: 0.15 } as const;
export const REVEAL_VIEWPORT_EARLY = { once: true, amount: 0.3 } as const;

/** Split-flap stagger, in seconds per character (admin overview only). */
export const FLAP_STAGGER = 0.045;
