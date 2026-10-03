"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { getAttribution, track } from "@/lib/analytics";
import {
  ApiError,
  describeError,
  fieldErrors,
  getApplicationForm,
  getApplicationStatus,
  submitApplication,
  type AnswerValue,
  type ApplicationForm as FormDefinition,
  type FormQuestion,
  type PublicApplicationStatus,
  type PublicServiceTier,
} from "@/lib/api";
import { apply as copy } from "@/lib/content";
import {
  FieldShell,
  FormNotice,
  Honeypot,
  InputField,
  SubmitButton,
  TextareaField,
  controlClass,
  describedBy,
} from "./ui/Field";
import { Eyebrow } from "./ui/Eyebrow";

/**
 * The status token is a secret shown once, so it is kept in sessionStorage
 * (this tab only) and never put in a URL -- see the backend's API_SPEC.md.
 */
const RECEIPT_KEY = "phi_application";

type StoredReceipt = {
  id: string;
  reference: string;
  token: string;
  expiresAt: string;
};

function loadReceipt(): StoredReceipt | null {
  try {
    const raw = window.sessionStorage.getItem(RECEIPT_KEY);
    return raw ? (JSON.parse(raw) as StoredReceipt) : null;
  } catch {
    return null;
  }
}

function saveReceipt(receipt: StoredReceipt | null) {
  try {
    if (receipt) {
      window.sessionStorage.setItem(RECEIPT_KEY, JSON.stringify(receipt));
    } else {
      window.sessionStorage.removeItem(RECEIPT_KEY);
    }
  } catch {
    // Private mode: the receipt simply will not survive a reload.
  }
}

/** Raw input state per question, converted to the API's shape on submit. */
type RawAnswer = string | string[];

/**
 * Converts raw input to answers, leaving out the unanswered ones -- the
 * backend treats "" and null as unanswered, but rejects unknown keys, so only
 * keys from the current form version are ever sent.
 */
function toAnswers(
  questions: FormQuestion[],
  raw: Record<string, RawAnswer>,
): Record<string, AnswerValue> {
  const out: Record<string, AnswerValue> = {};
  for (const q of questions) {
    const value = raw[q.key];
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length) out[q.key] = value;
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (q.type === "number") out[q.key] = Number(trimmed);
    else if (q.type === "boolean") out[q.key] = trimmed === "true";
    else out[q.key] = trimmed;
  }
  return out;
}

const emptyContact = { name: "", email: "", phone: "", companyName: "" };

