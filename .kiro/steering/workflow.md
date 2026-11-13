---
inclusion: always
---

# RevoTask Feature Workflow

## Context

Read `PROJECT-BRIEF.md`, `specs/FEATURE-QUEUE.md`, the matching rows in `specs/requirements.md`, `specs/design.md`, `specs/tasks.md` and `specs/traceability.md`. Use the existing code and verification evidence to identify current behavior. Read the relevant layer specs, guidelines, `docs/API.md` and `docs/TEST-PLAN.md` for the slice. Read `docs/RUBRIC.md` when preparing assessment evidence. Load applicable guidelines explicitly when a new file has no matching file context.

## Spec phase

Use the active Requirements-First Feature Spec to generate `requirements.md`, `design.md` and `tasks.md` under `.kiro/specs/<slug>/`. Express observable acceptance criteria, include errors and role boundaries, and identify material assumptions. Explain design decisions and map each acceptance criterion to the API or UI, implementation task and verification. Keep implementation tasks small, use actionable checkboxes and link them to existing root task IDs. If a feature needs new IDs, propose them during review and preserve existing IDs. Follow Kiro's phase reviews. Preserve source code during spec generation.

The native Feature Spec holds the detailed slice and its task progress. Root `specs/` holds the reviewed project-wide requirements, design, delivery task status and traceability. Link from the relevant root task to the native spec when its path exists. Preserve prior feature specs, existing implementation and review history. Update shared requirements, design and contracts for approved changes and record the decision in the spec changelog. Use `evidence/spec-review.md` for the rubric review with concrete file references and actual refinements.

## Implementation phase

Confirm the requested spec and task dependencies, then implement unfinished tasks in scope. Reuse existing behavior and contracts. If a material change to a contract is necessary, resolve and record it before implementing the changed behavior. Run relevant checks and review the actual diff against the approved spec and guideline IDs. Record findings and outcomes in the evidence log as needed.

Before reporting completion, apply `documentation.md`. Mark the native and matching root task complete only when its acceptance checks pass. Partial implementation and blocked verification stay open. A root task that spans several native tasks completes when all of its acceptance checks pass. Report changed files, completed IDs, checks run, open work and documentation updates.
