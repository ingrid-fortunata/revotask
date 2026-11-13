import type { ButtonHTMLAttributes, Ref } from "react";

export interface BaseButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Forwarded to the button so a dialog can focus it on open (FE-C3). */
  ref?: Ref<HTMLButtonElement>;
  variant?: "primary" | "ghost";
  /** Disables the button and shows a spinner while a request is pending. */
  loading?: boolean;
}

const VARIANT_CLASS = { primary: "btn-primary", ghost: "btn-ghost" } as const;

// min-h-11 and min-w-11 give a 44 by 44 CSS px tappable area (FE-S5, AUTH-AC13.2).
export function BaseButton({
  variant = "primary",
  loading = false,
  disabled,
  className = "",
  children,
  type = "button",
  ...rest
}: BaseButtonProps) {
  return (
    <button
      type={type}
      className={`btn ${VARIANT_CLASS[variant]} min-h-11 min-w-11 ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <span
          className="loading loading-spinner loading-sm"
          aria-hidden="true"
        />
      ) : null}
      {children}
    </button>
  );
}
