"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import { BaseButton } from "@/components/shared/BaseButton";
import { FormField } from "@/components/shared/FormField";
import { apiPost } from "@/lib/apiClient";
import { type FieldErrors, REGISTER_FIELDS, validateRegister } from "@/lib/authRules";
import { notifySuccess } from "@/lib/toast";
import { useErrorHandler } from "@/hooks/useErrorHandler";

type RegisterKey = (typeof REGISTER_FIELDS)[number];

// Exactly three fields: name, email and password (AUTH-AC10.1). A successful registration does
// not sign the user in: it shows a toast and goes to /login (A11).
export function RegisterForm() {
  const router = useRouter();
  const [values, setValues] = useState<Record<RegisterKey, string>>({ name: "", email: "", password: "" });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<RegisterKey>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const { handleError } = useErrorHandler();

  function showFieldErrors(errors: Record<string, string>) {
    setFieldErrors(errors as FieldErrors<RegisterKey>);
    const first = REGISTER_FIELDS.find((key) => errors[key]);
    const target = { name: nameRef, email: emailRef, password: passwordRef }[first ?? "name"];
    if (first) target.current?.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setFormError(null);
    const { body, fields } = validateRegister(values);
    if (Object.keys(fields).length > 0) {
      showFieldErrors(fields);
      return;
    }
    setFieldErrors({});
    setPending(true);
    try {
      await apiPost("/api/auth/register", body);
      notifySuccess("Account created. Sign in to continue.");
      router.push("/login");
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
        id="register-name"
        name="name"
        label="Name"
        autoComplete="name"
        value={values.name}
        error={fieldErrors.name}
        inputRef={nameRef}
        onChange={(name) => setValues((current) => ({ ...current, name }))}
      />
      <FormField
        id="register-email"
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
        id="register-password"
        name="password"
        label="Password (12 to 128 characters)"
        type="password"
        autoComplete="new-password"
        value={values.password}
        error={fieldErrors.password}
        inputRef={passwordRef}
        onChange={(password) => setValues((current) => ({ ...current, password }))}
      />
      <BaseButton type="submit" loading={pending} className="w-full">
        {pending ? "Creating account…" : "Create account"}
      </BaseButton>
    </form>
  );
}
