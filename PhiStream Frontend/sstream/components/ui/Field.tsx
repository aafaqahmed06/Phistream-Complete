import type {
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";

/**
 * Form controls for CREAM surfaces only.
 *
 * The control border is ink at 60% (4.04:1 on cream) because a field boundary
 * is a UI component and needs 3:1; at /25 it would compute to 1.65:1. Errors
 * use the alert token (6.8:1 on cream) and are tied to the control through
 * aria-describedby, so a screen reader hears them on focus.
 */
export const controlClass =
  "w-full rounded-[2px] border border-ink/60 bg-transparent px-4 py-3.5 text-body text-ink transition-[border-color,box-shadow] duration-300 placeholder:text-ink/70 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink aria-[invalid=true]:border-alert aria-[invalid=true]:ring-alert";

type FieldShellProps = {
  id: string;
  label: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
};

export function FieldShell({
  id,
  label,
  required,
  hint,
  error,
  children,
}: FieldShellProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-small font-medium text-ink">
        {label}
        {required ? null : (
          <span className="ml-2 font-normal text-ink/70">(optional)</span>
        )}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-small text-ink/70">
          {hint}
        </p>
      ) : null}
      <div className="mt-2">{children}</div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-2 text-small text-alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function describedBy(id: string, hint?: unknown, error?: unknown) {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null];
  return ids.filter(Boolean).join(" ") || undefined;
}

type InputFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
};

export function InputField({
  id,
  label,
  hint,
  error,
  required,
  className = "",
  ...rest
}: InputFieldProps) {
  return (
    <FieldShell id={id} label={label} required={required} hint={hint} error={error}>
      <input
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={`${controlClass} ${className}`}
        {...rest}
      />
    </FieldShell>
  );
}

type TextareaFieldProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "id"
> & {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
};

export function TextareaField({
  id,
  label,
  hint,
  error,
  required,
  className = "",
  ...rest
}: TextareaFieldProps) {
  return (
    <FieldShell id={id} label={label} required={required} hint={hint} error={error}>
      <textarea
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={`${controlClass} min-h-36 resize-y ${className}`}
        {...rest}
      />
    </FieldShell>
  );
}

/**
 * The anti-spam trap. Visually hidden and out of the tab order, so only bots
 * fill it; the backend silently screens out anything that arrives with it set.
 */
export function Honeypot({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label>
        Leave this field empty
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </div>
  );
}

/** Submit button matching Button's gold variant, as a real <button>. */
export function SubmitButton({
  children,
  pending,
  pendingLabel = "Sending…",
}: {
  children: ReactNode;
  pending: boolean;
  pendingLabel?: string;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="group relative isolate inline-flex items-center justify-center gap-2.5 overflow-hidden rounded-[2px] bg-gold px-6 py-3.5 text-small font-medium tracking-[0.005em] text-ink ring-1 ring-gold transition-[color] duration-500 ease-expo-out before:absolute before:inset-0 before:-z-10 before:translate-y-full before:bg-ink before:transition-transform before:duration-500 before:ease-expo-out hover:text-cream hover:before:translate-y-0 disabled:pointer-events-none disabled:opacity-70"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

/** Form-level message: success or failure, announced politely. */
export function FormNotice({
  tone,
  children,
}: {
  tone: "success" | "error";
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-[2px] border px-5 py-4 text-small ${
        tone === "error"
          ? "border-alert text-alert"
          : "border-gold-deep bg-gold/15 text-ink"
      }`}
    >
      {children}
    </div>
  );
}
