import { footer, showSection } from "@/lib/content";
import { Eyebrow } from "./ui/Eyebrow";
import { Wordmark } from "./ui/Wordmark";

/** `socialLinks` from GET /content/home replace the placeholder socials. */
export function Footer({
  socialLinks,
}: {
  socialLinks?: { label: string; url: string }[];
}) {
  const socials = socialLinks?.length
    ? socialLinks.map((s) => ({ label: s.label, href: s.url, external: true }))
    : footer.socials.map((s) => ({ ...s, external: false }));

  return (
    <footer className="surface-ink relative overflow-hidden">
      {/* The studio's four lines, set as a static statement. They used to
          crawl across the page as a marquee; they are better read than
          chased. Cream on ink 13.7:1, the index in taupe 5.29:1. */}
      <div className="container-x">
        <ul className="grid border-y border-cream/15 lg:grid-cols-4">
          {footer.phraseBand.map((phrase, i) => (
            <li
              key={phrase}
              className="border-b border-cream/15 py-8 last:border-b-0 lg:border-b-0 lg:border-l lg:px-8 lg:first:border-l-0 lg:first:pl-0"
            >
              <span className="block font-mono text-eyebrow tabular text-taupe">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="mt-6 block font-display text-display-m font-light text-cream">
                {phrase}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="container-x pt-20">
        <div className="grid grid-cols-12 gap-x-8 gap-y-14">
          {/* Identity */}
          <div className="col-span-12 lg:col-span-4">
            <Wordmark className="text-3xl text-cream" />
            <p className="mt-6 max-w-[30ch] text-small text-cream/75">
              {footer.quip}
            </p>
            {socials.length ? (
              <ul className="mt-5 flex flex-wrap gap-x-6">
                {socials.map((social) => (
                  <li key={social.label}>
                    <a
                      href={social.href}
                      {...(social.external
                        ? { target: "_blank", rel: "noopener noreferrer" }
                        : {})}
                      className="inline-block py-2 text-small text-cream/75 transition-colors hover:text-gold"
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
              <ul className="mt-4">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="inline-block py-1.5 text-small text-cream/75 transition-colors hover:text-gold"
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
            <p className="mt-5 font-display text-heading font-light text-cream">
              {footer.office.city}
            </p>

            {/* Hidden until there is a signup endpoint or an email tool
                (showSection.newsletter in lib/content.ts). A form that posts
                nowhere would tell people they are subscribed when they are not. */}
            {showSection.newsletter ? (
              /*
                Presentational for now -- posts to "#" until there is an
                endpoint. The input border is full taupe (5.29:1 on ink) because
                a form control boundary is a UI component and needs 3:1; at /40
                it would compute to 1.97:1.
              */
              <form action="#" className="mt-9">
                <label
                  htmlFor="newsletter-email"
                  className="block max-w-[34ch] text-small text-cream/75"
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
                    className="min-w-0 flex-1 rounded-[2px] border border-taupe bg-transparent px-4 py-3 text-small text-cream transition-colors placeholder:text-taupe focus:border-gold focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="shrink-0 rounded-[2px] bg-gold px-5 py-3 text-small font-medium text-ink transition-colors duration-300 hover:bg-cream"
                  >
                    {footer.newsletter.submit}
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        </div>

        {/* Legal rail */}
        <div className="mt-20 flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-t border-cream/15 pt-6">
          <p className="font-mono text-eyebrow uppercase text-taupe">
            {footer.copyright}
          </p>
          <div className="flex flex-wrap items-center gap-x-6">
            {footer.legal.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="inline-block py-2 font-mono text-eyebrow uppercase text-taupe transition-colors hover:text-gold"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* The signature: the name, set enormous and cropped at the page edge.
          Decorative (aria-hidden) -- the real wordmark is above. */}
      <div
        aria-hidden="true"
        className="pointer-events-none mt-10 select-none overflow-hidden"
      >
        <span className="block translate-y-[8%] whitespace-nowrap text-center font-display text-[clamp(4.5rem,21.5vw,26rem)] font-light leading-[0.82] tracking-[-0.05em] text-cream/[0.07]">
          <span className="text-gold/40">φ</span>streams
        </span>
      </div>
    </footer>
  );
}
