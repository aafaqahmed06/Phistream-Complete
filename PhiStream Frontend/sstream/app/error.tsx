"use client";

import { useEffect } from "react";
import { SiteFooter, SiteNav } from "@/components/SiteChrome";
import { Button } from "@/components/ui/Button";

/** A page failed while rendering. The header and footer survive; the page does not. */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <SiteNav />
      <main id="main">
        <section className="surface-ink pb-24 pt-40 md:pb-32 md:pt-48">
          <div className="container-x">
            <h1 className="max-w-[18ch] font-display text-display-xl font-light text-cream">
              Something went wrong.
            </h1>
            <p className="mt-8 max-w-[52ch] text-body-l text-cream/80">
              That is on our side, not yours. Try again, and if it keeps happening, email us and mention the reference
              below.
            </p>
            {error.digest ? (
              <p className="mt-4 text-small text-taupe">Reference: {error.digest}</p>
            ) : null}
            <div className="mt-10 flex flex-wrap gap-4">
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center justify-center rounded-full bg-gold px-6 py-3 text-small font-medium text-ink transition-[background-color,transform] duration-200 ease-expo-out hover:bg-cream active:translate-y-px"
              >
                Try again
              </button>
              <Button href="/" variant="ghost-dark">
                Back to the home page
              </Button>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
