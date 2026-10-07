"use client";

import { useState, type ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { adminPost, type AdminApplicationDetail, type SchedulingAccess } from "@/lib/admin/api";
import { formatDateTime } from "@/lib/admin/format";
import { controlClass } from "@/components/ui/Field";
import { useAdminSession } from "./AdminSession";
import { SectionHeading } from "./ui";

/**
 * The decision desk for one application. Which buttons show is decided by
 * the backend (`availableActions`: its state machine plus the staff role), so
 * the dashboard never offers a step the API would refuse. Accepting or
 * declining emails the applicant, so both ask for a second click.
 */

type Busy = null | "review" | "accept" | "reject" | "schedule" | "note";

const primary =
  "rounded-full bg-ink px-5 py-2.5 text-small font-medium text-cream transition-colors hover:bg-gold hover:text-ink disabled:opacity-70";
const secondary =
  "rounded-full border border-ink/60 px-5 py-2.5 text-small font-medium text-ink transition-colors hover:border-gold-deep hover:bg-gold/10 disabled:opacity-70";

export function ApplicationActions({
  detail,
  onChanged,
}: {
  detail: AdminApplicationDetail;
  onChanged: () => void;
}) {
  const { token, signOut } = useAdminSession();
  const actions = new Set(detail.availableActions);
  const id = encodeURIComponent(detail.application.id);
  const name = detail.lead.fullName;

  const [busy, setBusy] = useState<Busy>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | "accept" | "reject">(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [access, setAccess] = useState<SchedulingAccess | null>(null);
  const [copied, setCopied] = useState(false);

  async function run<B>(kind: Exclude<Busy, null>, path: string, body?: unknown) {
    setBusy(kind);
    setProblem(null);
    try {
      const result = await adminPost<B>(path, await token(), body);
      return result;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await signOut("Your session ended. Sign in again.");
      } else if (error instanceof ApiError && error.status === 409) {
        setProblem("This application has moved on since you opened it. Showing the latest.");
        onChanged();
      } else if (error instanceof ApiError && error.status === 503) {
        setProblem("Booking isn't set up on the server yet, so no link can be made.");
      } else {
        setProblem(error instanceof ApiError ? error.message : "That didn't go through. Try again.");
      }
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function decide(kind: "review" | "accept" | "reject") {
    const body = kind === "reject" && reason.trim() ? { reason: reason.trim() } : undefined;
    const done = await run(kind, `/applications/${id}/${kind}`, body);
    if (done) {
      setConfirm(null);
      setReason("");
      onChanged();
    }
  }

  async function issueLink() {
    const done = await run<{ data: SchedulingAccess }>("schedule", `/applications/${id}/scheduling-access`);
    if (done) {
      setAccess(done.data);
      setCopied(false);
      onChanged();
    }
  }

  async function addNote() {
    const text = note.trim();
    if (!text) return;
    if (await run("note", `/applications/${id}/notes`, { body: text })) {
      setNote("");
      onChanged();
    }
  }

  const decisions = actions.has("review") || actions.has("accept") || actions.has("reject");

  return (
    <section aria-labelledby="decision" className="space-y-8">
      <SectionHeading>
        <span id="decision">Decision</span>
      </SectionHeading>

      {problem ? (
        <p role="alert" className="rounded-2xl border border-alert px-4 py-3 text-small text-alert">
          {problem}
        </p>
      ) : null}

      {decisions ? (
        <div className="space-y-4">
          {actions.has("review") ? (
            <Row hint="Moves it to In review, so others can see someone has it.">
              <button type="button" className={primary} disabled={busy !== null} onClick={() => void decide("review")}>
                {busy === "review" ? "Starting…" : "Start review"}
              </button>
            </Row>
          ) : null}

          {confirm === "accept" ? (
            <Confirm
              text={`${name} gets an email saying they're accepted, and booking a call opens for them.`}
              action={busy === "accept" ? "Accepting…" : "Yes, accept"}
              busy={busy !== null}
              onConfirm={() => void decide("accept")}
              onCancel={() => setConfirm(null)}
            />
          ) : confirm === "reject" ? (
            <div className="space-y-3">
              <label htmlFor="reject-reason" className="block text-small font-medium text-ink">
                Reason <span className="font-normal text-ink/70">(optional, staff only)</span>
              </label>
              <textarea
                id="reject-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className={controlClass}
              />
              <Confirm
                text={`${name} gets an email with the outcome. The reason is never shown to them.`}
                action={busy === "reject" ? "Declining…" : "Yes, decline"}
                busy={busy !== null}
                onConfirm={() => void decide("reject")}
                onCancel={() => setConfirm(null)}
              />
            </div>
          ) : actions.has("accept") || actions.has("reject") ? (
            <div className="flex flex-wrap gap-3">
              {actions.has("accept") ? (
                <button type="button" className={primary} disabled={busy !== null} onClick={() => setConfirm("accept")}>
                  Accept
                </button>
              ) : null}
              {actions.has("reject") ? (
                <button type="button" className={secondary} disabled={busy !== null} onClick={() => setConfirm("reject")}>
                  Decline
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {actions.has("schedule") ? (
        <div className="space-y-3">
          <Row hint="A fresh link replaces any earlier one. It is shown once, so copy it before leaving.">
            <button type="button" className={secondary} disabled={busy !== null} onClick={() => void issueLink()}>
              {busy === "schedule" ? "Creating…" : access ? "Create a new booking link" : "Create booking link"}
            </button>
          </Row>
          {access ? (
            access.link ? (
              <div className="space-y-2 rounded-2xl border border-ink/60 p-4">
                <p className="break-all font-mono text-eyebrow text-ink">{access.link}</p>
                <div className="flex flex-wrap items-center gap-4 text-small">
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(access.link ?? "").then(() => setCopied(true));
                    }}
                    className="text-ink underline decoration-gold-deep decoration-2 underline-offset-4"
                  >
                    {copied ? "Copied" : "Copy link"}
                  </button>
                  <span className="text-ink/70">Works until {formatDateTime(access.expiresAt)}</span>
                </div>
              </div>
            ) : (
              <p className="text-small text-alert">
                The link was made, but the server has no booking page address (SCHEDULING_PAGE_URL), so
                it can&apos;t be shown as a link. Set it, then create a new one.
              </p>
            )
          ) : null}
        </div>
      ) : null}

      {!decisions && !actions.has("schedule") ? (
        <p className="text-small text-ink/70">Nothing to decide at this stage.</p>
      ) : null}

      {actions.has("note") ? (
        <div className="space-y-3">
          <label htmlFor="new-note" className="block text-small font-medium text-ink">
            Add a staff note <span className="font-normal text-ink/70">(never shown to the applicant)</span>
          </label>
          <textarea
            id="new-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={controlClass}
          />
          <button
            type="button"
            className={secondary}
            disabled={busy !== null || !note.trim()}
            onClick={() => void addNote()}
          >
            {busy === "note" ? "Saving…" : "Add note"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function Row({ hint, children }: { hint: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      {children}
      <p className="text-small text-ink/70">{hint}</p>
    </div>
  );
}

function Confirm({
  text,
  action,
  busy,
  onConfirm,
  onCancel,
}: {
  text: string;
  action: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3 rounded-2xl bg-gold/15 p-4">
      <p className="text-small text-ink">{text}</p>
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" className={primary} disabled={busy} onClick={onConfirm}>
          {action}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="text-small text-ink underline decoration-ink/40 underline-offset-4 hover:decoration-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
