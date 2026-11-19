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
  PASSWORD_HINT,
  PROFILE_FIELDS,
  type ProfileKey,
  profileChanges,
  validateProfile,
} from "@/lib/authRules";
import { parsePublicUser } from "@/lib/errors";
import { notifySuccess } from "@/lib/toast";
import type { PublicUser } from "@/lib/types";

type Values = Record<ProfileKey, string>;

const PASSWORD_SECTION_ID = "profile-password-section";
const EMPTY_PASSWORDS = { current_password: "", new_password: "" };

// A controlled form seeded from the stored user (P6, P7). It sends the name only when it changed
// and the password pair only when the user opened "Change password" and typed in it (P13), each
// validated first with the E02 and E03 rules. The email is shown read-only and is never part of
// the state or the request (P12). A save updates the form, the safe user context and the server
// tree. A password lives only in this component's state until the request, never in the context.
export function ProfileForm({ user }: { user: PublicUser }) {
  const router = useRouter();
  const { setUser } = useAuth();
  const [savedName, setSavedName] = useState(user.name);
  const [values, setValues] = useState<Values>({ name: user.name, ...EMPTY_PASSWORDS });
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<ProfileKey>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const currentRef = useRef<HTMLInputElement>(null);
  const newRef = useRef<HTMLInputElement>(null);
  const { handleError } = useErrorHandler();

  const dirty = Object.keys(profileChanges(values, savedName)).length > 0;

  function setValue(key: ProfileKey, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  // Closing the section empties both fields and their errors, so a user who closes it sends no
  // password key (Requirement 4.4).
  function togglePassword() {
    if (passwordOpen) {
      setValues((current) => ({ ...current, ...EMPTY_PASSWORDS }));
      setFieldErrors((current) => ({ name: current.name }));
    }
    setPasswordOpen(!passwordOpen);
  }

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
    ({ name: nameRef, current_password: currentRef, new_password: newRef })[first].current?.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const changes = profileChanges(values, savedName);
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
      setSavedName(next.name);
      setValues({ name: next.name, ...EMPTY_PASSWORDS });
      setPasswordOpen(false);
      setUser(next);
      router.refresh();
      notifySuccess("Profile updated.");
    } catch (error) {
      // The typed values stay, so the user can fix them and save again (P6). A wrong current
      // password shows under that field and the section stays open (P16).
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
        onChange={(name) => setValue("name", name)}
      />
      <FormField
        id="profile-email"
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        value={user.email}
        readOnly
        inputClassName="bg-base-200 text-base-content/70"
        hint="You sign in with this email. It cannot be changed."
        onChange={() => {}}
      />
      <div>
        <BaseButton
          type="button"
          variant="ghost"
          icon={passwordOpen ? "x" : undefined}
          aria-expanded={passwordOpen}
          aria-controls={PASSWORD_SECTION_ID}
          onClick={togglePassword}
          className="w-full sm:w-auto"
        >
          {passwordOpen ? "Cancel password change" : "Change password"}
        </BaseButton>
      </div>
      <div id={PASSWORD_SECTION_ID} hidden={!passwordOpen} className="flex flex-col gap-4">
        {passwordOpen ? (
          <>
            <FormField
              id="profile-current-password"
              name="current_password"
              label="Current password"
              type="password"
              autoComplete="current-password"
              value={values.current_password}
              error={fieldErrors.current_password}
              inputRef={currentRef}
              onChange={(value) => setValue("current_password", value)}
            />
            <FormField
              id="profile-new-password"
              name="new_password"
              label="New password"
              type="password"
              autoComplete="new-password"
              value={values.new_password}
              hint={PASSWORD_HINT}
              error={fieldErrors.new_password}
              inputRef={newRef}
              onChange={(value) => setValue("new_password", value)}
            />
          </>
        ) : null}
      </div>
      <div>
        <BaseButton type="submit" icon="check" loading={pending} disabled={!dirty} className="w-full sm:w-auto">
          {pending ? "Saving…" : "Save changes"}
        </BaseButton>
      </div>
    </form>
  );
}
