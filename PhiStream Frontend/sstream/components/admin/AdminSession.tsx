"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ApiError } from "@/lib/api";
import { adminGet } from "@/lib/admin/api";
import { getSupabase } from "@/lib/admin/supabase";

/**
 * Who is at the desk. Signing in with Supabase only proves identity; the
 * backend's staff list decides access. So a session counts as "in" only after
 * one admin call succeeds -- a person who can sign in but is not staff (or has
 * been deactivated) is signed straight back out with a plain explanation.
 */

/**
 * "unreachable": signed in, but the staff check could not be made (server
 * down, restarting, offline). The session is KEPT -- only the backend saying
 * no (401/403) ends it.
 */
type Status = "loading" | "unconfigured" | "signed-out" | "signed-in" | "unreachable";

type SessionValue = {
  status: Status;
  email: string | null;
  /** Why the last sign-in or session check failed, in the reader's words. */
  problem: string | null;
  signIn(email: string, password: string): Promise<void>;
  signOut(reason?: string): Promise<void>;
  /** Re-run the staff check after "unreachable". */
  retry(): Promise<void>;
  /** A current access token (refreshed by Supabase as needed). */
  token(): Promise<string>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function useAdminSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useAdminSession outside AdminSessionProvider");
  return value;
}

/** The backend refused this person, as opposed to not answering at all. */
function isRefusal(error: unknown) {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

/** Turns a failed staff check into a sentence that says what to do. */
function explain(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return "This account can sign in but isn't on the staff list. Ask an admin to add it.";
    }
    if (error.status === 401) return "Your session ended. Sign in again.";
    if (error.status === 503) {
      return "Staff sign-in isn't switched on in the backend yet (SUPABASE_URL is not set).";
    }
    if (error.code === "NETWORK_ERROR") return error.message;
  }
  return "Couldn't reach the studio's server. Try again in a moment.";
}

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabase();
  const [status, setStatus] = useState<Status>(supabase ? "loading" : "unconfigured");
  const [email, setEmail] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const token = useCallback(async () => {
    const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
    if (!data.session) throw new ApiError(401, "UNAUTHORIZED", "Not signed in.");
    return data.session.access_token;
  }, [supabase]);

  const signOut = useCallback(
    async (reason?: string) => {
      await supabase?.auth.signOut();
      setEmail(null);
      setProblem(reason ?? null);
      setStatus("signed-out");
    },
    [supabase],
  );

  /** One cheap staff-only call: proves the token AND the staff membership. */
  const confirmStaff = useCallback(
    async (accessToken: string, who: string | null) => {
      try {
        await adminGet("/leads?limit=1", accessToken);
        setEmail(who);
        setProblem(null);
        setStatus("signed-in");
      } catch (error) {
        if (isRefusal(error)) {
          await signOut(explain(error));
          return;
        }
        setEmail(who);
        setProblem(explain(error));
        setStatus("unreachable");
      }
    },
    [signOut],
  );

  const retry = useCallback(async () => {
    if (!supabase) return;
    setStatus("loading");
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      await confirmStaff(data.session.access_token, data.session.user.email ?? null);
    } else {
      setStatus("signed-out");
    }
  }, [supabase, confirmStaff]);

  // Resume a session saved in this browser.
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) {
        void confirmStaff(data.session.access_token, data.session.user.email ?? null);
      } else {
        setStatus("signed-out");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, confirmStaff]);

  const signIn = useCallback(
    async (address: string, password: string) => {
      if (!supabase) return;
      setProblem(null);
      const { data, error } = await supabase.auth.signInWithPassword({
        email: address,
        password,
      });
      if (error || !data.session) {
        setProblem(
          error?.status === 400
            ? "That email and password don't match a staff account."
            : "Sign-in didn't go through. Try again in a moment.",
        );
        return;
      }
      await confirmStaff(data.session.access_token, data.session.user.email ?? address);
    },
    [supabase, confirmStaff],
  );

  const value = useMemo(
    () => ({ status, email, problem, signIn, signOut, retry, token }),
    [status, email, problem, signIn, signOut, retry, token],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/**
 * Reads one admin endpoint. `path` null skips the call (e.g. while a detail
 * id is unknown). A 401 means the session is gone, so it signs out rather
 * than showing a broken page.
 */
export function useAdminData<B>(path: string | null) {
  const { token, signOut } = useAdminSession();
  const [state, setState] = useState<{
    data: B | null;
    error: unknown;
    loading: boolean;
  }>({ data: null, error: null, loading: path !== null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (path === null) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    (async () => {
      try {
        const data = await adminGet<B>(path, await token());
        if (!cancelled) setState({ data, error: null, loading: false });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          await signOut(explain(error));
          return;
        }
        setState({ data: null, error, loading: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path, nonce, token, signOut]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}
