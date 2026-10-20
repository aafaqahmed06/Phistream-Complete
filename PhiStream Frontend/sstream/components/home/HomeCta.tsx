import Link from "next/link";
import { ctaSection, contactEmail as defaultEmail } from "@/lib/content-home";
import { PhiMark } from "./PhiMark";

interface HomeCtaProps {
  /** Overrides the default email with backend-provided value if available. */
  email?: string;
}

/**
 * HomeCta — #contact section (WHITE background).
 * §4.5 of the implementation plan.
 *
 * Note: id is "contact" (not "cta") because the whole site links to /#contact.
 * The CSS class is .pf-cta.
 */
export function HomeCta({ email }: HomeCtaProps) {
  const d = ctaSection;
  const mail = email ?? defaultEmail;

  return (
    <section id="contact" className="pf-cta">
      {/* Big φ watermark — aria-hidden, positioned absolutely */}
      <PhiMark className="pf-cta-mark" aria-hidden="true" />

      <div className="pf-cta-grid">
        <div>
          <h2>{d.heading}</h2>
          <p className="pf-lead">{d.lead}</p>

          <Link className="pf-apply" href="/apply">
            <span className="pf-apply-text">
              <span className="pf-apply-label">Start an application</span>
              <span className="pf-apply-note">A real person reads every one.</span>
            </span>
            <span className="pf-apply-chip" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </span>
          </Link>

          <ol className="pf-sx">
            {d.steps.map((step) => (
              <li key={step.n}>
                <b>{step.n}</b>
                {step.text}
              </li>
            ))}
          </ol>

          {/* A10: both display text and mailto use the same email */}
          <a className="pf-email" href={`mailto:${mail}`}>
            {mail}
          </a>
        </div>
      </div>
    </section>
  );
}
