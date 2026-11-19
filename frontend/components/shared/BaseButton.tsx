import type { ButtonHTMLAttributes, Ref } from "react";
import { Icon, type IconName } from "@/components/shared/Icon";

export interface BaseButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Forwarded to the button so a dialog can focus it on open (FE-C3). */
  ref?: Ref<HTMLButtonElement>;
  variant?: "primary" | "ghost";
  /** Disables the button and shows a spinner while a request is pending. */
  loading?: boolean;
  /** Icon shown before the label. */
  icon?: IconName;
  /** Square icon button. The children become the accessible name and a hover tooltip. */
  iconOnly?: boolean;
}

const VARIANT_CLASS = { primary: "btn-primary", ghost: "btn-ghost" } as const;

// min-h-11 and min-w-11 give a 44 by 44 CSS px tappable area (FE-S5, AUTH-AC13.2). An icon-only
// button is exactly that square, so it stays compact without going under 44 px.
export function BaseButton({
  variant = "primary",
  loading = false,
  disabled,
  className = "",
  children,
  type = "button",
  icon,
  iconOnly = false,
  ...rest
}: BaseButtonProps) {
  const tooltip = rest.title ?? (iconOnly ? (rest["aria-label"] ?? (typeof children === "string" ? children : undefined)) : undefined);
  return (
    <button
      type={type}
      className={`btn ${VARIANT_CLASS[variant]} min-h-11 min-w-11 ${iconOnly ? "btn-square relative" : ""} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
      title={tooltip}
    >
      {loading ? (
        <span
          className="loading loading-spinner loading-sm"
          aria-hidden="true"
        />
      ) : icon ? (
        <Icon name={icon} />
      ) : null}
      {iconOnly ? <span className="sr-only">{children}</span> : children}
    </button>
  );
}
