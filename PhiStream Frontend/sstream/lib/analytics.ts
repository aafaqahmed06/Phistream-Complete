"use client";

import { API_BASE_URL } from "./api";

/**
 * Anonymous funnel events and UTM attribution, browser only.
 *
 * The session id is a random per-tab value in sessionStorage -- never derived
 * from the person or the device -- and UTM values are kept for the visit so a
 * campaign that lands on the homepage is still credited when the visitor
 * applies from /apply. See the backend's docs/analytics.md.
 */

export type FunnelEvent =
  | "onboarding_view"
  | "vsl_start"
  | "vsl_25"
  | "vsl_50"
  | "vsl_75"
  | "vsl_complete"
  | "application_start"
  | "application_submit"
  | "scheduling_opened";

/** The backend's rule for source/campaign; anything else would 400 the form. */
const ATTRIBUTION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _.+-]{0,99}$/;

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function sessionId(): string {
  const store = storage();
  const existing = store?.getItem("phi_sid");
  if (existing) return existing;
  const id = crypto.randomUUID();
  store?.setItem("phi_sid", id);
  return id;
}

export type Attribution = { source?: string; campaign?: string };

/** UTM source/campaign from this URL, else from earlier in the visit. */
export function getAttribution(): Attribution {
  const store = storage();
  const params = new URLSearchParams(window.location.search);
  const out: Attribution = {};

  for (const [field, param] of [
    ["source", "utm_source"],
    ["campaign", "utm_campaign"],
  ] as const) {
    const fromUrl = params.get(param)?.trim();
    if (fromUrl && ATTRIBUTION_PATTERN.test(fromUrl)) {
      store?.setItem(`phi_${field}`, fromUrl);
      out[field] = fromUrl;
    } else {
      out[field] = store?.getItem(`phi_${field}`) ?? undefined;
    }
  }
  return out;
}

/** Fire-and-forget. A lost event is acceptable; a broken page is not. */
export function track(event: FunnelEvent) {
  try {
    const body = JSON.stringify({
      event,
      anonymousSessionId: sessionId(),
      ...getAttribution(),
      path: window.location.pathname,
      referrer: document.referrer || undefined,
    });
    const url = `${API_BASE_URL}/analytics/events`;
    // text/plain is accepted, so sendBeacon needs no CORS preflight.
    const blob = new Blob([body], { type: "text/plain" });
    if (!navigator.sendBeacon?.(url, blob)) {
      void fetch(url, { method: "POST", body: blob, keepalive: true }).catch(
        () => {},
      );
    }
  } catch {
    // Analytics must never break the page.
  }
}
