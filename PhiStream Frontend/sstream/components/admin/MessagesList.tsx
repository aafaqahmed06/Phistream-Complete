"use client";

import { useState } from "react";
import type { AdminContactSubmission } from "@/lib/admin/api";
import { attribution, formatDateTime, formatWhen } from "@/lib/admin/format";
import { Workspace } from "./AdminShell";
import { useAdminList, useDebounced } from "./useAdminList";
import {
  EmptyState,
  ErrorNotice,
  ListFooter,
  LoadingRows,
  PageHeader,
  SearchField,
} from "./ui";

/**
 * Contact-form messages, set as letters rather than table rows: the message
 * is the content, so it gets reading width and the sender sits above it the
 * way a letterhead does.
 */
export function MessagesList() {
  const [search, setSearch] = useState("");
  const settled = useDebounced(search.trim());
  const list = useAdminList<AdminContactSubmission>("/contact-submissions", {
    search: settled.length >= 2 ? settled : undefined,
  });

  return (
    <Workspace>
      <PageHeader
        title="Messages"
        lead="Everything sent through the contact form on the homepage, newest first."
        aside={
          <SearchField
            label="Search messages"
            placeholder="Search names, emails or words"
            value={search}
            onChange={setSearch}
          />
        }
      />

      <div className="mt-10">
        {list.error ? (
          <ErrorNotice error={list.error} onRetry={list.reload} />
        ) : list.initialLoading ? (
          <LoadingRows />
        ) : list.items.length === 0 ? (
          settled.length >= 2 ? (
            <EmptyState title={`No messages mention "${settled}".`}>
              Try a name, an email address, or a word from the message.
            </EmptyState>
          ) : (
            <EmptyState title="No messages yet.">
              Messages from the contact form on the homepage land here.
            </EmptyState>
          )
        ) : (
          <>
            <ul className="divide-y divide-taupe/40 border-y border-taupe/40">
              {list.items.map((message) => (
                <Letter key={message.id} message={message} />
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

/** Long messages open in place; short ones are shown whole. */
const PREVIEW_CHARS = 420;

function Letter({ message }: { message: AdminContactSubmission }) {
  const [open, setOpen] = useState(false);
  const long = message.message.length > PREVIEW_CHARS;
  const from = attribution(message.source, message.campaign);
  const subject = encodeURIComponent("Re: your message to Østreams");

  return (
    <li className="grid grid-cols-1 gap-x-10 gap-y-4 py-8 lg:grid-cols-12">
      <div className="lg:col-span-4">
        <p className="font-display text-heading text-ink">{message.fullName}</p>
        <a
          href={`mailto:${message.lead.email}?subject=${subject}`}
          className="mt-1 inline-block break-all text-small text-ink underline decoration-ink/40 underline-offset-4 hover:decoration-ink"
        >
          {message.lead.email}
        </a>
        <p className="mt-2 text-small text-ink/70">
          {[message.companyName, message.phone, from ? `via ${from}` : null]
            .filter(Boolean)
            .join(", ") || "No other details"}
        </p>
        <time
          dateTime={message.createdAt}
          title={formatDateTime(message.createdAt)}
          className="mt-3 block font-mono text-eyebrow text-ink/70"
        >
          {formatWhen(message.createdAt)}
        </time>
      </div>

      <div className="lg:col-span-8">
        <p
          id={`message-${message.id}`}
          className="max-w-[68ch] whitespace-pre-line text-body-l text-ink"
        >
          {long && !open ? `${message.message.slice(0, PREVIEW_CHARS).trimEnd()}…` : message.message}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-small">
          {long ? (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={`message-${message.id}`}
              onClick={() => setOpen((v) => !v)}
              className="text-ink underline decoration-ink/40 underline-offset-4 hover:decoration-ink"
            >
              {open ? "Show less" : "Read the whole message"}
            </button>
          ) : null}
          <a
            href={`mailto:${message.lead.email}?subject=${subject}`}
            className="text-ink underline decoration-gold-deep decoration-2 underline-offset-4"
          >
            Reply by email
          </a>
        </div>
      </div>
    </li>
  );
}
