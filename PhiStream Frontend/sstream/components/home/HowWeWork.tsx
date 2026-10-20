import { howWeWork } from "@/lib/content-home";
import { Reveal } from "./Reveal";

/**
 * HowWeWork — #approach section (cream background).
 * §4.3b — server shell with client Reveal wrapper.
 */
export function HowWeWork() {
  const d = howWeWork;
  return (
    <section id="approach" className="pf-approach">
      <div className="pf-w2">
        <h2>{d.heading}</h2>
        <p className="pf-sub2">{d.sub}</p>

        <div className="pf-steps">
          {d.steps.map((step, i) => (
            <Reveal key={step.n} delay={i * 100}>
              <div className="pf-st">
                {/* Decorative numeral (aria-hidden — step h3 is the accessible label) */}
                <span className="pf-st-num" aria-hidden="true">{step.n}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
