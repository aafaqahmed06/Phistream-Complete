/**
 * The home hero's scroll timeline and the small maths it needs.
 *
 * Deliberately has NO imports. The captions (read on first paint) need these
 * numbers, and the engine (which imports `three`, a large library) is loaded
 * lazily after first paint. If the captions imported the engine for a constant,
 * `three` would be bundled into the home page's main JavaScript and the lazy
 * load would do nothing.
 *
 * p runs 0..1 over the 600vh scroll. The logo stands alone and the ring of cards
 * spins out of it until INTRO_END; the six services then share the span to
 * OUTRO_START, one card in focus at a time; after that the ring folds back into
 * the logo for the closing call to action.
 */
export const INTRO_END = 0.2;
export const OUTRO_START = 0.88;
export const COUNT = 6;

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));

export const smooth = (a: number, b: number, x: number) => {
  x = clamp((x - a) / (b - a));
  return x * x * (3 - 2 * x);
};

/** Continuous service coordinate: service i is in focus while this is in [i, i + 1). */
export const serviceCoord = (p: number) => ((p - INTRO_END) / (OUTRO_START - INTRO_END)) * COUNT;
