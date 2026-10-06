import type { Metadata } from "next";
import { getHomeContent } from "@/lib/api";
import type { Doc } from "@/lib/content";
import { CtaBand } from "./CtaBand";
import { Footer } from "./Footer";
import { Nav } from "./Nav";
import { Button } from "./ui/Button";
import { Eyebrow } from "./ui/Eyebrow";

export function docMetadata(page: Doc): Metadata {
  return { title: `${page.name} — Phistreams`, description: page.lead };
}

/**
 * Every inner page: services, the two tracks, case studies, how we work,
 * careers and the legal pages. Same structure as /apply.
 *
 *   ink     cream       cream      ink
 *   intro   sections    CTA band   footer
 */
export async function DocPage({ page }: { page: Doc }) {
  const home = await getHomeContent();

  return (
    <>
      <Nav />
      <main id="main">
        <section className="surface-ink pb-16 pt-40 md:pb-24 md:pt-48">
          <div className="container-x">
            <Eyebrow tone="gold-on-ink">{page.eyebrow}</Eyebrow>
            <h1 className="mt-6 max-w-[18ch] font-display text-display-xl font-light text-cream">
              {page.title}
            </h1>
            <p className="mt-8 max-w-[52ch] text-body-l text-cream/80">
              {page.lead}
            </p>
          </div>
        </section>

        <section className="surface-cream section-y">
          <div className="container-x">
            {page.sections.map((section) => (
              <section
                key={section.heading}
                id={section.id}
                className="grid scroll-mt-28 grid-cols-12 gap-x-8 gap-y-5 border-t border-taupe/40 py-12 last:border-b"
              >
                <div className="col-span-12 md:col-span-5">
                  {section.eyebrow ? (
                    <Eyebrow tone="on-cream" className="mb-4">
                      {section.eyebrow}
                    </Eyebrow>
                  ) : null}
                  <h2 className="font-display text-display-m text-ink">
                    {section.heading}
                  </h2>
                </div>

                <div className="col-span-12 space-y-5 md:col-span-7">
                  {section.body.map((p) => (
                    <p key={p} className="max-w-[60ch] text-body text-ink/70">
                      {p}
                    </p>
                  ))}
                  {section.points?.length ? (
                    <ul className="max-w-[60ch] space-y-3">
                      {section.points.map((point) => (
                        <li key={point} className="flex gap-3 text-body text-ink">
                          <span aria-hidden="true" className="text-gold-deep">
                            φ
                          </span>
                          {point}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {section.link ? (
                    <div className="pt-2">
                      <Button
                        href={section.link.href}
                        variant="ghost-light"
                        arrow
                      >
                        {section.link.label}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </section>
            ))}
          </div>
        </section>

        {page.cta === false ? null : <CtaBand email={home?.contact.email} />}
      </main>
      <Footer socialLinks={home?.socialLinks} />
    </>
  );
}
