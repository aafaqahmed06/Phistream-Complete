"use client";

import Link from "next/link";
import type { AdminApplicationDetail } from "@/lib/admin/api";
import {
  actorLabel,
  applicationStatusLabel,
  applicationStatusTone,
  attribution,
  eventLabel,
  formatAnswer,
  formatDateTime,
  leadStatusLabel,
} from "@/lib/admin/format";
import { useAdminData } from "./AdminSession";
import { Workspace } from "./AdminShell";
import { ErrorNotice, Facts, LoadingRows, SectionHeading, StatusMark } from "./ui";

/**
 * One application, read like a case file: who they are and what they said on
 * the left at reading width, the facts you look things up by on the right.
 */
export function ApplicationDetail({ id }: { id: string }) {
  const { data, error, loading, reload } = useAdminData<{ data: AdminApplicationDetail }>(
    `/applications/${encodeURIComponent(id)}`,
  );

  return (
    <Workspace>
      <Link
        href="/admin/applications"
        className="inline-flex items-center gap-2 text-small text-ink/70 transition-colors hover:text-ink"
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 8H3M7 4L3 8l4 4" />
        </svg>
        All applications
      </Link>

      <div className="mt-8">
        {error ? (
          <ErrorNotice error={error} onRetry={reload} />
        ) : loading || !data ? (
          <LoadingRows rows={5} />
        ) : (
          <CaseFile detail={data.data} />
        )}
      </div>
    </Workspace>
  );
}

function CaseFile({ detail }: { detail: AdminApplicationDetail }) {
  const { application: app, lead } = detail;

  return (
    <article>
      <header className="flex flex-wrap items-start justify-between gap-x-10 gap-y-5 border-b border-ink/60 pb-8">
        <div className="min-w-0">
          <p className="font-mono text-eyebrow text-ink/70">
            {app.reference}
            <span className="mx-3 text-ink/40" aria-hidden="true">/</span>
            Applied {formatDateTime(app.submittedAt)}
          </p>
          <h1 className="mt-3 font-display text-display-m font-light text-ink">{lead.fullName}</h1>
          <a
            href={`mailto:${lead.email}`}
            className="mt-2 inline-block text-body text-ink underline decoration-ink/40 underline-offset-4 hover:decoration-ink"
          >
            {lead.email}
          </a>
        </div>
        <StatusMark tone={applicationStatusTone[app.status]}>
          {applicationStatusLabel[app.status]}
        </StatusMark>
      </header>

      <div className="mt-12 grid grid-cols-1 gap-x-14 gap-y-14 xl:grid-cols-12">
        <div className="space-y-14 xl:col-span-8">
          <section aria-labelledby="answers">
            <SectionHeading>
              <span id="answers">Their answers</span>
            </SectionHeading>
            {detail.answers.length ? (
              <dl className="divide-y divide-taupe/40">
                {detail.answers.map((a) => (
                  <div key={a.questionKey} className="py-6">
                    <dt className="text-small text-ink/70">{a.label ?? a.questionKey}</dt>
                    <dd className="mt-2 max-w-[68ch] whitespace-pre-line text-body-l text-ink">
                      {a.type === "url" && typeof a.answer === "string" ? (
                        <a
                          href={a.answer}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="break-all underline decoration-ink/40 underline-offset-4 hover:decoration-ink"
                        >
                          {a.answer}
                        </a>
                      ) : (
                        formatAnswer(a.answer, a.options)
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="py-6 text-small text-ink/70">They skipped every optional question.</p>
            )}
          </section>

          <section aria-labelledby="timeline">
            <SectionHeading>
              <span id="timeline">What has happened</span>
            </SectionHeading>
            {/* A real sequence, so it is numbered, on a gold-deep rail. */}
            <ol className="relative mt-6 space-y-6 border-l-2 border-gold-deep/50 pl-8">
              {detail.events.map((event, i) => (
                <li key={event.id} className="relative">
                  <span
                    aria-hidden="true"
                    className="absolute -left-[2.6rem] top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-cream font-mono text-eyebrow text-gold-deep ring-2 ring-gold-deep"
                  >
                    {i + 1}
                  </span>
                  <p className="text-body text-ink">{eventLabel(event.eventType)}</p>
                  <p className="mt-0.5 text-small text-ink/70">
                    {actorLabel(event.actorType, event.actor)}, {formatDateTime(event.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          {detail.notes.length ? (
            <section aria-labelledby="notes">
              <SectionHeading>
                <span id="notes">Staff notes</span>
              </SectionHeading>
              <ul className="divide-y divide-taupe/40">
                {detail.notes.map((note) => (
                  <li key={note.id} className="py-5">
                    <p className="max-w-[68ch] whitespace-pre-line text-body text-ink">{note.body}</p>
                    <p className="mt-2 text-small text-ink/70">
                      {note.author.displayName}, {formatDateTime(note.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="space-y-12 xl:col-span-4">
          <section aria-labelledby="applicant">
            <SectionHeading>
              <span id="applicant">Contact</span>
            </SectionHeading>
            <Facts
              items={[
                {
                  label: "Phone",
                  value: lead.phone ? (
                    <a href={`tel:${lead.phone}`} className="underline decoration-ink/40 underline-offset-4 hover:decoration-ink">
                      {lead.phone}
                    </a>
                  ) : null,
                },
                { label: "Channel or company", value: lead.companyName },
                { label: "Came from", value: attribution(lead.source, lead.campaign) ?? "Direct" },
                { label: "First page", value: lead.landingPath },
                { label: "Lead status", value: leadStatusLabel[lead.status] },
                { label: "On file since", value: formatDateTime(lead.createdAt) },
              ]}
            />
          </section>

          <section aria-labelledby="application-facts">
            <SectionHeading>
              <span id="application-facts">Application</span>
            </SectionHeading>
            <Facts
              items={[
                { label: "Service", value: detail.serviceTier?.name ?? "Not chosen" },
                { label: "Form version", value: <span className="font-mono">{app.formVersion}</span> },
                { label: "Reviewed by", value: app.reviewer?.displayName },
                { label: "Reviewed", value: app.reviewedAt ? formatDateTime(app.reviewedAt) : null },
                { label: "Accepted", value: app.acceptedAt ? formatDateTime(app.acceptedAt) : null },
                ...(app.rejectionReason
                  ? [{ label: "Reason (internal)", value: <span className="whitespace-pre-line">{app.rejectionReason}</span> }]
                  : []),
              ]}
            />
          </section>

          {detail.scheduling.meetings.length ? (
            <section aria-labelledby="calls">
              <SectionHeading>
                <span id="calls">Calls</span>
              </SectionHeading>
              <ul className="divide-y divide-taupe/40 text-small">
                {detail.scheduling.meetings.map((m) => (
                  <li key={m.id} className="py-3">
                    <p className="text-ink">{formatDateTime(m.startsAt)}</p>
                    <p className="text-ink/70">{m.status.toLowerCase().replaceAll("_", " ")}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {detail.otherApplications.length ? (
            <section aria-labelledby="other">
              <SectionHeading>
                <span id="other">Their other applications</span>
              </SectionHeading>
              <ul className="divide-y divide-taupe/40">
                {detail.otherApplications.map((other) => (
                  <li key={other.id}>
                    <Link
                      href={`/admin/applications/${other.id}`}
                      className="flex items-center justify-between gap-4 py-3 text-small text-ink hover:underline"
                    >
                      <span className="font-mono">{other.reference}</span>
                      <StatusMark tone={applicationStatusTone[other.status]}>
                        {applicationStatusLabel[other.status]}
                      </StatusMark>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </article>
  );
}
