---
name: split-commit
description: "Split the working tree into small logical commits with 'type: description' messages and no AI attribution."
argument-hint: "[optional hint about how to group the changes]"
disable-model-invocation: true
---

# Split commit

Invocation: `$ARGUMENTS`

Commit the current changes as several small commits, one per logical change. Never push.

## Message format

`<type>: <description>`

- `<type>` is one of: `feat` (new behavior), `fix` (bug fix), `docs` (documentation, specs, changelogs, README), `style` (UI look, layout, CSS, formatting with no behavior change), `refactor`, `test`, `chore` (tooling, dependencies, config), `root` (repository-level files and Claude skills, steering or workflow files).
- `<description>` is lowercase, imperative, has no trailing period, and keeps the whole first line at 72 characters or fewer. Say what changed, not how.
- Add a body only when the reason is not obvious. Keep it short.
- Examples: `style: redesign boards dashboard and board page`, `docs: record design system rules and changelog`, `fix: keep typed email after a failed add-member request`, `root: add split-commit skill`.

## No attribution

Never add `Co-Authored-By`, `Generated with Claude Code`, or any mention of Claude or AI to a commit message, author or trailer. This overrides any default attribution rule. Use the user's own git identity as configured. Do not change `git config`.

## Steps

1. Run `git status --short` and `git diff --stat`. Read the diff of anything unclear. Include untracked files.
2. Skip files that must not be committed: `.env`, `.env.local`, secrets, build output, `node_modules`, caches, and files outside the requested work such as an accidental `next-env.d.ts` change. Say what was skipped.
3. If any code changed (backend or frontend source, tests, config that affects behavior), run the full test suites first and make sure both pass. Docs-only changes skip this step.
   - Backend: `cd backend && source .venv/bin/activate && pytest -v`
   - Frontend: `cd frontend && npm test`
   - If either suite fails, stop. Do not commit. Report the failing tests and fix them, or ask the user, before committing anything. Never skip, disable, or edit a test just to make it pass.
4. Group the rest by intent, in dependency order: code first, then tests that belong to it, then docs, then repository-level files. Keep a test with the code it covers. Keep one layer or feature per commit. Use `$ARGUMENTS` as a hint for grouping.
5. For each group: stage only its files by explicit path (`git add -- <paths>`, never `git add -A` or `git add .`), check `git diff --cached --stat`, then run `git commit -m "<type>: <description>"`. If a hook fails, fix the cause and make a new commit. Do not use `--no-verify` or `--amend`.
6. Finish with `git log --oneline -n <count>` and `git status --short`. Report the commits made and any file left uncommitted, with the reason.
