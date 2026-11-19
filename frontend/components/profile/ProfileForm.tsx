"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { BaseButton } from "@/components/shared/BaseButton";
import { FormField } from "@/components/shared/FormField";
import { apiRequest } from "@/lib/apiClient";
import {
  type FieldErrors,
  PROFILE_FIELDS,
  type ProfileKey,
  profileChanges,
  validateProfile,
} from "@/lib/authRules";
import { parsePublicUser } from "@/lib/errors";
import { notifySuccess } from "@/lib/toast";
import type { PublicUser } from "@/lib/types";

type Values = Record<ProfileKey, string>;

const fromUser = ({ name, email }: PublicUser): Values => ({ name, email });

// A controlled form seeded from the stored user (P6, P7). It sends only the fields whose normalized
// value differs from the last saved ones, validated first with the E02 rules, and never holds a
// password field (P8). A save updates the form, the safe user context and the server tree.
export function ProfileForm({ user }: { user: PublicUser }) {
  const router = useRouter();
  const { setUser } = useAuth();
  const [saved, setSaved] = useState<Values>(() => fromUser(user));
  const [values, setValues] = useState<Values>(() => fromUser(user));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<ProfileKey>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const { handleError } = useErrorHandler();

  const dirty = Object.keys(profileChanges(values, saved)).length > 0;

  // Inline messages for the form's own fields. A message for any other key cannot be placed under a
  // field, so it becomes the form-level message and the user still sees that the save failed.
  function showFieldErrors(errors: Record<string, string>) {
    const first = PROFILE_FIELDS.find((key) => errors[key]);
    if (!first) {
      setFieldErrors({});
      setFormError("Check the submitted fields.");
      return;
    }
    setFormError(null);
    setFieldErrors(errors as FieldErrors<ProfileKey>);
    ({ name: nameRef, email: emailRef })[first].current?.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const changes = profileChanges(values, saved);
    if (Object.keys(changes).length === 0) return;
    setFormError(null);
    const { body, fields } = validateProfile(changes);
    if (Object.keys(fields).length > 0) {
      showFieldErrors(fields);
      return;
    }
    setFieldErrors({});
    setPending(true);
    try {
      const next = parsePublicUser(await apiRequest<unknown>("PATCH", "/api/users/me", body));
      setSaved(fromUser(next));
      setValues(fromUser(next));
      setUser(next);
      router.refresh();
      notifySuccess("Profile updated.");
    } catch (error) {
      // The typed values stay, so the user can fix them and save again (P6).
      handleError(error, { onFields: showFieldErrors, onFormError: setFormError });
    } finally {
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
        id="profile-name"
        name="name"
        label="Name"
        autoComplete="name"
        value={values.name}
        error={fieldErrors.name}
        inputRef={nameRef}
        onChange={(name) => setValues((current) => ({ ...current, name }))}
      />
      <FormField
        id="profile-email"
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        value={values.email}
        hint="You sign in with this email."
        error={fieldErrors.email}
        inputRef={emailRef}
        onChange={(email) => setValues((current) => ({ ...current, email }))}
      />
      <div>
        <BaseButton type="submit" icon="check" loading={pending} disabled={!dirty} className="w-full sm:w-auto">
          {pending ? "Saving…" : "Save changes"}
        </BaseButton>
      </div>
    </form>
  );
}
