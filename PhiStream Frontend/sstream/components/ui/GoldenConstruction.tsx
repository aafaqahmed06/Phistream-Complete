/**
 * The golden rectangle, subdivided into squares, with the spiral drawn through
 * it. The φ in the name, as geometry.
 *
 * Geometry is generated (not hand-placed): a 1000-wide golden rectangle, each
 * step cutting the largest square off the remaining rectangle, rotating
 * left / top / right / bottom. The spiral is one path with pathLength="1" so a
 * single dash value draws it at any rendered size -- see .golden-spiral.
 *
 * Purely decorative: aria-hidden, no text.
 *
 * Colour: cream hairlines at low alpha for the squares, gold for the spiral.
 * Gold on ink is 6.15:1; the lines are a non-text graphic, so the 3:1 threshold
 * is the relevant one and the spiral clears it.
 */
const SPIRAL =
  "M0 618.03 A618.03 618.03 0 0 1 618.03 0 A381.97 381.97 0 0 1 1000 381.97 A236.07 236.07 0 0 1 763.93 618.03 A145.9 145.9 0 0 1 618.03 472.14 A90.17 90.17 0 0 1 708.2 381.97 A55.73 55.73 0 0 1 763.93 437.69 A34.44 34.44 0 0 1 729.49 472.14 A21.29 21.29 0 0 1 708.2 450.85 A13.16 13.16 0 0 1 721.36 437.69 A8.13 8.13 0 0 1 729.49 445.82 A5.02 5.02 0 0 1 724.47 450.85";

const SQUARES: { x: number; y: number; s: number }[] = [
  { x: 0, y: 0, s: 618.03 },
  { x: 618.03, y: 0, s: 381.97 },
  { x: 763.93, y: 381.97, s: 236.07 },
  { x: 618.03, y: 472.14, s: 145.9 },
  { x: 618.03, y: 381.97, s: 90.17 },
  { x: 708.2, y: 381.97, s: 55.73 },
  { x: 729.49, y: 437.69, s: 34.44 },
  { x: 708.2, y: 450.85, s: 21.29 },
];

export function GoldenConstruction({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="-2 -2 1004 622.03"
      className={className}
      fill="none"
    >
      <rect
        x="0"
        y="0"
        width="1000"
        height="618.03"
        stroke="var(--color-cream)"
        strokeOpacity="0.22"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
        className="golden-square"
        style={{ animationDelay: "0.1s" }}
      />
      {SQUARES.map((sq, i) => (
        <rect
          key={i}
          x={sq.x}
          y={sq.y}
          width={sq.s}
          height={sq.s}
          stroke="var(--color-cream)"
          strokeOpacity="0.16"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
          className="golden-square"
          style={{ animationDelay: `${0.25 + i * 0.22}s` }}
        />
      ))}
      <path
        d={SPIRAL}
        pathLength={1}
        stroke="var(--color-gold)"
        strokeWidth="1.5"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        className="golden-spiral"
      />
      {/* The eye of the spiral: where the construction resolves. */}
      <circle
        cx="724.47"
        cy="450.85"
        r="3"
        fill="var(--color-gold)"
        className="golden-square"
        style={{ animationDelay: "3.6s" }}
      />
    </svg>
  );
}
