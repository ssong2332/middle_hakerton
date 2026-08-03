# Shared Agent Memory Protocol

Owner: User. Referenced by the persistent-memory sections of planner, architect, implementer, and ux-design (`.claude/agents/*.md`). Each agent's own file states its memory path and its project-document pointers; this file holds the full protocol they share. Read this before saving, pruning, or restructuring memories.

## Prohibitions (override all other guidance here)
- Never save what code, project documents, or git history already record — memory must never become a shadow copy of a document another agent owns.
- Never save ephemeral state: in-progress work, temporary values, current-conversation context.
- Never write memory content into MEMORY.md — it is an index only.
- These exclusions apply even when the user explicitly asks to save. If asked to save something a document already covers, ask what was *surprising* or *non-obvious* about it — that is the part worth keeping.
- If the user says to ignore or not use memory: do not apply remembered facts, cite, compare against, or mention memory content.

## Memory types

| Type | What it holds | When to save |
|---|---|---|
| `user` | The user's role, goals, expertise, preferences | When you learn details about who the user is or how they work. Never save anything that reads as a negative judgement or is irrelevant to collaboration. |
| `feedback` | Guidance on how to approach work — corrections AND confirmed approaches | When the user corrects you ("no, not that", "stop doing X") OR confirms a non-obvious approach ("yes exactly", accepting an unusual choice without pushback). Record from failure AND success — corrections alone make you drift over-cautious. Always include *why*. |
| `project` | Ongoing work, goals, constraints not derivable from code/docs | When you learn who is doing what, why, or by when. Convert relative dates to absolute (e.g. "Thursday" → 2026-07-24) so the memory stays interpretable. |
| `reference` | Pointers to external systems (trackers, dashboards, channels, design files) | When you learn where up-to-date information lives outside the project directory. |

For `feedback` and `project` bodies: lead with the rule/fact, then a **Why:** line (the reason given — often a past incident) and a **How to apply:** line (when/where it kicks in). Knowing why lets you judge edge cases instead of blindly following the rule.

### Examples
- user: "I always want mobile designed first" → `[user: mobile-first is this user's default across projects]`
- feedback: "don't mock the database in tests — mocked tests passed but the prod migration failed last quarter" → `[feedback: integration tests hit a real DB. Why: mock/prod divergence masked a broken migration. How to apply: any test touching persistence]`
- project: "demo for investors is 2026-08-01, onboarding matters more than settings polish" → `[project: investor demo 2026-08-01 — prioritize onboarding quality until then]`
- reference: "our components live in the Figma file DS-Core" → `[reference: design tokens/components in Figma "DS-Core" — check before proposing visual constraints]`

## How to save (two steps)

**Step 1** — one fact per file (e.g. `feedback_testing.md`), with frontmatter:

```markdown
---
name: {{short-kebab-case-slug}}
description: {{one-line summary — used to decide relevance in future conversations, so be specific}}
metadata:
  type: {{user | feedback | project | reference}}
---

{{body — for feedback/project: rule/fact, then **Why:** and **How to apply:**. Link related memories with [[their-name]]; a link to a not-yet-written memory is fine — it marks something worth writing later.}}
```

**Step 2** — add one line to `MEMORY.md`: `- [Title](file.md) — one-line hook` (under ~150 chars, no frontmatter). MEMORY.md is always loaded into context and truncates after 200 lines — keep it concise.

- Organize semantically by topic, not chronologically.
- No duplicates: check for an existing file to update before creating a new one.
- Update or remove memories that turn out wrong or outdated; keep name/description/type in sync with content.

## When to access
- When memories seem relevant, or the user references prior-conversation work.
- You MUST access memory when the user explicitly asks you to check, recall, or remember something.

## Verification before acting
A memory is a claim about what was true when it was written, not what is true now:
- Memory names a file path → check the file exists.
- Memory names a function/flag → grep for it.
- The user is about to act on your recommendation → verify first.
- Memory summarizes repo state → for "recent/current" questions, prefer `git log` or reading the code over the snapshot.
- Memory conflicts with what you observe now → trust the observation, and fix or delete the stale memory.

## Memory vs other persistence
- Plans: for aligning on an implementation approach within a conversation — update the plan, don't save a memory.
- Tasks: for tracking steps of the current conversation's work.
- Memory: only for what will be useful in *future* conversations.
- Memory is user-scoped (persists across all projects this agent runs in) — keep entries generally useful across codebases; repo-specific facts go in the project documents your agent's file names as its pointers.
