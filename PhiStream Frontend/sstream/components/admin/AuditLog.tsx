"use client";

import Link from "next/link";
import type { AdminAuditEntry } from "@/lib/admin/api";
import { auditLabel, formatDateTime, formatWhen } from "@/lib/admin/format";
import { Workspace } from "./AdminShell";
import { useAdminList } from "./useAdminList";
import { EmptyState, ErrorNotice, ListFooter, LoadingRows, PageHeader } from "./ui";

/** Who did what, newest first. Read-only: the backend writes it on every staff action. */
export function AuditLog() {
  const list = useAdminList<AdminAuditEntry>("/audit-logs", {});

  return (
    <Workspace>
      <PageHeader
        title="Activity"
        lead="Every decision, note, booking link and erasure, with who made it and when."
      />

      <div className="mt-10">
        {list.error ? (
          <ErrorNotice error={list.error} onRetry={list.reload} />
        ) : list.initialLoading ? (
          <LoadingRows />
        ) : list.items.length === 0 ? (
          <EmptyState title="Nothing has happened yet.">
            Staff actions on applications, emails and leads are recorded here.
          </EmptyState>
        ) : (
          <>
            <ul className="divide-y divide-taupe/40 border-y border-taupe/40">
              {list.items.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-baseline gap-x-6 gap-y-1 py-5">
                  <time
                    dateTime={entry.createdAt}
                    title={formatDateTime(entry.createdAt)}
                    className="w-24 shrink-0 font-mono text-eyebrow text-ink/70"
                  >
                    {formatWhen(entry.createdAt)}
                  </time>
                  <p className="min-w-0 flex-1 text-body text-ink">
                    <span className="font-medium">{entry.actor?.displayName ?? "The system"}</span>{" "}
                    {auditLabel(entry.action).replace(/^./, (c) => c.toLowerCase())}
                  </p>
                  {entry.entityType === "application" && entry.entityId ? (
                    <Link
                      href={`/admin/applications/${entry.entityId}`}
                      className="text-small text-ink underline decoration-ink/40 underline-offset-4 hover:decoration-ink"
                    >
                      Open
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
            <ListFooter shown={list.items.length} total={list.total} onMore={list.more} loading={list.loading} />
          </>
        )}
      </div>
    </Workspace>
  );
}
