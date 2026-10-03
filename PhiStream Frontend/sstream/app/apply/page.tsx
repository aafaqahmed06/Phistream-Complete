import type { Metadata } from "next";
import { ApplicationForm } from "@/components/ApplicationForm";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { getApplicationForm, getHomeContent, getServiceTiers } from "@/lib/api";
import { apply } from "@/lib/content";

export const metadata: Metadata = {
  title: "Apply — Østreams",
  description: apply.lead,
};

/**
 * Always rendered on request: a cached form version would turn every
 * submission after a republish into a 409 FORM_VERSION_OUTDATED.
 */
export const dynamic = "force-dynamic";

/**
 *   ink     cream            ink
 *   intro   form + FAQs      footer
 */
export default async function ApplyPage() {
  const [form, tiers, home] = await Promise.all([
    getApplicationForm(),
    getServiceTiers(),
    getHomeContent(),
  ]);
  const faqs = home?.faqs ?? [];

  return (
    <>
      <Nav />
      <main id="main">
        <section className="surface-ink pb-16 pt-40 md:pb-24 md:pt-48">
          <div className="container-x">
            <Eyebrow tone="gold-on-ink">{apply.eyebrow}</Eyebrow>
            <h1 className="mt-6 max-w-[16ch] font-display text-display-xl font-light text-cream">
              {apply.heading}
            </h1>
            <p className="mt-8 max-w-[52ch] text-body-l text-cream/80">
              {apply.lead}
            </p>
          </div>
        </section>

        <section className="surface-cream section-y">
          <div className="container-x grid grid-cols-12 gap-x-8 gap-y-16">
            <div className="col-span-12 lg:col-span-7">
              {form ? (
                <ApplicationForm initialForm={form} tiers={tiers} />
              ) : (
                <div className="space-y-6">
                  <h2 className="font-display text-display-m text-ink">
                    {apply.closed.title}
                  </h2>
                  <p className="max-w-[48ch] text-body text-ink/70">
                    {apply.closed.body}
                  </p>
                  <Button href={apply.closed.link.href} arrow>
                    {apply.closed.link.label}
                  </Button>
                </div>
              )}
            </div>

            {faqs.length ? (
              <aside className="col-span-12 lg:col-span-4 lg:col-start-9">
                <div className="lg:sticky lg:top-32">
                  <Eyebrow tone="on-cream">{apply.faqHeading}</Eyebrow>
                  <dl className="mt-6">
                    {faqs.map((faq) => (
                      <div
                        key={faq.id}
                        className="border-t border-taupe/40 py-6 last:border-b"
                      >
                        <dt className="font-display text-heading text-ink">
                          {faq.question}
                        </dt>
                        <dd className="mt-3 whitespace-pre-line text-small text-ink/70">
                          {faq.answer}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </aside>
            ) : null}
          </div>
        </section>
      </main>
      <Footer socialLinks={home?.socialLinks} />
    </>
  );
}
