"use client";

import Link from "next/link";
import { ApiError } from "@/lib/api";
import type {
  AdminApplicationListItem,
  AdminContactSubmission,
  Funnel,
  Page,
} from "@/lib/admin/api";
import {
  applicationStatusLabel,
  applicationStatusTone,
  formatDateTime,
  formatWhen,
} from "@/lib/admin/format";
import { SplitFlap } from "@/components/motion/SplitFlap";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { useAdminData } from "./AdminSession";
import { Workspace } from "./AdminShell";
import { FunnelTable } from "./FunnelTable";
import { EmptyState, ErrorNotice, LoadingRows, SectionHeading, StatusMark } from "./ui";

/**
 * The overview leads with the one number that asks something of the reader:
 * applications waiting for a decision. It lands on the split-flap board, in
 * gold on ink, exactly like the site's stats band -- the single loud moment
 * in the back office. Everything under it is quiet lists.
 */
export function Overview() {
  const fresh = useAdminData<Page<unknown>>("/applications?status=NEW&limit=1");
  const inReview = useAdminData<Page<unknown>>("/applications?status=UNDER_REVIEW&limit=1");
  const recent = useAdminData<Page<AdminApplicationListItem>>("/applications?limit=5");
  const messages = useAdminData<Page<AdminContactSubmission>>("/contact-submissions?limit=4");
  const leads = useAdminData<Page<unknown>>("/leads?limit=1");
  const funnel = useAdminData<{ data: Funnel }>("/analytics/funnel");

  const newCount = fresh.data?.pagination.total;
  const reviewCount = inReview.data?.pagination.total;
  const waiting =
    newCount !== undefined && reviewCount !== undefined ? newCount + reviewCount : null;

  return (
    <>
      {/* The board. Full-bleed ink across the workspace. */}
      <section className="surface-ink grain relative overflow-hidden border-b border-taupe/25">
        <Workspace>
          <Eyebrow tone="on-ink">Waiting for a decision</Eyebrow>
          <div className="mt-6 flex flex-wrap items-end gap-x-10 gap-y-6">
            <p className="font-display text-display-xl font-light leading-none text-gold">
              {waiting === null ? (
                <span className="text-taupe">··</span>
              ) : (
                <SplitFlap text={String(waiting).padStart(2, "0")} />
              )}
            </p>
            <p className="max-w-[30ch] pb-2 text-body text-cream/80">
              {waiting === null
                ? "Counting applications…"
                : waiting === 0
                  ? "Nothing waiting. Every application has a decision."
                  : `${newCount} not yet opened, ${reviewCount} in review.`}
            </p>
          </div>

          <dl className="mt-12 grid grid-cols-2 gap-x-8 gap-y-6 border-t border-taupe/25 pt-6 sm:grid-cols-3">
            <BoardFigure label="Applications in total" value={recent.data?.pagination.total} />
            <BoardFigure label="Contact messages" value={messages.data?.pagination.total} />
            <BoardFigure label="People on file" value={leads.data?.pagination.total} />
          </dl>
        </Workspace>
      </section>

      <Workspace>
        <div className="grid grid-cols-1 gap-x-12 gap-y-14 xl:grid-cols-12">
          <section className="xl:col-span-7" aria-labelledby="latest-applications">
            <SectionHeading href="/admin/applications" linkLabel="All applications">
              <span id="latest-applications">Latest applications</span>
            </SectionHeading>
            {recent.error ? (
              <div className="mt-6"><ErrorNotice error={recent.error} onRetry={recent.reload} /></div>
            ) : recent.loading && !recent.data ? (
              <LoadingRows rows={3} />
            ) : recent.data?.data.length ? (
              <ul className="divide-y divide-taupe/40">
                {recent.data.data.map((app) => (
                  <li key={app.id}>
                    <Link
                      href={`/admin/applications/${app.id}`}
                      className="group -mx-3 flex items-center gap-4 rounded-xl px-3 py-5 transition-colors hover:bg-ink/[0.05]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-heading text-ink decoration-gold-deep decoration-2 underline-offset-4 group-hover:underline">
                          {app.lead.fullName}
                        </span>
                        <span className="mt-1 block truncate text-small text-ink/70">
                          {app.serviceTier?.name ?? "No service chosen"}
                        </span>
                      </span>
                      <time
                        dateTime={app.submittedAt}
                        title={formatDateTime(app.submittedAt)}
                        className="hidden font-mono text-eyebrow text-ink/70 sm:block"
                      >
                        {formatWhen(app.submittedAt)}
                      </time>
                      <span>
                        <StatusMark tone={applicationStatusTone[app.status]}>
                          {applicationStatusLabel[app.status]}
                        </StatusMark>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No applications yet.">
                The application form is paused, so new ones won&apos;t arrive until
                it is back on /apply. New enquiries are under Messages.
              </EmptyState>
            )}
          </section>

          <section className="xl:col-span-5" aria-labelledby="latest-messages">
            <SectionHeading href="/admin/messages" linkLabel="All messages">
              <span id="latest-messages">Latest messages</span>
            </SectionHeading>
            {messages.error ? (
              <div className="mt-6"><ErrorNotice error={messages.error} onRetry={messages.reload} /></div>
            ) : messages.loading && !messages.data ? (
              <LoadingRows rows={3} />
            ) : messages.data?.data.length ? (
              <ul className="divide-y divide-taupe/40">
                {messages.data.data.map((m) => (
                  <li key={m.id} className="py-5">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="truncate font-display text-heading text-ink">{m.fullName}</span>
                      <time
                        dateTime={m.createdAt}
                        title={formatDateTime(m.createdAt)}
                        className="shrink-0 font-mono text-eyebrow text-ink/70"
                      >
                        {formatWhen(m.createdAt)}
                      </time>
                    </div>
                    <p className="mt-2 line-clamp-2 text-small text-ink/70">{m.message}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No messages yet.">
                Messages from the contact form on the homepage land here.
              </EmptyState>
            )}
          </section>

          <section className="xl:col-span-12" aria-labelledby="funnel">
            <SectionHeading>
              <span id="funnel">Last 30 days, from first visit to booked call</span>
            </SectionHeading>
            {funnel.error ? (
              funnel.error instanceof ApiError && funnel.error.status === 403 ? (
                <p className="mt-6 text-small text-ink/70">
                  The funnel is visible to admins only.
                </p>
              ) : (
                <div className="mt-6"><ErrorNotice error={funnel.error} onRetry={funnel.reload} /></div>
              )
            ) : funnel.data ? (
              <>
                <FunnelTable funnel={funnel.data.data} />
                <p className="mt-4 max-w-[70ch] text-small text-ink/70">
                  The first three stages count anonymous visits; the rest count applications
                  submitted in the period, so the jump between them is approximate.
                </p>
              </>
            ) : (
              <LoadingRows rows={3} />
            )}
          </section>
        </div>
      </Workspace>
    </>
  );
}

function BoardFigure({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div>
      <dt className="text-small text-taupe">{label}</dt>
      <dd className="mt-1 font-display text-display-m font-light text-cream tabular-nums">
        {value ?? "—"}
      </dd>
    </div>
  );
}
