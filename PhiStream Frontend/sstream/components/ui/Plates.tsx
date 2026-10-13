/**
 * Generated artwork for the two example engagements. No photography exists, so
 * each case study gets a small diagram of what it is about, drawn in the same
 * hairline language as the hero.
 *
 *   FunnelPlate   many lines of attention narrowing into one owned point
 *                 (the creator track: audience -> product)
 *   SignalPlate   one source radiating outward through rings
 *                 (the founder track: company -> audience)
 *
 * Both are decorative and aria-hidden -- the text beside them carries the
 * meaning. The gold layer is the part that responds to a parent `group` hover.
 */

const FUNNEL_LINES = Array.from({ length: 27 }, (_, i) => {
  const y = 14 + i * (172 / 26);
  return `M0 ${y.toFixed(1)} C 190 ${y.toFixed(1)}, 250 100, 420 100`;
});

export function FunnelPlate({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 520 200"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      fill="none"
    >
      {FUNNEL_LINES.map((d, i) => (
        <path
          key={i}
          d={d}
          stroke="var(--color-cream)"
          strokeOpacity="0.24"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <path
        d="M420 100 H 520"
        stroke="var(--color-gold)"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx="420" cy="100" r="5" fill="var(--color-gold)" />
      <circle
        cx="420"
        cy="100"
        r="14"
        stroke="var(--color-gold)"
        strokeOpacity="0.5"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
        className="origin-[420px_100px] transition-transform duration-700 ease-expo-out group-hover:scale-125"
      />
    </svg>
  );
}

const RINGS = [22, 44, 70, 100, 136, 178, 226, 280];

export function SignalPlate({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 520 200"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      fill="none"
    >
      {RINGS.map((r, i) => (
        <circle
          key={r}
          cx="110"
          cy="100"
          r={r}
          stroke="var(--color-cream)"
          strokeOpacity={Math.max(0.08, 0.34 - i * 0.04)}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <path
        d="M110 100 H 520"
        stroke="var(--color-gold)"
        strokeOpacity="0.7"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx="110" cy="100" r="5" fill="var(--color-gold)" />
      <circle
        cx="110"
        cy="100"
        r="14"
        stroke="var(--color-gold)"
        strokeOpacity="0.5"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
        className="origin-[110px_100px] transition-transform duration-700 ease-expo-out group-hover:scale-125"
      />
    </svg>
  );
}
