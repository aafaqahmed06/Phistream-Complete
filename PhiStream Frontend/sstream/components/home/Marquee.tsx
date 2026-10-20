import { marqueePhrases } from "@/lib/content-home";

/**
 * Marquee — scrolling phrase band above the footer.
 * §4.7 — server component.
 *
 * Phrases are in preview order: "Build the business", "Keep the upside",
 * "Post less, mean more", "Own the audience" — repeated 4× for a seamless loop.
 * Animation: translateX(-50%) over 40s linear infinite.
 */
export function Marquee() {
  // Repeat 4× to ensure seamless loop (-50% translation)
  const repeated = [...marqueePhrases, ...marqueePhrases, ...marqueePhrases, ...marqueePhrases];

  return (
    <div className="pf-mq" aria-hidden="true">
      <div id="mq" className="pf-mq-inner">
        {repeated.map((phrase, i) => (
          <span key={`${phrase}-${i}`} className="pf-mq-phrase">
            {phrase}
          </span>
        ))}
      </div>

      {/* Visually hidden list for screen readers */}
      <ul className="sr-only">
        {marqueePhrases.map((phrase) => (
          <li key={phrase}>{phrase}</li>
        ))}
      </ul>
    </div>
  );
}
