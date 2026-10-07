import type { Metadata } from "next";
import { BookingAccess } from "@/components/BookingAccess";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { schedule } from "@/lib/content";

/** Reached only from an acceptance email, so kept out of search engines. */
export const metadata: Metadata = {
  title: "Book your call — Phistreams",
  description: schedule.lead,
  robots: { index: false, follow: false },
};

/**
 *   ink     cream            ink
 *   intro   booking access   footer
 */
export default function SchedulePage() {
  return (
    <>
      <Nav />
      <main id="main">
        <section className="surface-ink pb-16 pt-40 md:pb-24 md:pt-48">
          <div className="container-x">
            <Eyebrow tone="gold-on-ink">{schedule.eyebrow}</Eyebrow>
            <h1 className="mt-6 max-w-[16ch] font-display text-display-xl font-light text-cream">
              {schedule.heading}
            </h1>
            <p className="mt-8 max-w-[52ch] text-body-l text-cream/80">{schedule.lead}</p>
          </div>
        </section>

        <section className="surface-cream section-y">
          <div className="container-x">
            <BookingAccess />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
