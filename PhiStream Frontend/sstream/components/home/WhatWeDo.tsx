import { whatWeDo } from "@/lib/content-home";
import Link from "next/link";

/**
 * WhatWeDo — #what section (cream background).
 * §4.2 — server component.
 */
export function WhatWeDo() {
  const d = whatWeDo;
  return (
    <section id="what" className="pf-what">
      <div className="pf-w2 pf-g">
        {/* Left column */}
        <div>
          <h2>{d.heading}</h2>
          <p className="pf-lead">{d.lead}</p>
          <Link href={d.more.href} className="pf-bt">
            {d.more.label}
          </Link>
        </div>

        {/* Right column — service rows */}
        <div>
          {d.rows.map((row) => (
            <div key={row.id} className="pf-row">
              <h3>{row.title}</h3>
              <p>{row.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
