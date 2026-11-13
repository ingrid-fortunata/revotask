---
inclusion: fileMatch
fileMatchPattern: ["backend/app/models/**/*.py", "backend/migrations/**/*.py"]
---

# Database Rules

Read guidelines/database.md and cite its DB rule IDs when changing models, migrations or transactional queries. Read specs/design.md for schema and lock semantics. Explicitly attach guidelines/database.md when changing a service whose transaction touches these rules. Read backend/specs/data-model.md for the layer implementation requirements.
