"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { FormNotice, InputField, SubmitButton } from "@/components/ui/Field";
import { GlyphWatermark, Wordmark } from "@/components/ui/Wordmark";
import { useAdminSession } from "./AdminSession";

/**
 * The door. Ink, like the site's hero, with the one display line the control
 * room gets -- the rest of the back office is deliberately quieter. The form
 * sits on a cream panel because the shared fields are built for cream.
 */
export function SignIn() {
  const { signIn, problem } = useAdminSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    await signIn(email.trim(), password);
    setPending(false);
  }

  return (
    <main id="main" className="surface-ink grain relative isolate min-h-svh overflow-hidden">
      <GlyphWatermark className="-right-[12vw] top-1/2 -translate-y-1/2 rotate-12 text-[46vw] text-gold opacity-[0.06]" />

      <div className="container-x relative z-10 grid min-h-svh grid-cols-12 items-center gap-x-8 gap-y-14 py-16">
        <div className="col-span-12 lg:col-span-6">
          <Link href="/" className="text-2xl text-cream transition-colors hover:text-gold">
            <Wordmark />
          </Link>
          <div className="rise mt-16" style={{ animationDelay: "0.05s" }}>
            <Eyebrow tone="gold-on-ink">Control room</Eyebrow>
          </div>
          <h1 className="rise mt-6 font-display text-display-xl font-light text-cream" style={{ animationDelay: "0.12s" }}>
            Back of the <span className="highlight-tilt wonk">house.</span>
          </h1>
          <p className="rise mt-8 max-w-[40ch] text-body-l text-cream/80" style={{ animationDelay: "0.24s" }}>
            Applications, messages and leads from the site, in one place. For studio staff only.
          </p>
        </div>

        <div className="col-span-12 lg:col-span-5 lg:col-start-8">
          <form
            onSubmit={onSubmit}
            className="surface-cream space-y-6 rounded-[1.75rem] p-7 shadow-[6px_6px_0_0_var(--color-gold)] sm:p-9"
          >
            <h2 className="font-display text-heading text-ink">Sign in</h2>
            <InputField
              id="admin-email"
              label="Email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <InputField
              id="admin-password"
              label="Password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {problem ? <FormNotice tone="error">{problem}</FormNotice> : null}
            <SubmitButton pending={pending} pendingLabel="Signing in…">
              Sign in
            </SubmitButton>
          </form>
          <p className="mt-6 text-small text-cream/80">
            Not staff?{" "}
            <Link href="/" className="text-cream underline decoration-cream/40 underline-offset-4 hover:decoration-gold hover:text-gold">
              Go to the website
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

/** Shown when the two public Supabase values are missing from the build. */
export function NotConfigured() {
  return (
    <main id="main" className="surface-ink min-h-svh">
      <div className="container-x flex min-h-svh flex-col justify-center py-16">
        <Wordmark className="text-2xl text-cream" />
        <h1 className="mt-14 max-w-[18ch] font-display text-display-m font-light text-cream">
          Staff sign-in isn&apos;t set up on this site yet.
        </h1>
        <p className="mt-6 max-w-[56ch] text-body text-cream/80">
          Add <code className="font-mono text-gold">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="font-mono text-gold">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to the
          site&apos;s environment, then rebuild.
        </p>
      </div>
    </main>
  );
}
