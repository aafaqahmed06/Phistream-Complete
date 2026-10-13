import type { ReactNode } from "react";
import { SectionRule } from "./SectionRule";

type PageHeaderProps = {
  eyebrow: string;
  title: ReactNode;
  lead?: string;
  /** Max width of the title in `ch`, so each page can control its own break. */
  titleMax?: string;
  /** Optional content under the lead, e.g. the onboarding video. */
  children?: ReactNode;
};

/**
 * The ink intro every inner page opens with: the same hairline columns as the
 * home hero, a section rule, then the title and lead. One component so /apply,
 * /onboarding, /schedule and every document page open identically.
 *
 * CSS entrances only (see .fade-up): the title is the LCP element here too.
 */
export function PageHeader({
  eyebrow,
  title,
  lead,
  titleMax = "18ch",
  children,
}: PageHeaderProps) {
  return (
    <section className="surface-ink relative isolate overflow-hidden pb-20 pt-36 md:pb-28 md:pt-48">
      <div className="grid-rules" aria-hidden="true">
        <div>
          <div>
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>

      <div className="container-x relative z-10">
        <div className="fade-up" style={{ animationDelay: "0.05s" }}>
          <SectionRule label={eyebrow} />
        </div>

        <h1
          className="fade-up mt-12 font-display text-display-xl font-light text-cream md:mt-16"
          style={{ maxWidth: titleMax, animationDelay: "0.15s" }}
        >
          {title}
        </h1>

        {lead ? (
          <p
            className="fade-up mt-8 max-w-[52ch] text-body-l text-cream/75"
            style={{ animationDelay: "0.3s" }}
          >
            {lead}
          </p>
        ) : null}

        {children}
      </div>
    </section>
  );
}
