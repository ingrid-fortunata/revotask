# Frontend Steering Guidelines

## Component Structure

| ID | Rule | Rationale | RevoTask example |
|---|---|---|---|
| FE-C1 | Keep page files as Server Components. Add a client boundary for hooks, events or browser APIs. | Keeps authenticated data access server-side and limits hydration. | `app/boards/[id]/page.tsx` fetches the board and renders interactive `KanbanBoard.tsx`. |
| FE-C2 | Give components one responsibility, type props above the function, and pass serializable data across the server/client boundary. | Allows independent testing and predictable composition. | `BoardCard` renders card data, while a client wrapper supplies drag and click actions. |
| FE-C3 | Reuse `BaseButton`, `BaseBadge` and `BaseModal` for repeated controls. Modal closes with Escape, traps focus while open and restores it on close. | Makes interactions and accessibility consistent. | `CardDetailModal` composes `BaseModal` and `CommentList`. |
| FE-C4 | Provide accessible labels, clear error text and a non-drag way to move a card. | Keeps the workflow available on touch and with a keyboard. | A Move button opens a column picker. |

| Component | Runtime boundary | Single responsibility |
|---|---|---|
| `BoardCard.tsx` | Server-compatible, props-only. When imported by the client Kanban island it runs within the client graph. | Render card summary. |
| `ColumnHeader.tsx` | Server-compatible, props-only. Interactive controls are separate children. | Render the column title and count. |
| `AddCardForm.tsx` | Client. Handles input, submit and pending state. | Create a card in one column. |
| `CommentList.tsx` | Server-compatible, props-only. Included in the client graph when composed by the modal. | Render supplied comments. |

## Naming Conventions

| ID | Rule | Rationale | RevoTask example |
|---|---|---|---|
| FE-N1 | Use PascalCase for component files. | Finds symbols by file name. | `BoardCard.tsx` |
| FE-N2 | Match the exported component name to its file stem. | Makes imports predictable. | `export function BoardCard` |
| FE-N3 | Name props interfaces `<Component>Props`. | Identifies ownership of the public props contract. | `BoardCardProps` |
| FE-N4 | Prefix custom hook files and exported hooks with `use`. | Makes hook behavior recognizable to tooling and reviewers. | `useDragAndDrop.ts` |
| FE-N5 | Prefix event callback props with `on`. | Identifies parent-provided callbacks. | `onCardMoved` |
| FE-N6 | Prefix local event handlers with `handle`. | Distinguishes handlers from supplied callbacks. | `handleSubmit` |
| FE-N7 | Name App Router pages `page.tsx` and give the component a descriptive name. | Aligns folder routing with readable stack traces. | `app/boards/[id]/page.tsx` exports `BoardDetailPage` as default. |
| FE-N8 | Use kebab-case for static URL segments. | Keeps routes easy to type and link. | `app/my-tasks/page.tsx` |
| FE-N9 | Co-locate tests with stable component names or a mirrored test directory. | Connects test output to source. | `BoardCard.test.tsx` |

## Styling Standards

| ID | Rule | Rationale | RevoTask example |
|---|---|---|---|
| FE-S1 | Use Tailwind utilities and daisyUI semantic classes for styling. Use theme tokens for semantic colors. | Makes themes and contrast easier to manage. | `BaseButton` maps primary and destructive variants to `btn-primary` and `btn-error`. |
| FE-S2 | Make pages mobile-first and constrain horizontal scrolling to the Kanban region. | Keeps forms and navigation usable at 375 px. | `overflow-x-auto` lives on the column region. |
| FE-S3 | Preserve visible focus, named icon buttons and text descriptions for status. | Keeps UI state understandable across input modes. | Bell label includes unread count. |
| FE-S4 | Every page, dialog, form and control works from 375 px upward with no horizontal page scroll. Only the Kanban column region scrolls sideways. Write base classes for the smallest width and add `sm:` and `md:` rules for wider screens. Use `min-h-dvh`, never `h-screen`, `min-h-screen` or `100vh`. Let long names, emails and messages wrap (`break-words`, `min-w-0`) or truncate. Never disable pinch zoom. | Mobile is the baseline and not an add-on (brief NFR 2, AC13.1). Mobile browser toolbars make `100vh` taller than the visible area. | The shell header wraps and truncates the user name at 320 px. |
| FE-S5 | Interactive controls have a tappable area of at least 44 by 44 CSS px, measured as the element's rendered box from `getBoundingClientRect()` (padding included, glyph or text size excluded) and confirmed with `document.elementFromPoint` at its center. Text inputs use 16 px text (`text-base`). Do not rely on hover. Give every drag action a visible touch alternative. | Fingers need larger targets than a pointer, and iOS Safari zooms the page when a smaller input is focused. | `BaseButton` and `FormField` set `min-h-11` and `text-base`. The Move button replaces drag on touch. |
| FE-S6 | A feature spec that adds UI includes a 375 px acceptance criterion, a task that builds it, and a recorded check at 320, 375, 768 and 1280 px before the task is checked. The record says whether the browser was an emulator or a real device. | Responsiveness has to be verified in every slice, so it cannot be left to the final acceptance run. | The authentication spec has AUTH-R13 and a width-by-route check in task 2.11. |

## State Management

| ID | Rule | Rationale | RevoTask example |
|---|---|---|---|
| FE-A1 | Keep private initial reads on the server and make browser requests through same-origin handlers. Store only public user data in context. | One session works for SSR and client interactions. | Profile seeds its controlled form with `GET /api/users/me`. |
| FE-A2 | Keep form state local and side effects in hooks with cleanup. | Reduces race conditions and duplicated requests. | Search aborts stale requests and notifications stop polling on unmount. |
| FE-A3 | Snapshot and roll back optimistic mutations. Serialize active position mutations and reconcile with the server response. | Avoids stale orders after a failed move. | A 409 restores the prior view and refreshes the board. |
| FE-A4 | Assert rendered data and behavior in component tests. | A mount-only test misses broken wiring. | `BoardCard` renders title and assignee, and `CommentList` renders author and text. |
