"use client";

import Link from "next/link";
import { useState } from "react";
import type { AdminApplicationListItem, ApplicationStatus } from "@/lib/admin/api";
import {
  applicationStatusLabel,
  applicationStatusTone,
  attribution,
  formatDateTime,
  formatWhen,
} from "@/lib/admin/format";
import { Workspace } from "./AdminShell";
import { useAdminList } from "./useAdminList";
import {
  EmptyState,
  ErrorNotice,
  FilterTabs,
  ListFooter,
  LoadingRows,
  PageHeader,
  StatusMark,
} from "./ui";

type Filter = "ALL" | ApplicationStatus;

/** The statuses worth a tab; the rest are rare and still visible under "All". */
const FILTERS: readonly { value: Filter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "NEW", label: applicationStatusLabel.NEW },
  { value: "UNDER_REVIEW", label: applicationStatusLabel.UNDER_REVIEW },
  { value: "SCHEDULING_OPEN", label: applicationStatusLabel.SCHEDULING_OPEN },
  { value: "SCHEDULED", label: applicationStatusLabel.SCHEDULED },
  { value: "REJECTED", label: applicationStatusLabel.REJECTED },
];

export function ApplicationsList() {
  const [filter, setFilter] = useState<Filter>("ALL");
  const list = useAdminList<AdminApplicationListItem>("/applications", {
    status: filter === "ALL" ? undefined : filter,
  });

  return (
    <Workspace>
      <PageHeader
        title="Applications"
        lead="Everyone who filled in the form on /apply, newest first. Open one to read their answers."
      />

      <div className="mt-10">
        <FilterTabs label="Filter by status" options={FILTERS} value={filter} onChange={setFilter} />
      </div>

      <div className="mt-8">
        {list.error ? (
          <ErrorNotice error={list.error} onRetry={list.reload} />
        ) : list.initialLoading ? (
          <LoadingRows />
        ) : list.items.length === 0 ? (
          <EmptyState
            title={filter === "ALL" ? "No applications yet." : `Nothing ${applicationStatusLabel[filter].toLowerCase()} right now.`}
          >
            {filter === "ALL"
              ? "They appear here as soon as someone submits the form on /apply."
              : "Pick another status, or All to see everything."}
          </EmptyState>
        ) : (
          <>
            {/* Column guide for wide screens; rows carry their own labels on small ones. */}
            <div className="hidden grid-cols-12 gap-x-6 border-b border-ink/60 pb-3 text-small text-ink/70 lg:grid">
              <span className="col-span-4">Applicant</span>
              <span className="col-span-3">Service</span>
              <span className="col-span-2">Came from</span>
              <span className="col-span-1">Applied</span>
              <span className="col-span-2 text-right">Status</span>
            </div>
            <ul className="divide-y divide-taupe/40 border-b border-taupe/40">
              {list.items.map((app) => (
                <li key={app.id}>
                  <Link
                    href={`/admin/applications/${app.id}`}
                    className="group -mx-3 grid grid-cols-12 items-center gap-x-6 gap-y-2 rounded-xl px-3 py-5 transition-colors hover:bg-ink/[0.05]"
                  >
                    <span className="col-span-9 min-w-0 lg:col-span-4">
                      <span className="block truncate font-display text-heading text-ink decoration-gold-deep decoration-2 underline-offset-4 group-hover:underline">
                        {app.lead.fullName}
                      </span>
                      <span className="mt-1 block truncate text-small text-ink/70">
                        {app.lead.email}
                        <span className="ml-3 font-mono text-eyebrow">{app.reference}</span>
                      </span>
                    </span>
                    <span className="col-span-3 flex justify-end lg:order-last lg:col-span-2">
                      <StatusMark tone={applicationStatusTone[app.status]}>
                        {applicationStatusLabel[app.status]}
                      </StatusMark>
                    </span>
                    <span className="col-span-12 truncate text-small text-ink lg:col-span-3">
                      {app.serviceTier?.name ?? <span className="text-ink/70">Not chosen</span>}
                    </span>
                    <span className="col-span-8 truncate text-small text-ink/70 lg:col-span-2">
                      {attribution(app.lead.source, app.lead.campaign) ?? "Direct"}
                    </span>
                    <time
                      dateTime={app.submittedAt}
                      title={formatDateTime(app.submittedAt)}
                      className="col-span-4 text-right font-mono text-eyebrow text-ink/70 lg:col-span-1 lg:text-left"
                    >
                      {formatWhen(app.submittedAt)}
                    </time>
                  </Link>
                </li>
              ))}
            </ul>
            <ListFooter
              shown={list.items.length}
              total={list.total}
              onMore={list.more}
              loading={list.loading}
            />
          </>
        )}
      </div>
    </Workspace>
  );
}
