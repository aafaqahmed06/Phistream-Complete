import type { CSSProperties } from "react";
import { footer } from "@/lib/content";
import { Reveal } from "./motion/Reveal";
import { Eyebrow } from "./ui/Eyebrow";
import { GlyphWatermark, Wordmark } from "./ui/Wordmark";

/** `socialLinks` from GET /content/home replace the placeholder socials. */
export function Footer({
  socialLinks,
}: {
  socialLinks?: { label: string; url: string }[];
}) {
  const socials = socialLinks?.length
    ? socialLinks.map((s) => ({ label: s.label, href: s.url, external: true }))
    : footer.socials.map((s) => ({ ...s, external: false }));

  // Two identical copies, and the track translates -50%: that lands exactly on
  // the start of copy two. The gap lives inside each item rather than on the
  // flex container, or the loop misses by half a gap and stutters every cycle.
  const band = [...footer.phraseBand, ...footer.phraseBand];

  return (
    <footer className="relative isolate">
      {/* Full-bleed crawl on the seam between the page and the footer. It is
          INK and not a field of gold, because the palette note on #C89B3C is
          "never used for large body backgrounds" -- so the band reads as the
          top of the footer, with the gold carried by the type at 6.15:1. */}
      <div className="surface-ink overflow-hidden border-b border-taupe/25 py-5">
        <ul className="sr-only">
          {footer.phraseBand.map((phrase) => (
            <li key={phrase}>{phrase}</li>
          ))}
        </ul>

        <div aria-hidden="true" className="fade-x overflow-hidden">
          <div
            className="marquee-track"
            style={{ "--marquee-duration": "38s" } as CSSProperties}
          >
            {band.map((phrase, i) => (
              <span
                key={`${phrase}-${i}`}
                className="flex shrink-0 items-center gap-8 pr-8 md:gap-12 md:pr-12"
              >
                <span className="whitespace-nowrap font-display text-2xl leading-none text-gold md:text-3xl">
                  {phrase}
                </span>
                <span className="font-display text-xl leading-none text-cream opacity-30 md:text-2xl">
                  φ
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="surface-ink relative overflow-hidden pb-12 pt-24">
        <GlyphWatermark className="-bottom-[20vw] left-1/2 -translate-x-1/2 text-[40vw] text-cream opacity-[0.03]" />

        <div className="container-x relative z-10">
          <div className="grid grid-cols-12 gap-x-8 gap-y-14">
            {/* Identity */}
            <div className="col-span-12 lg:col-span-4">
              <Wordmark className="text-3xl text-cream" />
              <p className="mt-6 max-w-[28ch] text-small text-cream/80">
                {footer.quip}
              </p>
              {socials.length ? (
                <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2">
                  {socials.map((social) => (
                    <li key={social.label}>
                      <a
                        href={social.href}
                        {...(social.external
                          ? { target: "_blank", rel: "noopener noreferrer" }
                          : {})}
                        className="text-small text-cream/80 transition-colors hover:text-gold"
                      >
                        {social.label}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            {/* Link columns */}
            {footer.columns.map((column) => (
              <nav
                key={column.title}
                aria-label={column.title}
                className="col-span-6 md:col-span-3 lg:col-span-2"
              >
                <Eyebrow tone="on-ink">{column.title}</Eyebrow>
                <ul className="mt-5 space-y-3">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-small text-cream/80 transition-colors hover:text-gold"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}

            {/* Office + capture */}
            <div className="col-span-12 md:col-span-6 lg:col-span-4">
              <Eyebrow tone="on-ink">Office</Eyebrow>
              <p className="mt-5 text-small text-cream">{footer.office.city}</p>

              {/*
                Presentational for now -- posts to "#" until there is an
                endpoint. The input border is full taupe (5.29:1 on ink) because
                a form control boundary is a UI component and needs 3:1; at /40
                it would compute to 1.97:1.
              */}
              <form action="#" className="mt-9">
                <label
                  htmlFor="newsletter-email"
                  className="block max-w-[34ch] text-small text-cream/80"
                >
                  {footer.newsletter.label}
                </label>
                <div className="mt-3 flex gap-2">
                  <input
                    id="newsletter-email"
                    type="email"
                    name="email"
                    required
                    placeholder={footer.newsletter.placeholder}
                    className="min-w-0 flex-1 rounded-full border border-taupe bg-transparent px-4 py-3 text-small text-cream transition-colors placeholder:text-taupe focus:border-gold focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="shrink-0 rounded-full bg-gold px-5 py-3 text-small font-medium text-ink transition-colors duration-200 hover:bg-cream"
                  >
                    {footer.newsletter.submit}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Legal rail */}
          <div className="mt-20 flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-t border-taupe/25 pt-7">
            <p className="text-small text-taupe">{footer.copyright}</p>
            <Reveal y={0}>
              <Eyebrow tone="on-ink">Own the audience</Eyebrow>
            </Reveal>
          </div>
        </div>
      </div>
    </footer>
  );
}
