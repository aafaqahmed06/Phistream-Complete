/**
 * Typed palette mirrors of the CSS custom properties in app/globals.css.
 * Use these when a colour has to be a real JS value (SVG fills, gradients
 * composed at runtime) rather than a Tailwind class.
 */
export const palette = {
  ink: "#2B211A",
  cream: "#F3EFE6",
  gold: "#C89B3C",
  goldDeep: "#8A6A2A",
  taupe: "#A69377",
} as const;

export type PaletteToken = keyof typeof palette;

/**
 * Contrast ratios, computed with the WCAG 2.1 relative-luminance formula.
 * Kept in code so a future change to either surface can be checked against
 * the rule rather than remembered.
 */
export const contrast = {
  "cream-on-ink": 13.7,
  "gold-on-ink": 6.15,
  "taupe-on-ink": 5.29,
  "goldDeep-on-ink": 3.13,
  "ink-on-cream": 13.7,
  "ink70-on-cream": 5.47,
  "goldDeep-on-cream": 4.38,
  "taupe-on-cream": 2.59,
  "gold-on-cream": 2.23,
  /** Gold as a fill: the .highlight class, the primary button. */
  "ink-on-gold": 6.15,
  /** Which is why muted text on a gold fill is full ink, not ink at 70%. */
  "ink70-on-gold": 3.53,
} as const;

/**
 * The muted-text colour token differs by surface. This is the single most
 * important rule in the palette -- taupe and gold read well on ink and fail
 * badly on cream, so muted text on light surfaces is ink at 70%.
 */
export const mutedText = {
  onInk: "text-taupe",
  onCream: "text-ink/70",
} as const;
