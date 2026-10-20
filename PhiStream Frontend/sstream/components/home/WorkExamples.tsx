import { workExamples } from "@/lib/content-home";
import { Reveal } from "./Reveal";

/**
 * WorkExamples — #work section (ink background).
 * §4.3 — server shell with client Reveal wrapper.
 */
export function WorkExamples() {
  const d = workExamples;
  return (
    <section id="work" className="pf-work">
      <div className="pf-w2">
        {/* Header */}
        <div className="pf-work-hd">
          <h2>{d.heading}</h2>
          <p className="pf-sub2">{d.sub}</p>
        </div>

        {/* Cards grid */}
        <div className="pf-tk-grid">
          {d.items.map((item, i) => (
            <Reveal key={item.id} delay={i === 1 ? 120 : 0}>
              <article
                className="pf-tk"
                data-l={item.letter}
                style={{ "--a": item.accent } as React.CSSProperties}
              >
                <div className="pf-tk-top">
                  <span className="pf-wh">{item.track}</span>
                  <span className="pf-chip">{d.chip}</span>
                </div>

                {/* Flow chips */}
                <div className="pf-fl">
                  {item.chips.map((chip, ci) => (
                    <span key={chip} className="pf-fl-inner">
                      <span className="pf-wh">{chip}</span>
                      {ci < item.chips.length - 1 && <i className="pf-connector" aria-hidden="true" />}
                    </span>
                  ))}
                </div>

                <h3>{item.title}</h3>
                <p>{item.body}</p>

                <p className="pf-mt">
                  What we&apos;d track: <b>{item.metric}</b>
                </p>

                <a href={item.href} className="pf-lk">
                  Read the full example
                  <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 8h11M9 4l4 4-4 4" />
          </svg>
                </a>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
