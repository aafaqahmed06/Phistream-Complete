/**
 * The six service illustrations as SVG, for the static card strip. They mirror the
 * canvas drawings the 3D cards use. Colours come from CSS variables set on the card
 * (--fg text colour, --ac accent, --bg card fill) via the .fg-s/.fg-f/.ac-s/.ac-f
 * classes in home.css, so one drawing works on every card colour.
 */
const dash = { strokeDasharray: "4 4" };

const ART: React.ReactNode[] = [
  // 01 identity: the φ mark in a selection box
  <>
    <rect x="22" y="14" width="76" height="92" className="fg-s" strokeWidth="1.5" opacity=".5" {...dash} />
    <path d="M10 60H110M60 6V114" className="fg-s" strokeWidth="1.5" opacity=".5" {...dash} />
    {[[19, 11], [95, 11], [19, 103], [95, 103]].map(([x, y]) => (
      <rect key={`${x}-${y}`} x={x} y={y} width="6" height="6" className="fg-f" />
    ))}
    <ellipse cx="60" cy="60" rx="22" ry="27" className="ac-s" strokeWidth="6" />
    <path d="M60 22V98" className="ac-s" strokeWidth="6" strokeLinecap="round" />
  </>,
  // 02 funnel: attention in, a customer out
  <>
    <polygon points="10,26 110,26 86,52 34,52" className="fg-f" opacity=".18" />
    <polygon points="34,55 86,55 74,79 46,79" className="fg-f" opacity=".28" />
    <polygon points="46,82 74,82 66,95 54,95" className="fg-f" opacity=".38" />
    {[[28, 12], [44, 7], [60, 13], [78, 8], [94, 12], [36, 19], [70, 19]].map(([x, y]) => (
      <circle key={`${x}-${y}`} cx={x} cy={y} r="2.6" className="fg-f" />
    ))}
    <path d="M60 97V104" className="ac-s" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 5" />
    <circle cx="60" cy="111" r="6" className="ac-f" />
  </>,
  // 03 monetization: rising bars, a trend line and a coin
  <>
    {[18, 28, 40, 55, 72].map((h, i) => (
      <rect
        key={h}
        x={14 + i * 20}
        y={104 - h}
        width="14"
        height={h}
        className={i === 4 ? "ac-f" : "fg-f"}
        opacity={i === 4 ? 1 : 0.3 + i * 0.1}
      />
    ))}
    <path d="M8 104H112" className="fg-s" strokeWidth="2" />
    <polyline points="21,88 41,78 61,64 81,48 101,30" className="ac-s" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="24" cy="24" r="11" className="ac-f" />
    <text x="24" y="29.5" textAnchor="middle" fontSize="15" fontWeight="700" className="coin">
      $
    </text>
  </>,
  // 04 content: a video frame, a timeline, a strip of takes
  <>
    <rect x="12" y="14" width="96" height="58" rx="8" className="fg-s" strokeWidth="3" />
    <path d="M54 30V56L76 43Z" className="ac-f" />
    <rect x="12" y="82" width="96" height="4" rx="2" className="fg-f" opacity=".3" />
    <rect x="12" y="82" width="56" height="4" rx="2" className="ac-f" />
    <circle cx="68" cy="84" r="5" className="ac-f" />
    {[0, 1, 2, 3].map((i) => (
      <rect key={i} x={12 + i * 25} y="96" width="22" height="14" rx="3" className="fg-f" opacity={0.2 + i * 0.06} />
    ))}
  </>,
  // 05 operations: a hub wired to four checked-off parts
  <>
    <path d="M60 60L24 24M60 60L96 24M60 60L24 96M60 60L96 96" className="fg-s" strokeWidth="2" opacity=".6" />
    <circle cx="60" cy="60" r="22" className="ac-s" strokeWidth="2.5" strokeDasharray="2 5" />
    <circle cx="60" cy="60" r="13" className="ac-f" />
    {[[11, 11], [83, 11], [11, 83], [83, 83]].map(([x, y]) => (
      <g key={`${x}-${y}`}>
        <rect x={x} y={y} width="26" height="26" rx="6" className="fg-f" />
        <path d={`M${x + 6} ${y + 13}l5 5 9-10`} className="check" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    ))}
  </>,
  // 06 scaling: steps up with an arrow riding them
  <>
    {[24, 42, 64, 88].map((h, i) => (
      <rect
        key={h}
        x={12 + i * 27}
        y={108 - h}
        width="22"
        height={h}
        className={i === 3 ? "ac-f" : "fg-f"}
        opacity={i === 3 ? 1 : 0.22 + i * 0.1}
      />
    ))}
    <path d="M14 82L38 68L58 52L92 28" className="fg-s" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    <polygon points="100,20 80,25 94,41" className="fg-f" />
  </>,
];

export function CardArt({ index }: { index: number }) {
  return (
    <svg className="pf-art" viewBox="0 0 120 120" fill="none" aria-hidden="true" focusable="false">
      {ART[index]}
    </svg>
  );
}
