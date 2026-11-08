"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";

/**
 * Re-runs the current page's server work (router.refresh), for pages that load
 * data from the backend and can be caught mid-outage. Terra, like every primary
 * action on a light surface.
 */
export function RetryButton({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
      className="inline-flex items-center justify-center rounded-full bg-terra px-6 py-3 text-small font-medium text-ink transition-[background-color,transform] duration-200 ease-expo-out hover:bg-ink hover:text-cream active:translate-y-px disabled:pointer-events-none disabled:opacity-70"
    >
      {pending ? "Trying again…" : children}
    </button>
  );
}
