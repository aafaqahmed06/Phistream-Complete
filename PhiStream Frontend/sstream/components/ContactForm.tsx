"use client";

import { useEffect, useState, type FormEvent } from "react";
import { getAttribution, type Attribution } from "@/lib/analytics";
import { describeError, fieldErrors, submitContact } from "@/lib/api";
import { contactForm as copy } from "@/lib/content";
import {
  FormNotice,
  Honeypot,
  InputField,
  SubmitButton,
  TextareaField,
} from "./ui/Field";

const empty = { name: "", email: "", companyName: "", message: "" };

/**
 * POST /api/v1/contact. The backend answers 202 RECEIVED for every valid
 * submission -- new email, known email, duplicate or screened-out spam alike --
 * so the success state is one generic thank-you and nothing more.
 */
export function ContactForm() {
  const [values, setValues] = useState(empty);
  const [honeypot, setHoneypot] = useState("");
  const [attribution, setAttribution] = useState<Attribution>({});
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // UTM values live in the URL and sessionStorage, so read them after mount.
  useEffect(() => setAttribution(getAttribution()), []);

  const errors = fieldErrors(error);
  const set =
    (key: keyof typeof empty) =>
    (e: { target: { value: string } }) =>
      setValues((v) => ({ ...v, [key]: e.target.value }));

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await submitContact({
        name: values.name,
        email: values.email,
        companyName: values.companyName || undefined,
        message: values.message,
        ...attribution,
        honeypot,
      });
      setSent(true);
      setValues(empty);
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-5">
        <FormNotice tone="success">
          <span className="font-medium">{copy.successTitle}</span>{" "}
          {copy.successBody}
        </FormNotice>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="text-small text-ink underline decoration-ink/40 underline-offset-4 hover:decoration-ink"
        >
          {copy.sendAnother}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="relative space-y-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <InputField
          id="contact-name"
          label="Name"
          required
          maxLength={200}
          autoComplete="name"
          value={values.name}
          onChange={set("name")}
          error={errors.name}
        />
        <InputField
          id="contact-email"
          label="Email"
          type="email"
          required
          maxLength={320}
          autoComplete="email"
          value={values.email}
          onChange={set("email")}
          error={errors.email}
        />
      </div>
      <InputField
        id="contact-company"
        label="Channel or company"
        maxLength={200}
        autoComplete="organization"
        value={values.companyName}
        onChange={set("companyName")}
        error={errors.companyName}
      />
      <TextareaField
        id="contact-message"
        label="What are you building, and what is in the way?"
        required
        maxLength={5000}
        value={values.message}
        onChange={set("message")}
        error={errors.message}
      />
      <Honeypot value={honeypot} onChange={setHoneypot} />

      {error ? <FormNotice tone="error">{describeError(error)}</FormNotice> : null}

      <SubmitButton pending={pending}>{copy.submit}</SubmitButton>
    </form>
  );
}
