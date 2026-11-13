export interface CheckboxFieldProps {
  id: string;
  name: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  /** Visible help text, linked to the checkbox with aria-describedby. */
  hint?: string;
  error?: string;
  onChange: (checked: boolean) => void;
}

// A labelled checkbox with a 44 px tappable box (FE-S5). daisyUI sizes a checkbox through --size,
// so the custom property makes the control itself 2.75 rem, not only its label. The hint says why
// a disabled box is disabled, so the reason is text and not only a grey control (FE-S3).
export function CheckboxField({ id, name, label, checked, disabled = false, hint, error, onChange }: CheckboxFieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-h-11 items-center gap-3">
        <input
          id={id}
          name={name}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="checkbox checkbox-primary [--size:2.75rem]"
        />
        <label htmlFor={id} className="min-w-0 break-words text-base">
          {label}
        </label>
      </div>
      {hint ? (
        <p id={hintId} className="break-words text-sm text-base-content/70">
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
