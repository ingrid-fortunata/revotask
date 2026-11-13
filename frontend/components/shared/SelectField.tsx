import type { Ref } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps {
  id: string;
  name: string;
  label: string;
  value: string;
  options: readonly SelectOption[];
  error?: string;
  /** Visible help text, linked to the select with aria-describedby. */
  hint?: string;
  disabled?: boolean;
  selectRef?: Ref<HTMLSelectElement>;
  onChange: (value: string) => void;
}

// A labelled native select, wired like FormField: the label, hint and error are linked to the
// control, the error is announced through aria-invalid, and the box is at least 44 px high with
// 16 px text so iOS Safari does not zoom (FE-S5). Used by the card edit and Move dialogs.
export function SelectField({
  id,
  name,
  label,
  value,
  options,
  error,
  hint,
  disabled = false,
  selectRef,
  onChange,
}: SelectFieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex w-full flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        name={name}
        ref={selectRef}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`select select-bordered min-h-11 min-w-11 w-full text-base${error ? " select-error" : ""}`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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
