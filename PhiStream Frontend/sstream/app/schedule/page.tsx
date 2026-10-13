import type { Metadata } from "next";
import { BookingAccess } from "@/components/BookingAccess";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { PageHeader } from "@/components/ui/PageHeader";
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
        <PageHeader
          eyebrow={schedule.eyebrow}
          title={schedule.heading}
          lead={schedule.lead}
          titleMax="16ch"
        />

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
