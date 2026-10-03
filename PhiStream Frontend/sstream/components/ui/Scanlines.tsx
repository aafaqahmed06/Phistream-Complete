/**
 * Fixed broadcast-texture layer over the whole document.
 *
 * Sits at z-40, below the fixed nav (z-50), so the navigation stays crisp while
 * the rest of the page carries a faint CRT raster. It is a static composited
 * layer -- no animation, no blend mode -- so it costs one paint and nothing per
 * frame.
 *
 * The alpha is 6% ink in globals.css for a reason: recomputed inside the
 * overlay, cream-on-ink is still 12.25:1 and ink-on-cream only gains contrast.
 * Push it and the texture starts eating body copy.
 */
export function Scanlines() {
  return (
    <div
      aria-hidden="true"
      className="scanlines pointer-events-none fixed inset-0 z-40"
    />
  );
}
