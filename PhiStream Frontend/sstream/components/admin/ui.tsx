"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ApiError } from "@/lib/api";
import type { StatusTone } from "@/lib/admin/format";
import { Eyebrow } from "@/components/ui/Eyebrow";

/*
 * Building blocks for the control room's CREAM workspace. Same contrast rules
 * as the site: on cream, muted text is ink/70 (5.47:1), the accent is
 * gold-deep, and gold only ever appears as a FILL carrying ink text (6.15:1).
 */

const toneClass: Record<StatusTone, string> = {
  attention: "bg-gold text-ink",
  active: "bg-ink text-cream",
  settled: "border border-ink/60 text-ink/70",
};

/** Status as a flat chip -- the site's sticker, minus the tilt, so a column of them reads cleanly. */
export function StatusMark({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-3 py-1 font-mono text-eyebrow uppercase ${toneClass[tone]}`}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  lead,
  aside,
}: {
  title: ReactNode;
  lead?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
      <div className="max-w-[46ch]">
        <h1 className="font-display text-display-m font-light text-ink">{title}</h1>
        {lead ? <p className="mt-4 text-body text-ink/70">{lead}</p> : null}
      </div>
      {aside}
    </header>
  );
}

/** A list section's own heading, with an optional link to see everything. */
export function SectionHeading({
  children,
  href,
  linkLabel,
}: {
  children: ReactNode;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-ink/60 pb-3">
      <h2 className="font-display text-heading text-ink">{children}</h2>
      {href ? (
        <Link
          href={href}
          className="text-small text-ink underline decoration-ink/40 underline-offset-4 transition-colors hover:decoration-ink"
        >
          {linkLabel}
        </Link>
      ) : null}
    </div>
  );
}

/** Empty is an instruction, not a mood: say what fills this list. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="border-y border-taupe/40 py-14">
      <p className="font-display text-heading text-ink">{title}</p>
      {children ? <p className="mt-2 max-w-[52ch] text-small text-ink/70">{children}</p> : null}
    </div>
  );
}

export function ErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message =
    error instanceof ApiError
      ? error.status === 403
        ? "Your role can't see this. Ask an admin if you need it."
        : error.status === 404
          ? "This record doesn't exist any more. It may have been erased."
          : error.message
      : "Something went wrong loading this.";
  return (
    <div role="alert" className="rounded-2xl border border-alert px-5 py-4 text-small text-alert">
      {message}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="ml-3 underline decoration-alert/50 underline-offset-4 hover:decoration-alert"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

/** Row-shaped placeholders, so the page doesn't jump when data lands. */
export function LoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="divide-y divide-taupe/40 border-y border-taupe/40">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-6 py-6">
          <span className="h-5 w-48 animate-pulse rounded-full bg-ink/10" />
          <span className="h-3 w-32 animate-pulse rounded-full bg-ink/10" />
          <span className="ml-auto h-6 w-24 animate-pulse rounded-full bg-ink/10" />
        </div>
      ))}
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
}) {
  return (
    <label className="block w-full max-w-sm">
      <span className="sr-only">{label}</span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-full border border-ink/60 bg-transparent px-5 py-2.5 text-small text-ink transition-colors placeholder:text-ink/70 focus:border-ink focus:outline-none"
      />
    </label>
  );
}

/** Filter tabs as a row of pills; the current one is the ink fill. */
export function FilterTabs<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`rounded-full px-4 py-2 text-small transition-colors ${
              active
                ? "bg-ink text-cream"
                : "border border-ink/60 text-ink hover:bg-gold/10"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** "Showing 20 of 54" plus a button for the next page. */
export function ListFooter({
  shown,
  total,
  onMore,
  loading,
}: {
  shown: number;
  total: number;
  onMore: () => void;
  loading: boolean;
}) {
  if (total === 0) return null;
  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
      <Eyebrow tone="on-cream">
        Showing {shown} of {total}
      </Eyebrow>
      {shown < total ? (
        <button
          type="button"
          onClick={onMore}
          disabled={loading}
          className="rounded-full border border-ink/60 px-5 py-2.5 text-small font-medium text-ink transition-colors hover:border-gold-deep hover:bg-gold/10 disabled:opacity-70"
        >
          {loading ? "Loading…" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}

/** Label/value pairs for the side rails of detail views. */
export function Facts({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-taupe/40">
      {items.map((item) => (
        <div key={item.label} className="grid grid-cols-[8.5rem_1fr] gap-4 py-3 text-small">
          <dt className="text-ink/70">{item.label}</dt>
          <dd className="min-w-0 break-words text-ink">{item.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
