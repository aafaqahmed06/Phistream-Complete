import { SiteFooter, SiteNav } from "./SiteChrome";

/**
 * Shown while a server-rendered page waits on the backend (the application and
 * onboarding pages). Same frame as the finished page, so nothing jumps when the
 * content arrives.
 */
export function PageLoading() {
  return (
    <>
      <SiteNav />
      <main id="main" aria-busy="true">
        <section className="surface-ink pb-16 pt-40 md:pb-24 md:pt-48">
          <div className="container-x" role="status">
            <span className="sr-only">Loading</span>
            <div className="h-4 w-28 animate-pulse rounded-full bg-taupe/30" />
            <div className="mt-6 h-14 w-full max-w-2xl animate-pulse rounded-2xl bg-cream/10 md:h-24" />
            <div className="mt-8 h-5 w-full max-w-lg animate-pulse rounded-full bg-cream/10" />
            <div className="mt-3 h-5 w-full max-w-md animate-pulse rounded-full bg-cream/10" />
          </div>
        </section>
        <section className="surface-cream section-y">
          <div className="container-x">
            <div className="h-8 w-48 animate-pulse rounded-full bg-ink/10" />
            <div className="mt-8 h-12 w-full max-w-xl animate-pulse rounded-2xl bg-ink/10" />
            <div className="mt-4 h-12 w-full max-w-xl animate-pulse rounded-2xl bg-ink/10" />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
