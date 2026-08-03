# Decision Log — {{project-name}}

Owner: architect (see AGENTS.md). One line per decision; anything with lasting structural impact gets a full ADR in adr/.
Technical/architectural decisions only — planning-level decisions (scope exclusions, priority calls) live in docs/PRD.md's Planning Decisions section, owned by planner.

## Rules
- Decisions are append-only. To reverse one, add a new row that supersedes it (and a new ADR if the original had one).
- "Why" is mandatory — a decision without a reason cannot be evaluated later.

| # | Date | Decision | Why | ADR |
|---|---|---|---|---|
| 1 | {{YYYY-MM-DD}} | {{e.g., PostgreSQL over SQLite}} | {{e.g., concurrent writes required}} | [0001](adr/0001-example.md) |
