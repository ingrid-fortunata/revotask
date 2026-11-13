---
name: revotask-feature
description: "Create, review, or implement one RevoTask feature using the shared Kiro-compatible specs, steering, and documentation workflow."
argument-hint: "[spec|implement] [feature-slug|next] [optional task ID or instructions]"
disable-model-invocation: true
---

# RevoTask Feature Workflow

Invocation: `$ARGUMENTS`

## Resolve the feature

1. Use the RevoTask repository root. Read `PROJECT-BRIEF.md`, `specs/FEATURE-QUEUE.md`, `.kiro/steering/workflow.md`, and `.kiro/steering/documentation.md`. Apply the shared rules in Claude Code and handle phase reviews in the current chat.
2. Use the queue to resolve the feature scope, root task IDs, and prerequisites. With `spec next`, select the first incomplete feature in queue order whose prerequisites are verified. Resume its existing spec if present. With `implement`, require an explicit feature slug. If the mode or target is unclear, show usage and leave the repository untouched.
3. Inspect Git status and relevant changes, including untracked files. Read the affected sections of root `specs/`, applicable steering and guidelines, layer specs, and related code and tests. For any feature that adds or changes UI, read the Visual Design System section of `guidelines/frontend.md` (FE-D1 to FE-D9) and `frontend/app/globals.css` before designing or coding. Check the prerequisite and task status against the implementation and available test evidence. Report any unmet dependency that blocks the selected work.
4. Find the existing feature folder in `.kiro/specs/` by slug or root task IDs before creating one. Preserve its actual folder name, metadata, existing decisions, and verified progress. If more than one spec owns the same work, resolve the overlap before editing. For a feature outside the queue, use the requested goal and propose its scope and root task IDs for review.

## `spec <feature-slug|next>`

Use `.kiro/specs/<slug>/` for the detailed feature spec. Resume at the first incomplete or unapproved phase. Review already drafted files in place and preserve approved phases.

1. **Requirements.** Write or refine `requirements.md`. Define feature scope, observable acceptance criteria, role boundaries, and applicable error cases. Surface unresolved scope or contract decisions. Pause for approval.
2. **Design.** After requirements approval, write or refine `design.md`. Map acceptance criteria to the affected API, data model, UI, and verification. Explain material choices and flag changes to shared contracts. Pause for approval.
3. **Tasks.** After design approval, write or refine `tasks.md`. Use small checkboxes in dependency order. Link each task to the root task IDs and its acceptance checks. Pause for approval.
4. **Finalize.** After task plan approval, link the feature spec from the corresponding root tasks. Synchronize approved changes to the affected root specs, traceability, and API or layer docs. Record substantive spec changes in `specs/CHANGELOG.md` with before, after, reason, and verification. Stop before implementation.

Record actual review decisions and approvals in `evidence/spec-review.md` so a later session can resume. Attribute each phase or revision to the tool that actually produced it and preserve existing Kiro evidence. Keep edits in this mode scoped to specifications and review documentation.

## `implement <feature-slug> [task ID or instructions]`

1. Read the three feature spec files and confirm the plan has been reviewed through an existing record or the user's explicit approval of that plan. If approval or a material decision is missing, report the exact gap and wait. Complete any approved spec synchronization that is still pending.
2. Implement the requested task or resume the first unfinished task whose dependencies are met. Default to one task per run and honor any broader scope the user requests. Preserve in-progress changes and verified work. Resolve material changes to requirements or contracts before coding them. Build UI to the RevoTask design system: dashboard shell (dark ink sidebar from 1024 px, sticky top bar below), white `.surface` panels on a cool grey canvas, teal primary accent, Figtree type, daisyUI semantic colors only, and the shared parts `AppHeader`, `BrandMark`, `Avatar`, `BaseButton`, `BaseBadge`, `BaseModal`, `ConfirmDialog` and `FormField`. The full rules are FE-D1 to FE-D9 in `guidelines/frontend.md`. Do not add colors, fonts or a second accent without updating that section in the same change. Keep deployment and publishing in the separate release workflow.
3. Run the checks for the task and review the diff against the spec. For UI work, also take screenshots at 375, 768 and 1280 px and confirm the screens match the design system and have no horizontal page scroll (FE-D9). Mark the feature task complete only after its acceptance checks pass. Mark its root task in `specs/tasks.md` complete only after the full root scope is verified. Leave failed, blocked, and unverified work open with the actual reason.
4. Apply the documentation checkpoint in the same change. Update `README.md` for verified progress, setup, or behavior. Record implementation changes under `[Unreleased]` in the root and affected layer changelogs. Synchronize approved spec changes across the feature and affected shared docs, then record them in `specs/CHANGELOG.md`. Keep entries concise and avoid duplicates.
5. Report the completed or open task IDs, files changed, checks actually run and their results, and the next unfinished task. Record relevant implementation and refinement evidence with accurate tool attribution.
