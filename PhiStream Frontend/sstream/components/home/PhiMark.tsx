/**
 * PhiMark — SVG φ used in two places:
 *   1. CTA section watermark (.pf-cta-mark)
 *   2. Hero poster / static fallback (.pf-poster)
 *
 * viewBox 0 0 400 440 per §4.5. Fill colours controlled by CSS on the parent.
 */

interface PhiMarkProps {
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}

export function PhiMark({ className, ...rest }: PhiMarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 400 440"
      className={className}
      aria-hidden={rest["aria-hidden"] ?? true}
      focusable="false"
    >
      {/* Ring: ellipse with elliptical hole (fill-rule evenodd makes the hole) */}
      <path
        fillRule="evenodd"
        d="
          M200 30
          C310 30 400 120 400 230
          C400 340 310 430 200 430
          C90 430 0 340 0 230
          C0 120 90 30 200 30 Z
          M200 90
          C124 90 62 152 62 228
          C62 304 124 366 200 366
          C276 366 338 304 338 228
          C338 152 276 90 200 90 Z
        "
      />
      {/* Bar: rounded-end vertical stroke */}
      <rect x="192" y="6" width="16" height="428" rx="8" />
    </svg>
  );
}
