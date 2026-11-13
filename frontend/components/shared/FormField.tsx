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
  /** Render a textarea instead of an input (the card description). Same label, hint and error. */
  multiline?: boolean;
  /** Visible lines of a multiline field. */
  rows?: number;
  /** Ref for the textarea when `multiline` is set. */
  textareaRef?: Ref<HTMLTextAreaElement>;
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
  multiline = false,
  rows = 4,
  textareaRef,
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
      {multiline ? (
        <textarea
          id={id}
          name={name}
          ref={textareaRef}
          rows={rows}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`textarea textarea-bordered min-h-11 min-w-11 w-full text-base${error ? " textarea-error" : ""}`}
        />
      ) : (
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
      )}
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
