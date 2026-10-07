import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { TrackOnView, Vsl } from "@/components/Vsl";
import { getHomeContent, getOnboardingContent } from "@/lib/api";
import { onboarding } from "@/lib/content";
import { videoSource } from "@/lib/video";

export const metadata: Metadata = {
  title: "Start here — Phistreams",
  description: onboarding.lead,
};

export const revalidate = 60;

/** The backend's seed data is marked [DEMO]; it never reaches a visitor. */
const real = (text: string | null | undefined): text is string =>
  !!text && !text.includes("[DEMO]");

/**
 * Where social-bio links land: the pitch, the video, how it works, then the
 * application. Headline, video and steps come from the backend
 * (GET /content/onboarding) and fall back to lib/content.ts.
 *
 *   ink                  cream          ink
 *   headline + video     steps + CTA    footer
 */
export default async function OnboardingPage() {
  const [content, home] = await Promise.all([getOnboardingContent(), getHomeContent()]);

  const headline = real(content?.headline) ? content.headline : onboarding.headline;
  const video = real(content?.vsl.url) ? videoSource(content.vsl.url) : null;
  const backendSteps = content?.steps ?? [];
  const steps =
    backendSteps.length && backendSteps.every((s) => real(s.title))
      ? backendSteps
      : onboarding.steps.slice(video ? 0 : 1);

  return (
    <>
      <TrackOnView event="onboarding_view" />
      <Nav />
      <main id="main">
        <section className="surface-ink pb-16 pt-40 md:pb-24 md:pt-48">
          <div className="container-x">
            <Eyebrow tone="gold-on-ink">{onboarding.eyebrow}</Eyebrow>
            <h1 className="mt-6 max-w-[18ch] font-display text-display-xl font-light text-cream">
              {headline}
            </h1>
            <p className="mt-8 max-w-[52ch] text-body-l text-cream/80">{onboarding.lead}</p>
            {video ? (
              <div className="mt-14 max-w-4xl">
                <Vsl source={video} label={onboarding.videoLabel} />
              </div>
            ) : null}
          </div>
        </section>

        <section className="surface-cream section-y">
          <div className="container-x">
            <Eyebrow tone="on-cream">{onboarding.stepsHeading}</Eyebrow>
            <ol className="mt-8 grid grid-cols-1 gap-x-8 gap-y-10 md:grid-cols-2 xl:grid-cols-4">
              {steps.map((step, i) => (
                <li key={step.title} className="border-t border-ink/60 pt-6">
                  <span className="font-mono text-eyebrow text-gold-deep">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h2 className="mt-3 font-display text-heading text-ink">{step.title}</h2>
                  {step.description ? (
                    <p className="mt-3 max-w-[40ch] text-body text-ink/70">{step.description}</p>
                  ) : null}
                </li>
              ))}
            </ol>
            <div className="mt-14">
              <Button href={onboarding.cta.href} arrow>
                {onboarding.cta.label}
              </Button>
            </div>
          </div>
        </section>
      </main>
      <Footer socialLinks={home?.socialLinks} />
    </>
  );
}
