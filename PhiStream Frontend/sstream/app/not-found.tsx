import type { Metadata } from "next";
import { SiteFooter, SiteNav } from "@/components/SiteChrome";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Page not found" };

/** Any address that does not exist. Next marks the response noindex for us. */
export default function NotFound() {
  return (
    <>
      <SiteNav />
      <main id="main">
        <section className="surface-ink pb-24 pt-40 md:pb-32 md:pt-48">
          <div className="container-x">
            <h1 className="max-w-[18ch] font-display text-display-xl font-light text-cream">
              That page isn&rsquo;t here.
            </h1>
            <p className="mt-8 max-w-[52ch] text-body-l text-cream/80">
              The link may be old, or the address mistyped. These are the places people usually mean.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Button href="/">Back to the home page</Button>
              <Button href="/services" variant="ghost-dark">
                See our services
              </Button>
              <Button href="/apply" variant="ghost-dark">
                Start an application
              </Button>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
