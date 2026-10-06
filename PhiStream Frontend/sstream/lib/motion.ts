import type { Transition } from "motion/react";

/**
 * Expo-out. Long tail, quick start -- reads as "considered" rather than
 * "bouncy".
 */
export const REVEAL_TRANSITION: Transition = {
  duration: 0.6,
  ease: [0.16, 1, 0.3, 1],
};

/** Used for hover scale on cards. Underdamped enough to feel alive. */
export const SPRING_HOVER: Transition = {
  type: "spring",
  stiffness: 300,
  damping: 24,
};

/**
 * The cursor glow's follow. Much softer than SPRING_HOVER -- a glow that snaps
 * to the pointer reads as a bug, while one that lags reads as light.
 */
export const SPRING_GLOW: Transition = {
  type: "spring",
  stiffness: 90,
  damping: 20,
  mass: 0.7,
};

/** Standard viewport config: fire once, when a fifth of the element is in. */
export const REVEAL_VIEWPORT = { once: true, amount: 0.15 } as const;
export const REVEAL_VIEWPORT_EARLY = { once: true, amount: 0.3 } as const;

/** Split-flap stagger, in seconds per character. */
export const FLAP_STAGGER = 0.045;
