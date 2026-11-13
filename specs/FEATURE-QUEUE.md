# RevoTask Feature Queue

Use these slices with the two feature prompts. Choose the next row whose prerequisites are verified. Review the generated spec against the [project baseline](requirements.md) and [task plan](tasks.md). Every slice that adds UI carries its own 375 px criterion, task and check (AC13.1, FE-S4–S6). Use the actual Kiro folder slug in the implementation prompt.

| Feature slug | Root tasks | Goal for the spec prompt | Prerequisites |
|---|---|---|---|
| `foundation` | T01–T02 | Scaffold local Flask and Next.js, initialize PostgreSQL, apply the first migration and add API health. | Workspace open |
| `authentication` | T03–T04 | Add register, login, logout, protected shell and typed API errors. | Foundation |
| `boards-membership` | T05–T06 | Add boards, dashboard, roles and membership controls. | Authentication |
| `kanban` | T07–T09 | Add columns, cards, assignment and versioned drag-and-drop with rollback. | Boards and membership |
| `comments` | T10 | Add card comments, the detail modal and author-only edit/delete. | Kanban |
| `my-tasks-search` | T11 | Add personal tasks and board-scoped card search with 300 ms debounce. | Kanban |
| `profile` | T12 | Add controlled profile editing, safe public DTO and success/error feedback. | Authentication |
| `notifications` | T13 | Persist assignment/comment notifications, add mark-read and poll every 30 seconds. | Kanban and comments |
| `analytics` | T14 | Add board-scoped aggregates and analytics UI. | Kanban and comments |
| `local-acceptance` | T15 | Run integration, mobile, error and Playwright acceptance locally. Use the QA prompts as needed. | All product slices above |

If you already generated a reviewed project-wide spec, reuse its completed work and preserve its artifacts. You can use its pending tasks directly or create a smaller Feature Spec for the next distinct slice. A new slice must link back to the root task IDs that it owns. For a later feature outside this queue, state its goal, assign new unique IDs after review and update the root baseline only where its behavior changes.

T16–T17 cover GitHub, production deployment, live verification and submission. Start those steps after local acceptance when ready to publish. See the [deployment runbook](../docs/DEPLOYMENT.md) and [submission checklist](../docs/SUBMISSION.md).
