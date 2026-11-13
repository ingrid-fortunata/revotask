# Specification Changelog

Spec versioning tracks review rounds independently of application releases. Record the old behavior, the agreed change, why it changed, the refinement prompt, and what was checked. Record the commit and link evidence when available.

## [Unreleased]

- Record agreed specification changes as implementation proceeds.

## [0.4.0] - 2026-11-13

### Changed

- **Before:** Separate prompt blocks covered the project-wide spec phases and each implementation slice.
- **After:** Two reusable prompts create and implement one native Feature Spec per slice. The queue maps feature goals and dependencies to root tasks. Steering synchronizes task progress, approved contract changes, README and relevant changelogs. Detailed review, QA, comparisons and release prompts remain available.
- **Reason:** Reduce manual prompting and keep project-wide documentation current as features are delivered.
- **Verification:** Checked feature coverage, task and API references, links, prompt count and archive integrity. Execution in Kiro is pending.

## [0.3.1] - 2026-11-13

### Changed

- **Before:** The kit generated a single native Kiro spec and supplied layer specs, but several handbook evidence items had no dedicated collection step.
- **After:** Added the full rubric checklist, submission runbook, isolated comparison prompts and evidence templates. The native Kiro workflow now calls for a design trace and targeted refinements. AuthContext, SearchBar, typed error proof and the complete live Playwright report have explicit prompts and task coverage.
- **Reason:** Make handbook criteria traceable through generation, implementation, verification and submission while keeping the main workflow local-first.
- **Verification:** Reviewed the attached handbook, checked Markdown links, prompt mappings, endpoint ownership, task dependencies, acceptance traceability and ZIP integrity. Kiro outputs, app tests, deployments and instructor approval of deviations remain pending.

## [0.3.0] - 2026-11-13

### Added

- Backend data model, API contract and Flask architecture.
- Frontend page/component design, API integration and typed error-handling specs.
- Spec review evidence template covering handbook review dimensions and targeted refinements.

### Changed

- **Before:** P01 scaffolded the app from the root specification baseline. App-level specs were indexes.
- **After:** P01A–C use Kiro Requirements-First to generate one native Feature Spec. P01D reviews and aligns the root submission files, and P01E starts local scaffolding. Layer specs now provide implementation details.
- **Reason:** Capture native Kiro output for the rubric and make backend and frontend decisions reviewable before coding.
- **Verification:** Cross-checked handbook pp. 2–5 and 8–11, prompt references, spec links and endpoint ownership. Native Kiro generation, app implementation and test execution are pending.

## [0.2.1] - 2026-11-13

### Changed

- **Before:** Documentation updates were explicit at spec review and release, and the start guide called for changelog updates at milestones.
- **After:** Kiro loads a documentation checkpoint on every interaction. Write prompts direct the agent to update the relevant changelogs and README facts within the same task.
- **Reason:** Keep progress and version history current as each implementation task finishes.
- **Verification:** Checked steering front matter, prompt coverage, Markdown links and archive contents. Kiro execution is pending.

## [0.2.0] - 2026-11-13

### Changed

- **Before:** Separate specification and steering comparison exercises came before implementation.
- **After:** P01 scaffolds the app directly from the included specification. Reviews use actual implementation diffs. GitHub, CI setup and deployment follow local acceptance.
- **Reason:** Use a single ready-to-prompt workspace and finish the app locally before publishing.
- **Verification:** Checked prompt-to-task mapping, English documentation, environment templates and archive integrity. App implementation and tests are pending.

## [0.1.0] - 2026-11-13

### Added

- Initial RevoTask project brief, requirements, design, task plan, API contract and acceptance traceability from the attached assignment.
- Steering guidelines for frontend, backend and PostgreSQL.
- Workflow for collecting real AI review, tests and deployment evidence.

### Decisions relative to the assignment

| Before | After | Reason | Verification |
|---|---|---|---|
| Flask deployment illustrated with Railway. | Flask on Render, data in Supabase PostgreSQL, UI on Vercel. | Requested project stack. | Runbook written. Live verification pending. |
| JWT in frontend context. | HttpOnly cookie at Next, bearer validation and revocation in Flask, safe DTO in UI context. | Same session for server and browser paths. | D2 / AC02.1–3. Tests pending. |
| Client submits a positive float. | Flask allocates float order from anchors and checks board position version. | Keeps concurrent moves consistent. | D4 / AC07.1–2. Tests pending. |

## Entry template

Place the next verified spec round above the previous version.

```markdown
## [X.Y.Z] - YYYY-MM-DD
### Changed
- F-XX · AC/section: …
  - Before: …
  - After: …
  - Reason: …
  - Prompt/run: …
  - Verification: …
  - Commit/evidence: …
```
