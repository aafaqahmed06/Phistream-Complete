"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, getSchedulingSession } from "@/lib/api";
import { track } from "@/lib/analytics";
import { schedule as copy } from "@/lib/content";
import { Button } from "./ui/Button";

/**
 * Turns the token from an acceptance email (/schedule#token=…) into the
 * applicant's booking page.
 *
 * The token lives in the URL fragment so it never reaches a server log. It is
 * moved into sessionStorage and wiped from the address bar straight away, so
 * it is not left in history or shared by copying the URL, and a reload still
 * works.
 */
const STORAGE_KEY = "phi_schedule_token";

type State =
  | { kind: "checking" }
  | { kind: "ready"; url: string; expiresAt: string }
  | { kind: "missing" | "expired" | "unavailable" }
  | { kind: "failed"; message: string };

function takeToken(): string | null {
  let store: Storage | null = null;
  try {
    store = window.sessionStorage;
  } catch {
    // Storage blocked: the fragment still works for this page view.
  }
  const fromHash = new URLSearchParams(window.location.hash.slice(1)).get("token");
  if (fromHash) {
    store?.setItem(STORAGE_KEY, fromHash);
    window.history.replaceState(null, "", window.location.pathname);
    return fromHash;
  }
  return store?.getItem(STORAGE_KEY) ?? null;
}

const expiry = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

export function BookingAccess() {
  const [state, setState] = useState<State>({ kind: "checking" });

  const check = useCallback(async () => {
    const token = takeToken();
    if (!token) {
      setState({ kind: "missing" });
      return;
    }
    setState({ kind: "checking" });
    try {
      const session = await getSchedulingSession(token);
      setState({ kind: "ready", url: session.schedulingUrl, expiresAt: session.expiresAt });
      track("scheduling_opened");
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 401)) {
        setState({ kind: "expired" });
      } else if (error instanceof ApiError && error.status === 503) {
        setState({ kind: "unavailable" });
      } else {
        setState({
          kind: "failed",
          message: error instanceof ApiError ? error.message : copy.failed,
        });
      }
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  if (state.kind === "checking") {
    return (
      <p aria-live="polite" className="text-body text-ink/70">
        {copy.checking}
      </p>
    );
  }

  if (state.kind === "ready") {
    return (
      <div className="space-y-6" aria-live="polite">
        <h2 className="font-display text-display-m text-ink">{copy.ready.title}</h2>
        <p className="max-w-[48ch] text-body text-ink/70">{copy.ready.body}</p>
        <Button href={state.url} arrow>
          {copy.ready.button}
        </Button>
        <p className="text-small text-ink/70">
          {copy.ready.expires} {expiry.format(new Date(state.expiresAt))}.
        </p>
      </div>
    );
  }

  const notice =
    state.kind === "failed"
      ? { title: copy.failed, body: state.message }
      : copy[state.kind];

  return (
    <div className="space-y-6" role={state.kind === "failed" ? "alert" : undefined}>
      <h2 className="font-display text-display-m text-ink">{notice.title}</h2>
      <p className="max-w-[48ch] text-body text-ink/70">{notice.body}</p>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <Button href={copy.contact.href} arrow>
          {copy.contact.label}
        </Button>
        {state.kind === "failed" ? (
          <button
            type="button"
            onClick={() => void check()}
            className="text-small text-ink underline decoration-ink/40 underline-offset-4 hover:decoration-ink"
          >
            {copy.retry}
          </button>
        ) : null}
      </div>
    </div>
  );
}
