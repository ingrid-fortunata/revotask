import { expect, test } from "@playwright/test";
import { ACCEPTANCE_DOMAIN, emailFor, makePassword, newRunId, titleFor } from "./run";

// Task 2.1: the run tag appears in every generated name and email, and a password is never part of one.
test("the run tag is in every generated name and email", () => {
  const id = newRunId();
  expect(id).toMatch(/^[0-9a-f]{8}$/);
  for (const role of ["owner", "member", "removed"] as const) {
    expect(emailFor(id, role)).toBe(`la-${id}-${role}@${ACCEPTANCE_DOMAIN}`);
  }
  expect(titleFor(id, "board")).toBe(`LA ${id} board`);
  expect(titleFor(id, "card", 3)).toBe(`LA ${id} card 3`);
});

test("a generated password meets the registration rule and appears in no generated name", () => {
  const id = newRunId();
  const password = makePassword();
  expect(password.length).toBeGreaterThanOrEqual(8);
  expect(password.length).toBeLessThanOrEqual(128);
  expect(password).toMatch(/[A-Z]/);
  expect(password).toMatch(/[a-z]/);
  expect(password).toMatch(/[!-/:-@[-`{-~]/);
  const names = [emailFor(id, "owner"), titleFor(id, "board"), titleFor(id, "card", 1)].join("\n");
  expect(names).not.toContain(password);
  expect(makePassword()).not.toBe(password);
});
