"use client";

import Link from "next/link";
import { useState } from "react";
import { ApiError } from "@/lib/api";
import { adminPost, type AdminNotification, type NotificationEventStatus } from "@/lib/admin/api";
import {
  formatDateTime,
  formatWhen,
  notificationLabel,
  notificationStatusLabel,
  notificationStatusTone,
} from "@/lib/admin/format";
import { useAdminSession } from "./AdminSession";
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

type Filter = "ALL" | NotificationEventStatus;

const FILTERS: readonly { value: Filter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "FAILED", label: "Failed" },
  { value: "PENDING", label: "Sending" },
  { value: "PROCESSED", label: "Sent" },
];

/**
 * Every email the backend has sent or tried to send, newest first. A failed
 * one can be retried; deliveries that already went out are not sent twice.
 */
export function NotificationsList() {
  const [filter, setFilter] = useState<Filter>("ALL");
  const list = useAdminList<AdminNotification>("/notifications", {
    status: filter === "ALL" ? undefined : filter,
  });

  return (
    <Workspace>
      <PageHeader
        title="Emails"
        lead="What the studio's server has emailed, to applicants and to staff. Failed ones can be sent again."
        aside={<FilterTabs label="Filter by status" options={FILTERS} value={filter} onChange={setFilter} />}
      />

      <div className="mt-10">
        {list.error ? (
          <ErrorNotice error={list.error} onRetry={list.reload} />
        ) : list.initialLoading ? (
          <LoadingRows />
        ) : list.items.length === 0 ? (
          <EmptyState title={filter === "FAILED" ? "Nothing has failed." : "No emails yet."}>
            Emails appear here when someone sends a message, applies, or is accepted or declined.
          </EmptyState>
        ) : (
          <>
            <ul className="divide-y divide-taupe/40 border-y border-taupe/40">
              {list.items.map((n) => (
                <Notification key={n.id} notification={n} />
              ))}
            </ul>
            <ListFooter shown={list.items.length} total={list.total} onMore={list.more} loading={list.loading} />
          </>
        )}
      </div>
    </Workspace>
  );
}

function Notification({ notification }: { notification: AdminNotification }) {
  const { token } = useAdminSession();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // A retry is shown in place: reloading the list would lose "Show more" pages.
  const [requeued, setRequeued] = useState(false);
  const n = requeued ? { ...notification, status: "PENDING" as const } : notification;

  async function retry() {
    setBusy(true);
    setProblem(null);
    try {
      await adminPost(`/notifications/${encodeURIComponent(n.id)}/retry`, await token());
      setRequeued(true);
    } catch (error) {
      setProblem(error instanceof ApiError ? error.message : "That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="grid grid-cols-1 gap-x-10 gap-y-4 py-7 lg:grid-cols-12">
      <div className="lg:col-span-4">
        <p className="font-display text-heading text-ink">{notificationLabel(n.eventType)}</p>
        <time
          dateTime={n.createdAt}
          title={formatDateTime(n.createdAt)}
          className="mt-2 block font-mono text-eyebrow text-ink/70"
        >
          {formatWhen(n.createdAt)}
        </time>
        {n.subjectType === "application" ? (
          <Link
            href={`/admin/applications/${n.subjectId}`}
            className="mt-2 inline-block text-small text-ink underline decoration-ink/40 underline-offset-4 hover:decoration-ink"
          >
            Open the application
          </Link>
        ) : null}
      </div>

      <div className="space-y-3 lg:col-span-6">
        {n.deliveries.length ? (
          <ul className="space-y-2 text-small">
            {n.deliveries.map((d) => (
              <li key={d.id} className="flex flex-wrap items-baseline gap-x-3">
                <span className="break-all text-ink">{d.recipient}</span>
                <span className="text-ink/70">
                  {d.status === "SENT" ? "sent" : d.status === "FAILED" ? "failed" : "waiting"}
                  {d.lastError ? ` · ${d.lastError}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-small text-ink/70">No recipients yet.</p>
        )}
        {n.lastError ? <p className="font-mono text-eyebrow text-alert">{n.lastError}</p> : null}
        {problem ? (
          <p role="alert" className="text-small text-alert">
            {problem}
          </p>
        ) : null}
      </div>

      <div className="flex items-start gap-4 lg:col-span-2 lg:flex-col lg:items-end">
        <StatusMark tone={notificationStatusTone[n.status]}>{notificationStatusLabel[n.status]}</StatusMark>
        {n.status === "FAILED" ? (
          <button
            type="button"
            onClick={() => void retry()}
            disabled={busy}
            className="rounded-full border border-ink/60 px-4 py-2 text-small font-medium text-ink transition-colors hover:border-gold-deep hover:bg-gold/10 disabled:opacity-70"
          >
            {busy ? "Retrying…" : "Send again"}
          </button>
        ) : null}
      </div>
    </li>
  );
}
