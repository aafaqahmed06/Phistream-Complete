"use client";

import { useRef } from "react";
import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
} from "motion/react";
import {
  TICKER_BASE_SPEED,
  TICKER_SPEED_CEILING,
  TICKER_VELOCITY_MAX,
} from "@/lib/motion";

/** Modulo that returns a positive result for negative input. */
function wrap(min: number, max: number, v: number) {
  const range = max - min;
  return ((((v - min) % range) + range) % range) + min;
}

type TickerProps = {
  items: readonly string[];
  className?: string;
  /** Travels leftward by default. */
  baseSpeed?: number;
  /** Separator glyph rendered between items. Decorative. */
  separator?: string;
};

/**
 * The broadcast crawl.
 *
 * A plain marquee moves at a fixed speed; this one reads the page's scroll
 * velocity and adds it to its own, so flicking the page turns the crawl into a
 * smear and scrolling back up sends it into reverse. That coupling between what
 * the visitor's hand is doing and what the page is doing is most of what makes
 * the section feel like a machine rather than a decoration.
 *
 * Mechanics:
 *   - The track holds the list TWICE and x wraps between -50% and 0, which
 *     lands exactly on the start of copy two. The gap lives inside each item,
 *     not on the flex container -- with a container gap the track measures
 *     sum(items) + (2N-1)*gap and -50% misses by half a gap, so the loop
 *     visibly stutters once per cycle.
 *   - The velocity term is clamped, so a hard flick cannot accelerate the type
 *     past readability.
 *   - Under reduced motion no frames are scheduled at all and the track simply
 *     sits at 0%. The real list is exposed once in an sr-only node; the moving
 *     copy is aria-hidden, because it is the same list, twice, moving.
 */
export function Ticker({
  items,
  className = "",
  baseSpeed = TICKER_BASE_SPEED,
  separator = "Ø",
}: TickerProps) {
  const reduce = useReducedMotion();
  const baseX = useMotionValue(0);
  const direction = useRef(1);

  const { scrollY } = useScroll();
  const scrollVelocity = useVelocity(scrollY);
  const smoothVelocity = useSpring(scrollVelocity, {
    damping: 50,
    stiffness: 400,
  });

  const velocityFactor = useTransform(
    smoothVelocity,
    [-TICKER_VELOCITY_MAX, TICKER_VELOCITY_MAX],
    [-TICKER_SPEED_CEILING, TICKER_SPEED_CEILING],
    { clamp: true }
  );

  const x = useTransform(baseX, (v) => `${wrap(-50, 0, v)}%`);

  useAnimationFrame((_, delta) => {
    if (reduce) return;

    let moveBy = direction.current * baseSpeed * (delta / 1000);

    const factor = velocityFactor.get();
    if (factor < 0) direction.current = -1;
    else if (factor > 0) direction.current = 1;

    moveBy += direction.current * moveBy * factor;
    baseX.set(baseX.get() + moveBy);
  });

  const track = [...items, ...items];

  return (
    <div className={`fade-x overflow-hidden ${className}`}>
      <ul className="sr-only">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <motion.div aria-hidden="true" className="flex w-max" style={{ x }}>
        {track.map((item, i) => (
          <span
            key={`${item}-${i}`}
            className="flex shrink-0 items-center gap-8 pr-8 md:gap-12 md:pr-12"
          >
            <span className="whitespace-nowrap font-display text-3xl leading-none md:text-4xl">
              {item}
            </span>
            <span className="font-display text-2xl leading-none opacity-30 md:text-3xl">
              {separator}
            </span>
          </span>
        ))}
      </motion.div>
    </div>
  );
}
