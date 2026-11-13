import type { Ref } from "react";

export interface FormFieldProps {
  id: string;
  name: string;
  label: string;
  type?: "text" | "email" | "password";
  value: string;
  error?: string;
  /** Visible help text, linked to the input with aria-describedby. */
  hint?: string;
  autoComplete?: string;
  inputRef?: Ref<HTMLInputElement>;
  onChange: (value: string) => void;
}

// No minLength or maxLength: those attributes count UTF-16 units and would reject input that
// the API accepts. Length rules live in lib/authRules.ts (C5). text-base keeps the text at 16 px
// so iOS Safari does not zoom, and min-h-11 min-w-11 gives a 44 px tappable area (FE-S5).
export function FormField({
  id,
  name,
  label,
  type = "text",
  value,
  error,
  hint,
  autoComplete,
  inputRef,
  onChange,
}: FormFieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex w-full flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        ref={inputRef}
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`input input-bordered min-h-11 min-w-11 w-full text-base${error ? " input-error" : ""}`}
      />
      {hint ? (
        <p id={hintId} className="break-words text-sm opacity-80">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="break-words text-sm text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
