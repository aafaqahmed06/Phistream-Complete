import type { Metadata } from "next";
import { ApplicationForm } from "@/components/ApplicationForm";
import { SiteFooter, SiteNav } from "@/components/SiteChrome";
import { RetryButton } from "@/components/RetryButton";
import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { getApplicationForm, getHomeContent, getServiceTiers } from "@/lib/api";
import { apply } from "@/lib/content";
import { shareImage } from "@/lib/site";

export const metadata: Metadata = {
  title: "Apply",
  description: apply.lead,
  alternates: { canonical: "/apply" },
  openGraph: {
    title: "Apply — Phistreams",
    description: apply.lead,
    url: "/apply",
    type: "website",
    siteName: "Phistreams",
    images: [shareImage],
  },
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
  const [result, tiers, home] = await Promise.all([
    getApplicationForm(),
    getServiceTiers(),
    getHomeContent(),
  ]);
  const faqs = home?.faqs ?? [];

  return (
    <>
      <SiteNav />
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
          <div className="container-x grid grid-cols-12 gap-x-4 md:gap-x-8 gap-y-16">
            <div className="col-span-12 lg:col-span-7">
              {result.status === "open" ? (
                <ApplicationForm initialForm={result.form} tiers={tiers} />
              ) : result.status === "unavailable" ? (
                <div className="space-y-6">
                  <h2 className="font-display text-display-m text-ink">
                    {apply.unavailable.title}
                  </h2>
                  <p className="max-w-[48ch] text-body text-ink/70">
                    {apply.unavailable.body}
                  </p>
                  <div className="flex flex-wrap items-center gap-4">
                    <RetryButton>{apply.unavailable.retry}</RetryButton>
                    <Button href={apply.unavailable.contact.href} variant="ghost-light">
                      {apply.unavailable.contact.label}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <h2 className="font-display text-display-m text-ink">
                    {apply.closed.title}
                  </h2>
                  <p className="max-w-[48ch] text-body text-ink/70">
                    {apply.closed.body}
                  </p>
                  <Button href={apply.closed.link.href} variant="terra" arrow>
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
      <SiteFooter email={home?.contact.email} socialLinks={home?.socialLinks} />
    </>
  );
}
