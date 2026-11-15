---
inclusion: always
---

# Documentation Checkpoint

Apply this before handing off an implementation or an agreed specification change. Review the actual changes and relevant checks.

| Change | Synchronize |
|---|---|
| Verified task completion | Update the native feature task and matching checkbox in `specs/tasks.md`. Check the root task only when its full scope is verified. |
| Application change | Add a concise feature/task entry under the `## YYYY-MM-DD` heading for the commit date, with a `### <short-sha> <subject>` entry in `CHANGELOG.md`. Add layer-specific notes under the `## YYYY-MM-DD` heading for the commit date, with a `### <short-sha> <subject>` entry in the affected backend and frontend changelogs. |
| Requirement, design, contract or task-scope change | Align the active native spec and the affected root specs, traceability, layer specs or `docs/API.md`. Record before, after, reason and verification in `specs/CHANGELOG.md`. Task checkbox changes alone do not require a spec changelog entry. |
| Implementation progress, setup, behavior or release facts | Update the relevant README status, feature or setup section using verified facts. Link the changelog and evidence where useful. |

Group related changes and refine existing entries to avoid duplicates. Track pending verification accurately. Preserve previous release entries and version/tag the app during release work. For read-only requests or an empty diff, leave documentation alone. Report the docs updated and the tests run at handoff.
