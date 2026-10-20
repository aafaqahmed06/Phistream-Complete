import Link from "next/link";
import type { CSSProperties } from "react";
import { services } from "@/lib/content-home";
import { CARD_SPECS } from "@/lib/tunnel/cards";
import { CardArt } from "./CardArt";

const GOLD = "#C89B3B";
const INK = "#2A201A";
const TAUPE = "#A69376";

/**
 * The six service cards as plain HTML: what visitors get instead of the 3D orbit
 * when they have Reduce Motion or Data Saver on (or WebGL is unavailable).
 *
 * It is always in the page but hidden; home.css shows it only in those cases, so
 * it works without JavaScript too. Server-rendered, no client code, no images:
 * SVG and CSS only. Each card links to its section on the services page.
 */
export function CardStrip() {
  return (
    <div className="pf-strip">
      <ul className="pf-strip-list" aria-label="Our six services">
        {CARD_SPECS.map((card, i) => (
          <li key={card.n}>
            <Link
              href={`/services#${services.items[i].slug}`}
              className="pf-sc"
              style={
                {
                  "--bg": card.bg,
                  "--fg": card.fg,
                  // gold is an accent on dark cards only; the taupe card uses ink
                  "--ac": card.bg === TAUPE ? INK : GOLD,
                } as CSSProperties
              }
            >
              <span className="pf-sc-top">
                <span className="pf-sc-n">{card.n} / 06</span>
                <CardArt index={i} />
              </span>
              <span className="pf-sc-t">{card.title}</span>
              <span className="pf-sc-l">{card.line}</span>
              <span className="pf-sc-tags">
                {card.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
