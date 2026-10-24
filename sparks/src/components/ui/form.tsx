"use client";

import { createContext, useActionState, useContext, useId } from "react";
import { useFormStatus } from "react-dom";
import type { FormAction, FormState } from "@/server/actions/authorized-action";
import { buttonClass } from "./button";

const FormStateContext = createContext<FormState>({});

/**
 * A <form> bound to a server form action (authorizedFormAction). Shows the action's error or
 * success message, per-field errors, and re-fills inputs with what was submitted after an error.
 */
export function ActionForm({ action, children, className = "" }: { action: FormAction; children: React.ReactNode; className?: string }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className={className} noValidate>
      <FormStateContext.Provider value={state}>
        <FormBanner />
        {/* Re-mount on each submission so defaultValues pick up what was submitted. */}
        <div key={state.attempt ?? 0} className="contents">
          {children}
        </div>
      </FormStateContext.Provider>
    </form>
  );
}

function FormBanner() {
  const state = useContext(FormStateContext);
  if (state.error) {
    return (
      <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
        {state.error}
      </p>
    );
  }
  if (state.ok && state.message) {
    return (
      <p role="status" className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
        {state.message}
      </p>
    );
  }
  return null;
}

function useField(name: string, fallback: string | null | undefined) {
  const state = useContext(FormStateContext);
  // Re-fill with what was submitted only after a failed save; after success the form shows the
  // saved record (edit forms) or starts blank (add forms).
  const refill = !state.ok && state.values !== undefined;
  const submitted = refill && name in state.values! ? state.values![name] : undefined;
  return {
    defaultValue: submitted !== undefined ? String(submitted) : (fallback ?? ""),
    error: state.fieldErrors?.[name],
    submittedAnything: refill,
    submitted,
  };
}

/** A field's starting value (what was submitted after an error, else `fallback`) and its error, for custom inputs. */
export function useFormField(name: string, fallback?: string | null) {
  const f = useField(name, fallback);
  return { defaultValue: f.defaultValue, error: f.error };
}

/** Starting values of a multi-value field (checkbox group): the submitted ones after an error, else `fallback`. */
export function useFormValues(name: string, fallback: string[]): string[] {
  const f = useField(name, null);
  if (!f.submittedAnything) return fallback;
  return f.submitted === undefined ? [] : ([] as string[]).concat(f.submitted as string | string[]);
}

/** Error message for a field, e.g. to show under a custom input group. */
export function FieldError({ name }: { name: string }) {
  const { error } = useField(name, null);
  return error ? <p className="mt-1 text-xs font-medium text-red-700">{error}</p> : null;
}

interface FieldShellProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

function FieldShell({ id, label, error, hint, required, className = "", children }: FieldShellProps) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
        {required && <span className="text-red-700"> *</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs font-medium text-red-700">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const inputClass = (error?: string) =>
  `w-full rounded-md border bg-white px-3 py-2 text-sm ${error ? "border-red-400" : "border-gray-300"}`;

export function TextField({
  name,
  label,
  defaultValue,
  required,
  hint,
  className,
  ...input
}: { name: string; label: string; defaultValue?: string | null; required?: boolean; hint?: string; className?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "defaultValue">) {
  const id = useId();
  const f = useField(name, defaultValue);
  return (
    <FieldShell id={id} label={label} error={f.error} hint={hint} required={required} className={className}>
      <input
        id={id}
        name={name}
        defaultValue={f.defaultValue}
        aria-invalid={f.error ? true : undefined}
        aria-describedby={f.error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={inputClass(f.error)}
        {...input}
      />
    </FieldShell>
  );
}

export function TextAreaField({ name, label, defaultValue, hint, className, rows = 3 }: { name: string; label: string; defaultValue?: string | null; hint?: string; className?: string; rows?: number }) {
  const id = useId();
  const f = useField(name, defaultValue);
  return (
    <FieldShell id={id} label={label} error={f.error} hint={hint} className={className}>
      <textarea id={id} name={name} rows={rows} defaultValue={f.defaultValue} aria-invalid={f.error ? true : undefined} className={inputClass(f.error)} />
    </FieldShell>
  );
}

export function SelectField({
  name,
  label,
  options,
  defaultValue,
  required,
  hint,
  className,
  blankLabel = "—",
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  defaultValue?: string | null;
  required?: boolean;
  hint?: string;
  className?: string;
  /** Label for the empty choice; pass null to hide it. */
  blankLabel?: string | null;
}) {
  const id = useId();
  const f = useField(name, defaultValue);
  return (
    <FieldShell id={id} label={label} error={f.error} hint={hint} required={required} className={className}>
      <select id={id} name={name} defaultValue={f.defaultValue} aria-invalid={f.error ? true : undefined} className={inputClass(f.error)}>
        {blankLabel !== null && <option value="">{blankLabel}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function CheckboxField({ name, label, defaultChecked, hint, className = "" }: { name: string; label: string; defaultChecked?: boolean; hint?: string; className?: string }) {
  const id = useId();
  const f = useField(name, null);
  const checked = f.submittedAnything ? f.submitted !== undefined : Boolean(defaultChecked);
  return (
    <div className={className}>
      <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium">
        <input id={id} type="checkbox" name={name} defaultChecked={checked} className="size-4 accent-brand" />
        {label}
      </label>
      {hint && <p className="ml-6 mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function SubmitButton({ children = "Save", variant = "primary" }: { children?: React.ReactNode; variant?: "primary" | "dark" | "danger" }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass(variant)}>
      {pending ? "Saving…" : children}
    </button>
  );
}

export function FormGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;
}

export function FormActions({ children }: { children: React.ReactNode }) {
  return <div className="mt-6 flex flex-wrap items-center gap-3">{children}</div>;
}
