"use client";

import { useState } from "react";
import type { AdminContactSubmission, AdminLeadListItem, LeadStatus, Page } from "@/lib/admin/api";
import {
  attribution,
  formatDateTime,
  formatWhen,
  leadStatusLabel,
  leadStatusTone,
} from "@/lib/admin/format";
import { useAdminData } from "./AdminSession";
import { Workspace } from "./AdminShell";
import { useAdminList, useDebounced } from "./useAdminList";
import {
  EmptyState,
  ErrorNotice,
  Facts,
  FilterTabs,
  ListFooter,
  LoadingRows,
  PageHeader,
  SearchField,
  StatusMark,
} from "./ui";

type Filter = "ALL" | LeadStatus;

const FILTERS: readonly { value: Filter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "NEW", label: leadStatusLabel.NEW },
  { value: "CONTACTED", label: leadStatusLabel.CONTACTED },
  { value: "QUALIFIED", label: leadStatusLabel.QUALIFIED },
  { value: "CONVERTED", label: leadStatusLabel.CONVERTED },
  { value: "LOST", label: leadStatusLabel.LOST },
  { value: "ARCHIVED", label: leadStatusLabel.ARCHIVED },
];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Every person the site has heard from, once each -- a contact message and an
 * application from the same email are the same lead.
 */
export function LeadsList() {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [search, setSearch] = useState("");
  const settled = useDebounced(search.trim());
  const list = useAdminList<AdminLeadListItem>("/leads", {
    status: filter === "ALL" ? undefined : filter,
    search: settled.length >= 2 ? settled : undefined,
  });

  return (
    <Workspace>
      <PageHeader
        title="Leads"
        lead="Everyone who has applied or written in, one entry per email address."
        aside={
          <SearchField
            label="Search leads"
            placeholder="Search names, emails or companies"
            value={search}
            onChange={setSearch}
          />
        }
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
          <EmptyState title={settled.length >= 2 ? `No one matches "${settled}".` : "No leads here."}>
            {settled.length >= 2
              ? "Search looks at names, email addresses and companies."
              : "Leads appear when someone applies or sends a message."}
          </EmptyState>
        ) : (
          <>
            <ul className="divide-y divide-taupe/40 border-y border-taupe/40">
              {list.items.map((lead) => (
                <LeadRow key={lead.id} lead={lead} />
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

function LeadRow({ lead }: { lead: AdminLeadListItem }) {
  const [open, setOpen] = useState(false);
  const panelId = `lead-${lead.id}`;

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="group -mx-3 grid w-[calc(100%+1.5rem)] grid-cols-12 items-center gap-x-6 gap-y-2 rounded-xl px-3 py-5 text-left transition-colors hover:bg-ink/[0.05]"
      >
        <span className="col-span-9 min-w-0 lg:col-span-4">
          <span className="block truncate font-display text-heading text-ink">{lead.fullName}</span>
          <span className="mt-1 block truncate text-small text-ink/70">{lead.email}</span>
        </span>
        <span className="col-span-3 flex justify-end lg:order-last lg:col-span-2">
          <StatusMark tone={leadStatusTone[lead.status]}>{leadStatusLabel[lead.status]}</StatusMark>
        </span>
        <span className="col-span-12 truncate text-small text-ink lg:col-span-3">
          {plural(lead.applicationCount, "application", "applications")},{" "}
          {plural(lead.contactSubmissionCount, "message", "messages")}
        </span>
        <span className="col-span-8 truncate text-small text-ink/70 lg:col-span-2">
          {lead.companyName ?? attribution(lead.source, lead.campaign) ?? "—"}
        </span>
        <time
          dateTime={lead.createdAt}
          title={formatDateTime(lead.createdAt)}
          className="col-span-4 text-right font-mono text-eyebrow text-ink/70 lg:col-span-1 lg:text-left"
        >
          {formatWhen(lead.createdAt)}
        </time>
      </button>

      {open ? (
        <div id={panelId} className="grid grid-cols-1 gap-x-12 gap-y-8 pb-8 pt-2 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Facts
              items={[
                {
                  label: "Email",
                  value: (
                    <a href={`mailto:${lead.email}`} className="underline decoration-ink/40 underline-offset-4 hover:decoration-ink">
                      {lead.email}
                    </a>
                  ),
                },
                { label: "Phone", value: lead.phone },
                { label: "Channel or company", value: lead.companyName },
                { label: "Came from", value: attribution(lead.source, lead.campaign) ?? "Direct" },
                { label: "First page", value: lead.landingPath },
                { label: "On file since", value: formatDateTime(lead.createdAt) },
              ]}
            />
          </div>
          <div className="lg:col-span-7">
            {lead.contactSubmissionCount > 0 ? (
              <LeadMessages leadId={lead.id} />
            ) : (
              <p className="text-small text-ink/70">No contact messages from this person.</p>
            )}
          </div>
        </div>
      ) : null}
    </li>
  );
}

/** Fetched only when a lead is opened. */
function LeadMessages({ leadId }: { leadId: string }) {
  const { data, error, loading, reload } = useAdminData<Page<AdminContactSubmission>>(
    `/contact-submissions?leadId=${leadId}&limit=10`,
  );
  if (error) return <ErrorNotice error={error} onRetry={reload} />;
  if (loading || !data) return <LoadingRows rows={1} />;
  return (
    <ul className="space-y-6">
      {data.data.map((m) => (
        <li key={m.id} className="border-l-2 border-gold-deep/60 pl-5">
          <p className="max-w-[64ch] whitespace-pre-line text-body text-ink">{m.message}</p>
          <p className="mt-2 font-mono text-eyebrow text-ink/70">{formatWhen(m.createdAt)}</p>
        </li>
      ))}
    </ul>
  );
}
