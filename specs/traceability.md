# Acceptance Traceability

Every row is planned. E codes refer to the [API](../docs/API.md), T codes to [tasks](tasks.md), and V codes to the [test plan](../docs/TEST-PLAN.md). Add observed evidence paths or links after execution.

| AC | Design/API/UI mapping | Tasks | Verification |
|---|---|---|---|
| AC01.1, AC01.2 | D2 · E02 · `/register` | T02, T03, T04 | V01 |
| AC02.1, AC02.2, AC02.3 | D2 · E03–E04 · `/login`, protected shell | T03, T04 | V02, V09 |
| AC03.1, AC03.2, AC03.3 | D2–D3, D5 · E05–E09 · `/`, `/boards/[id]` | T05, T06 | V03, V10 |
| AC04.1, AC04.2 | D2–D3 · E10–E12 · Board members | T05, T06 | V03 |
| AC05.1, AC05.2 | D3–D4 · E13–E16 · Kanban columns | T07, T09 | V04, V10 |
| AC06.1 | D3–D5 · E17–E19 · Kanban cards | T08, T09 | V04, V10 |
| AC06.2 | D5–D6 · E21 · `/my-tasks` | T11 | V07 |
| AC07.1, AC07.2 | D4–D5 · E20 · Kanban move | T08, T09 | V04, V05, V10, V11 |
| AC08.1, AC08.2 | D2, D5 · E23–E26 · Card detail modal | T10 | V06, V10 |
| AC09.1 | D5–D6 · E22 · Board search | T11 | V07, V11 |
| AC10.1, AC10.2 | D3, D6 · E17–E18, E24, E27–E28 · Notification bell | T13 | V08, V11 |
| AC11.1 | D3, D6 · E29 · Analytics panel | T14 | V08 |
| AC12.1 | D2, D5 · E30–E31 · `/profile` | T12 | V07 |
| AC13.1 | D5 · protected pages and Move control | T09, T15 | V11 |
| AC13.2 | D1, D6 · E07 | T15, T16 | V12 |
| AC13.3 | D2, D6 · private pages and mutations | T01, T03, T04, T15 | V02, V13 |
| AC14.1 | D1, D6 · E01–E03 and public API routing | T02, T16 | V14 |
| AC14.2 | D5–D6 · live web routes | T15, T16 | V09, V10, V11 |
| AC14.3 | D1, D7 · public API and web documentation | T17 | V15 |

## Endpoint and page implementation ownership

Use this map to verify that every route and page has a task. The acceptance matrix above shows the related design and test references.

| Endpoint or surface | Implementation task |
|---|---|
| E01 health | T02 |
| E02–E04 Flask auth | T03 |
| E02–E04 browser auth and protected shell | T04 |
| E05–E12 Flask boards and membership | T05 |
| E05–E12 dashboard and board UI | T06 |
| E13–E16 Flask columns | T07 |
| E17–E20 Flask card CRUD and positioning | T08 |
| E13–E20 Kanban UI | T09 |
| E23–E26 comments and card detail modal | T10 |
| E21–E22 My Tasks and search | T11 |
| E30–E31 profile | T12 |
| E27–E28 notifications | T13 |
| E29 analytics | T14 |
| /register and /login | T04 |
| / and /boards/[id] | T06, T09 |
| /my-tasks | T11 |
| /profile | T12 |
