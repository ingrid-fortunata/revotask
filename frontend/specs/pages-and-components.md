# Pages and Components

Next.js App Router pages render on the server and compose client components for interactive forms, browser hooks and drag-and-drop. Use Tailwind CSS with daisyUI. Show meaningful loading, empty, success and failure states on each data-driven surface.

| Route or surface | Component boundary | API and expected behavior |
|---|---|---|
| `/register` | Server page and client `RegisterForm` | E02. Exactly `name`, `email` and `password`, validated with the same rules as the API. Controlled inputs, pending submit, inline validation, then redirect to login with the user still signed out. |
| `/login` | Server page and client `LoginForm` | E03. Exactly `email` and `password`. Session cookie set by the Route Handler. Invalid credentials stay on the form. Successful login opens the dashboard, or a safe same-origin `next` path. |
| `/` | Protected Server Component with client create dialog | E05–E06. Show accessible board summaries or an empty state. |
| `/boards/[id]` | Protected Server Component with `KanbanBoard` client island | E07–E20, E22 and E29 as applicable. Show ordered columns and cards, member controls, board search, analytics and a touch/keyboard Move action. |
| Card detail modal | Client `CardDetailModal`, shared `BaseModal`, props-driven `CommentList` | E18 and E23–E26 as applicable. Show comment loading and empty states, allow submit, and show edit/delete only for the author. Restore focus when closed. |
| `/my-tasks` | Protected Server Component | E21. Group current-user assignments by board and show an empty state. |
| `/profile` | Protected server page and controlled client `ProfileForm` | E30–E31. Seed from the safe user DTO, show field errors and toast on save, then refresh public user context. |
| Shared header | Client `NotificationBell` and account controls | E04, E27–E28. Show unread count, page through notifications, mark read, and sign out. |

`BoardCard`, `ColumnHeader` and `CommentList` are props-driven and server-compatible. They enter the client graph when imported by a client island. `AddCardForm` is a Client Component because it handles input and submission. Use `BaseButton`, `BaseBadge` and `BaseModal` for common controls. Keep focus indicators, labels, Escape behavior and focus return, and verify keyboard interaction.

| Hook | Responsibility |
|---|---|
| `useDragAndDrop` | Translate desktop drag and visible Move actions to the same E20 request. Snapshot affected lists, apply the optimistic move, reconcile the server response, and roll back or refetch as specified in the error matrix. |
| `useNotifications` | Fetch on mount, poll every 30 seconds, refresh after mark-read and clean up timers and in-flight requests. Avoid overlapping polls and stale state updates. |
| `useCardSearch` | Apply a 300 ms debounce, cancel or ignore stale requests, clear results for blank queries, and distinguish empty query from zero matches. Keep SearchBar.tsx focused on rendering and input events. |
| `useErrorHandler` | Map typed API errors to visible outcomes, using the [error handling matrix](error-handling.md). |

Every page, dialog and control follows FE-S4–S6: mobile-first classes, no horizontal page scroll outside the Kanban region, 44 px touch targets, 16 px inputs and `min-h-dvh`. Verify each surface at 320, 375, 768 and 1280 px, including a usable header, forms and touch Move controls. Test real card title/assignee and comment content using React Testing Library.
