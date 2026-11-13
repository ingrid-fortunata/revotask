"use client";

import { type FormEvent, useRef, useState } from "react";
import { BaseButton } from "@/components/shared/BaseButton";
import { FormField } from "@/components/shared/FormField";
import { apiPost } from "@/lib/apiClient";
import { type FieldErrors, LOGIN_FIELDS, validateLogin } from "@/lib/authRules";
import { hardRedirect } from "@/lib/navigation";
import { useErrorHandler } from "@/hooks/useErrorHandler";

type LoginKey = (typeof LOGIN_FIELDS)[number];

export interface LoginFormProps {
  /** A path that already passed safeRedirectPath on the server. */
  redirectTo: string;
}

// Exactly two fields: email and password (AUTH-AC10.2). The same rules as the API run first
// (AUTH-AC10.7). Server errors still display, because Flask is authoritative.
export function LoginForm({ redirectTo }: LoginFormProps) {
  const [values, setValues] = useState<Record<LoginKey, string>>({ email: "", password: "" });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<LoginKey>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const { handleError } = useErrorHandler();

  function showFieldErrors(errors: Record<string, string>) {
    setFieldErrors(errors as FieldErrors<LoginKey>);
    const first = LOGIN_FIELDS.find((key) => errors[key]);
    const target = first === "email" ? emailRef : first === "password" ? passwordRef : null;
    target?.current?.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setFormError(null);
    const { body, fields } = validateLogin(values);
    if (Object.keys(fields).length > 0) {
      showFieldErrors(fields);
      return;
    }
    setFieldErrors({});
    setPending(true);
    try {
      await apiPost("/api/auth/login", body);
      hardRedirect(redirectTo); // a full page load; the form stays pending until it happens
    } catch (error) {
      handleError(error, { onFields: showFieldErrors, onFormError: setFormError });
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-busy={pending} className="flex flex-col gap-4">
      {formError ? (
        <div role="alert" className="alert alert-error break-words">
          {formError}
        </div>
      ) : null}
      <FormField
        id="login-email"
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        value={values.email}
        error={fieldErrors.email}
        inputRef={emailRef}
        onChange={(email) => setValues((current) => ({ ...current, email }))}
      />
      <FormField
        id="login-password"
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        value={values.password}
        error={fieldErrors.password}
        inputRef={passwordRef}
        onChange={(password) => setValues((current) => ({ ...current, password }))}
      />
      <BaseButton type="submit" loading={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </BaseButton>
    </form>
  );
}
