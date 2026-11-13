# Frontend Steering Guidelines

## Component Structure

| ID | Rule | Rationale | RevoTask example |
|---|---|---|---|
| FE-C1 | Keep page files as Server Components. Add a client boundary for hooks, events or browser APIs. | Keeps authenticated data access server-side and limits hydration. | `app/boards/[id]/page.tsx` fetches the board and renders interactive `KanbanBoard.tsx`. |
| FE-C2 | Give components one responsibility, type props above the function, and pass serializable data across the server/client boundary. | Allows independent testing and predictable composition. | `BoardCard` renders card data, while a client wrapper supplies drag and click actions. |
| FE-C3 | Reuse `BaseButton`, `BaseBadge` and `BaseModal` for repeated controls. Modal closes with Escape, traps focus while open and restores it on close. | Makes interactions and accessibility consistent. | `CardDetailModal` composes `BaseModal` and `CommentList`. A nested confirmation closes alone on Escape. |
| FE-C4 | Provide accessible labels, clear error text and a non-drag way to move a card. | Keeps the workflow available on touch and with a keyboard. | A Move button opens a column picker. |

| Component | Runtime boundary | Single responsibility |
|---|---|---|
| `BoardCard.tsx` | Server-compatible, props-only. When imported by the client Kanban island it runs within the client graph. | Render card summary. |
| `ColumnHeader.tsx` | Server-compatible, props-only. Interactive controls are separate children. | Render the column title and count. |
| `AddCardForm.tsx` | Client. Handles input, submit and pending state. | Create a card in one column. |
| `CommentList.tsx` | Server-compatible, props-only. Included in the client graph when composed by the modal. | Render supplied comments, or the empty text. |
| `CardDetailModal.tsx` | Client. Owns the comment state through `useCardComments`. | Show one card's edit form and comments in a `BaseModal` (`wide`). |
| `CardEditForm.tsx` | Client. Handles input, submit and delete confirmation. | Edit, assign and delete one card. |
| `CommentItem.tsx` | Client. Holds only the editor draft and the delete confirmation. | Show one comment and, for its author, edit and delete it. |
| `CommentForm.tsx` | Client. Handles input and submit. | Add a comment. |

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

## Visual Design System

The app reads as a work dashboard: a dark ink sidebar, a cool grey canvas, white panels and one teal accent. It is mobile first, so the sidebar is a sticky top bar below 1024 px. Every UI slice follows these rules in addition to FE-S1 to FE-S6. The tokens live in `app/globals.css`. Do not copy hex values into components.

| Token (daisyUI name) | Value | Use |
|---|---|---|
| `base-200` | `#F1F4F3` | Page canvas behind panels |
| `base-100` | `#FFFFFF` | Panels, inputs |
| `base-300` | `#DDE3E0` | Panel borders, dividers |
| `base-content` | `#18242A` | Text. Secondary text is `text-base-content/70` |
| `neutral` | `#10262B` | Sidebar, mobile top bar, auth side panel |
| `primary` | `#0B7A75` | Main action, Admin badge, active nav item, focus ring |
| `error` | `#B42318` | Destructive actions and field errors |

| ID | Rule | RevoTask example |
|---|---|---|
| FE-D1 | Use only daisyUI semantic colors (`bg-base-100`, `text-primary`, `border-base-300`). Do not add a color, a font or a second accent without updating this section first. Use `<BaseButton>`, `<BaseBadge>`, `FormField` and `.surface` before writing new control styles. | `BoardList` uses `.surface` and `BaseBadge`, with no hex values. |
| FE-D2 | Shell: `AppHeader` is the only navigation. It is a sticky top bar below 1024 px and a fixed 16 rem sidebar from 1024 px. The protected layout wraps content in `lg:pl-64`. Every protected `<main>` uses `mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8`. Public pages use a split layout: an ink panel with the product line from 1024 px, and the form column alone below. | `app/(protected)/layout.tsx`, `app/(public)/layout.tsx` |
| FE-D3 | A panel is the `.surface` utility (white, 1 px `base-300` border, box radius) with `p-4 sm:p-5`. No shadows on panels. Do not nest a panel in a panel. Use `divide-y divide-base-300` for rows inside one. | Members panel rows are a divided list inside one `.surface`. |
| FE-D4 | Page pattern: a title (`text-2xl sm:text-3xl font-semibold tracking-tight`), then an optional summary strip, then content. From 1024 px, put secondary work (create form, members) in a 20 to 22 rem side column and keep the main content wide. Below 1024 px, stack in this order: main content, then side panel. A form that sits in the side column stacks its field and button. In a full-width panel it is a row from 640 px. | Dashboard: stat strip, board grid and the Create a board panel. Board page: columns and the Members panel. |
| FE-D5 | Type is Figtree (`next/font`, variable `--font-figtree`). Section headings are `text-lg font-semibold`. Body is `text-base`. Help and secondary text are `text-sm text-base-content/70`. Use sentence case. Do not use all-caps labels, tracked-out eyebrows or decorative icons. Numbers in summaries use `tabular-nums`. | Stat strip values, board titles. |
| FE-D6 | Color carries meaning. `primary` marks the main action, Admin and the current page. `error` marks destructive actions. A board gets one of six fixed chip colors from its ID, so it keeps the same color everywhere. Do not color a panel for decoration. | `chipClass()` in `BoardList.tsx` |
| FE-D7 | Copy is plain and written for the user: a button says what it does ("Create board", "Add member"), the same action keeps the same name in its toast, and an empty state says what to do next. Errors say what happened and how to fix it. | "You have no boards yet. Create your first board to start planning with your team." |
| FE-D8 | Keep one memorable thing per screen and keep the rest quiet. Here it is the board tiles on the dashboard and the ink sidebar. Motion only answers an action (dialog open, pending spinner). No entrance animations or hover effects on every card. | Tiles change only their border on hover. |
| FE-D9 | Design never overrides FE-S4 to FE-S6. A UI slice records a screenshot check at 375, 768 and 1280 px (no horizontal page scroll, controls at least 44 px) next to the FE-S6 record. Component tests assert behavior, roles and text. Assert layout classes only for a mobile rule (FE-S4, FE-S5). | The boards screens were checked at 375, 768 and 1280 px. |

Shared visual parts: `AppHeader` (shell), `BrandMark` (logo and name), `Avatar` (initials, decorative), `BaseBadge`, `BaseButton`, `BaseModal`, `ConfirmDialog`, `FormField` (a text input, or a textarea with `multiline`), `SelectField` (a labelled select) and `CheckboxField` (a labelled 44 px checkbox with a text hint). A new screen composes these and the `.surface` utility. Add a new shared part only when two screens need it.

## State Management

| ID | Rule | Rationale | RevoTask example |
|---|---|---|---|
| FE-A1 | Keep private initial reads on the server and make browser requests through same-origin handlers. Store only public user data in context. | One session works for SSR and client interactions. | Profile seeds its controlled form with `GET /api/users/me`. |
| FE-A2 | Keep form state local and side effects in hooks with cleanup. | Reduces race conditions and duplicated requests. | Search aborts stale requests and notifications stop polling on unmount. |
| FE-A3 | Snapshot and roll back optimistic mutations. Serialize active position mutations and reconcile with the server response. | Avoids stale orders after a failed move. | A 409 restores the prior view and refreshes the board. |
| FE-A4 | Assert rendered data and behavior in component tests. | A mount-only test misses broken wiring. | `BoardCard` renders title and assignee, and `CommentList` renders author and text. |