export function ApplicationForm({
  initialForm,
  tiers,
}: {
  initialForm: FormDefinition;
  tiers: PublicServiceTier[];
}) {
  const [form, setForm] = useState(initialForm);
  const [contact, setContact] = useState(emptyContact);
  const [tierSlug, setTierSlug] = useState("");
  const [answers, setAnswers] = useState<Record<string, RawAnswer>>({});
  const [honeypot, setHoneypot] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<StoredReceipt | null>(null);
  const started = useRef(false);

  // Restore an application submitted earlier in this tab.
  useEffect(() => setReceipt(loadReceipt()), []);

  const errors = fieldErrors(error);

  function onFirstInteraction() {
    if (started.current) return;
    started.current = true;
    track("application_start");
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const result = await submitApplication({
        formVersion: form.version,
        serviceTierSlug: tierSlug || undefined,
        name: contact.name,
        email: contact.email,
        phone: contact.phone || undefined,
        companyName: contact.companyName || undefined,
        ...getAttribution(),
        answers: toAnswers(form.questions, answers),
        honeypot,
      });
      const stored = {
        id: result.application.id,
        reference: result.application.reference,
        token: result.statusAccess.token,
        expiresAt: result.statusAccess.expiresAt,
      };
      saveReceipt(stored);
      setReceipt(stored);
      track("application_submit");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      if (err instanceof ApiError && err.code === "FORM_VERSION_OUTDATED") {
        // Reload the questions, keep the contact details, drop old answers.
        const fresh = await getApplicationForm();
        if (fresh) {
          setForm(fresh);
          setAnswers({});
          setNotice(copy.outdated);
          return;
        }
      }
      if (err instanceof ApiError && err.code === "DUPLICATE_SUBMISSION") {
        setNotice(copy.duplicate);
        return;
      }
      setError(err);
    } finally {
      setPending(false);
    }
  }

  if (receipt) {
    return (
      <Receipt
        receipt={receipt}
        onStartOver={() => {
          saveReceipt(null);
          setReceipt(null);
          setContact(emptyContact);
          setAnswers({});
          setTierSlug("");
          started.current = false;
        }}
      />
    );
  }

  const setField =
    (key: keyof typeof emptyContact) =>
    (e: { target: { value: string } }) =>
      setContact((v) => ({ ...v, [key]: e.target.value }));

  return (
    <form
      onSubmit={onSubmit}
      onFocusCapture={onFirstInteraction}
      className="relative space-y-10"
    >
      <fieldset className="space-y-6">
        <legend className="font-display text-heading text-ink">
          About you
        </legend>
        <div className="grid gap-6 sm:grid-cols-2">
          <InputField
            id="apply-name"
            label="Name"
            required
            maxLength={200}
            autoComplete="name"
            value={contact.name}
            onChange={setField("name")}
            error={errors.name}
          />
          <InputField
            id="apply-email"
            label="Email"
            type="email"
            required
            maxLength={320}
            autoComplete="email"
            value={contact.email}
            onChange={setField("email")}
            error={errors.email}
          />
          <InputField
            id="apply-phone"
            label="Phone"
            type="tel"
            maxLength={50}
            autoComplete="tel"
            value={contact.phone}
            onChange={setField("phone")}
            error={errors.phone}
          />
          <InputField
            id="apply-company"
            label="Channel or company"
            maxLength={200}
            autoComplete="organization"
            value={contact.companyName}
            onChange={setField("companyName")}
            error={errors.companyName}
          />
        </div>

        {tiers.length ? (
          <FieldShell
            id="apply-tier"
            label={copy.tierLabel}
            error={errors.serviceTierSlug}
          >
            <select
              id="apply-tier"
              value={tierSlug}
              onChange={(e) => setTierSlug(e.target.value)}
              aria-invalid={errors.serviceTierSlug ? true : undefined}
              aria-describedby={describedBy("apply-tier", null, errors.serviceTierSlug)}
              className={controlClass}
            >
              <option value="">{copy.tierNone}</option>
              {tiers.map((tier) => (
                <option key={tier.slug} value={tier.slug}>
                  {tier.name}
                </option>
              ))}
            </select>
          </FieldShell>
        ) : null}
      </fieldset>

      <fieldset className="space-y-6">
        <legend className="font-display text-heading text-ink">
          {form.title}
        </legend>
        {form.description ? (
          <p className="text-body text-ink/70">{form.description}</p>
        ) : null}
        {form.questions.map((q) => (
          <Question
            key={`${form.version}:${q.key}`}
            question={q}
            value={answers[q.key]}
            error={errors[`answers.${q.key}`]}
            onChange={(v) => setAnswers((a) => ({ ...a, [q.key]: v }))}
          />
        ))}
      </fieldset>

      <Honeypot value={honeypot} onChange={setHoneypot} />

      {notice ? <FormNotice tone="success">{notice}</FormNotice> : null}
      {error ? <FormNotice tone="error">{describeError(error)}</FormNotice> : null}

      <SubmitButton pending={pending} pendingLabel="Submitting…">
        {copy.submit}
      </SubmitButton>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* One question, rendered by type                                             */
/* -------------------------------------------------------------------------- */

function Question({
  question: q,
  value,
  error,
  onChange,
}: {
  question: FormQuestion;
  value: RawAnswer | undefined;
  error?: string;
  onChange: (value: RawAnswer) => void;
}) {
  const id = `q-${q.key}`;
  const text = typeof value === "string" ? value : "";
  const common = {
    id,
    label: q.label,
    hint: q.description ?? undefined,
    required: q.required,
    error,
  };

  switch (q.type) {
    case "text":
      return q.multiline ? (
        <TextareaField
          {...common}
          maxLength={q.maxLength}
          value={text}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <InputField
          {...common}
          maxLength={q.maxLength}
          value={text}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "number":
      return (
        <InputField
          {...common}
          type="number"
          inputMode={q.integer ? "numeric" : "decimal"}
          step={q.integer ? 1 : "any"}
          min={q.min}
          max={q.max}
          value={text}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "url":
      return (
        <InputField
          {...common}
          type="url"
          placeholder="https://"
          value={text}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "single_choice":
    case "boolean": {
      const options =
        q.type === "boolean"
          ? [
              { value: "true", label: "Yes" },
              { value: "false", label: "No" },
            ]
          : q.options;
      return (
        <ChoiceGroup
          {...common}
          type="radio"
          options={options}
          selected={text ? [text] : []}
          onToggle={(v) => onChange(v)}
        />
      );
    }

    case "multiple_choice": {
      const selected = Array.isArray(value) ? value : [];
      return (
        <ChoiceGroup
          {...common}
          type="checkbox"
          options={q.options}
          selected={selected}
          onToggle={(v) =>
            onChange(
              selected.includes(v)
                ? selected.filter((s) => s !== v)
                : [...selected, v],
            )
          }
        />
      );
    }
  }
}

function ChoiceGroup({
  id,
  label,
  hint,
  required,
  error,
  type,
  options,
  selected,
  onToggle,
}: {
  id: string;
  label: string;
  hint?: string;
  required: boolean;
  error?: string;
  type: "radio" | "checkbox";
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <fieldset aria-describedby={describedBy(id, hint, error)}>
      <legend className="text-small font-medium text-ink">
        {label}
        {required ? null : (
          <span className="ml-2 font-normal text-ink/70">(optional)</span>
        )}
      </legend>
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-small text-ink/70">
          {hint}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-3">
        {options.map((option) => {
          const checked = selected.includes(option.value);
          return (
            <label
              key={option.value}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-small transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-gold ${
                checked
                  ? "border-ink bg-ink text-cream"
                  : "border-ink/60 text-ink hover:bg-gold/10"
              }`}
            >
              <input
                type={type}
                name={id}
                value={option.value}
                checked={checked}
                required={type === "radio" && required}
                onChange={() => onToggle(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          );
        })}
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-2 text-small text-alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/* -------------------------------------------------------------------------- */
/* After submission                                                           */
/* -------------------------------------------------------------------------- */

function Receipt({
  receipt,
  onStartOver,
}: {
  receipt: StoredReceipt;
  onStartOver: () => void;
}) {
  const [status, setStatus] = useState<PublicApplicationStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function check() {
    setChecking(true);
    setError(null);
    try {
      const result = await getApplicationStatus(receipt.id, receipt.token);
      setStatus(result.status);
    } catch (err) {
      setError(err);
    } finally {
      setChecking(false);
    }
  }

  const expired =
    error instanceof ApiError && (error.status === 404 || error.status === 401);

  return (
    <div className="space-y-8">
      <Eyebrow tone="on-cream">{copy.received.eyebrow}</Eyebrow>
      <h2 className="font-display text-display-m text-ink">
        {copy.received.heading}
      </h2>
      <p className="max-w-[52ch] text-body text-ink/70">{copy.received.body}</p>

      <dl className="rounded-2xl border border-ink/60 px-5 py-4">
        <dt className="font-mono text-eyebrow uppercase text-ink/70">
          {copy.received.referenceLabel}
        </dt>
        <dd className="mt-1 font-mono text-heading text-ink">
          {receipt.reference}
        </dd>
        {status ? (
          <>
            <dt className="mt-4 font-mono text-eyebrow uppercase text-ink/70">
              Status
            </dt>
            <dd className="mt-1 text-body text-ink">{copy.status[status]}</dd>
          </>
        ) : null}
      </dl>

      {error ? (
        <FormNotice tone="error">
          {expired
            ? "This status link has expired. We will still email you with the outcome."
            : describeError(error)}
        </FormNotice>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
        <button
          type="button"
          onClick={check}
          disabled={checking}
          className="inline-flex items-center justify-center rounded-full border border-ink/60 px-6 py-3 text-small font-medium text-ink transition-colors hover:border-gold-deep hover:bg-gold/10 disabled:opacity-70"
        >
          {checking ? "Checking…" : copy.received.checkStatus}
        </button>
        <button
          type="button"
          onClick={onStartOver}
          className="text-small text-ink underline decoration-ink/40 underline-offset-4 hover:decoration-ink"
        >
          {copy.received.startOver}
        </button>
      </div>
    </div>
  );
}
