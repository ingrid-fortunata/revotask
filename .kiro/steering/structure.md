---
inclusion: always
---

# RevoTask Monorepo

backend/ contains Flask, migrations and pytest. frontend/ contains Next.js and browser tests. specs/ is the shared approved specification, and each app has a local spec index and changelog. guidelines/ contains the detailed steering rules. Use specs/ as the reviewed project-wide baseline. Keep native slice specs under .kiro/specs/<slug>/ and follow workflow.md and documentation.md for traceability and task synchronization. Keep backend/specs/ and frontend/specs/ as layer implementation references. Record reviewed, sanitized results in evidence/. Keep GitHub and deployment tasks until after local acceptance. Keep feature changes tied to a task ID and document cross-layer contract changes.
