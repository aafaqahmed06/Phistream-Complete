"use client";

import { useState } from "react";
import type { Funnel } from "@/lib/admin/api";

/**
 * The funnel as ONE series of ordered stages: a table whose last column is a
 * bar, so the numbers are always text (no colour-only reading) and the chart
 * doubles as its own table view.
 *
 * Bars are gold-deep: on cream it is 4.38:1, clear of the 3:1 non-text floor,
 * where gold would be 2.23:1 and fail. Thin, 4px rounded ends, anchored to the
 * left baseline. A single series needs no legend; the heading names it.
 */

/**
 * `base` is what a stage counts. The first three count anonymous VISITS, the
 * rest count APPLICATIONS, so a "from previous" rate across that break would
 * divide two different things (it can read 166%) and is left blank.
 */
type Stage = { key: string; label: string; value: number; unit: string; base: "visits" | "applications" };

function stages(f: Funnel["funnel"]): Stage[] {
  return [
    { key: "views", label: "Visited onboarding", value: f.onboardingViews, unit: "visits to the onboarding page", base: "visits" },
    { key: "vsl", label: "Started the video", value: f.vslStarts, unit: "visitors pressed play", base: "visits" },
    { key: "start", label: "Started an application", value: f.applicationStarts, unit: "visitors began the form", base: "visits" },
    { key: "apps", label: "Applied", value: f.applications, unit: "applications submitted", base: "applications" },
    { key: "accepted", label: "Accepted", value: f.accepted, unit: "of them accepted", base: "applications" },
    { key: "booked", label: "Booked a call", value: f.meetingsBooked, unit: "of them booked a call", base: "applications" },
  ];
}

const percent = new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 1 });
const number = new Intl.NumberFormat("en-GB");

export function FunnelTable({ funnel }: { funnel: Funnel }) {
  const rows = stages(funnel.funnel);
  const max = Math.max(1, ...rows.map((r) => r.value));
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <table className="w-full border-collapse text-small">
      <caption className="sr-only">
        Funnel from onboarding visits to booked calls, with each stage as a share of the one before.
      </caption>
      <thead>
        <tr className="border-b border-ink/60 text-left text-ink/70">
          <th scope="col" className="py-3 pr-4 font-normal">Stage</th>
          <th scope="col" className="py-3 pr-4 text-right font-normal">Count</th>
          <th scope="col" className="hidden py-3 pr-6 text-right font-normal sm:table-cell">From previous</th>
          <th scope="col" className="w-[42%] py-3 font-normal">
            <span className="sr-only">Bar</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const before = i > 0 ? rows[i - 1] : null;
          const share =
            before && before.base === row.base && before.value > 0 ? row.value / before.value : null;
          const width = (row.value / max) * 100;
          const active = hovered === row.key;
          return (
            <tr
              key={row.key}
              onMouseEnter={() => setHovered(row.key)}
              onMouseLeave={() => setHovered(null)}
              className={`border-b border-taupe/40 transition-colors ${active ? "bg-ink/5" : ""}`}
            >
              <th scope="row" className="py-4 pr-4 text-left font-normal text-ink">
                <span className="mr-3 font-mono text-eyebrow text-ink/70">{i + 1}</span>
                {row.label}
              </th>
              <td className="py-4 pr-4 text-right font-mono text-ink tabular-nums">
                {number.format(row.value)}
              </td>
              <td className="hidden py-4 pr-6 text-right font-mono text-ink/70 tabular-nums sm:table-cell">
                {share === null ? "—" : percent.format(share)}
              </td>
              <td className="relative py-4">
                {/* Hit target is the whole row; the bar is the mark. */}
                <span aria-hidden="true" className="block h-2.5 w-full">
                  <span
                    className="block h-full rounded-r-[4px] bg-gold-deep transition-[width] duration-500 ease-expo-out"
                    style={{ width: `${row.value === 0 ? 0 : Math.max(width, 1.5)}%` }}
                  />
                </span>
                {active ? (
                  <span
                    role="tooltip"
                    className="absolute right-0 top-1/2 z-10 -translate-y-1/2 whitespace-nowrap rounded-full bg-ink px-3 py-1 text-small text-cream shadow-[3px_3px_0_0_var(--color-gold)]"
                  >
                    {number.format(row.value)} {row.unit}
                  </span>
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
