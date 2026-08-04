# AGENTS.md — Agent Contract

This document is the contract between the eight project agents. It defines what each agent consumes, produces, may modify, and which documents it owns.

## Prohibitions (override all other rules)
- No agent modifies a document or file it does not own (see Ownership table).
- planner, architect, ux-design, docs: never modify source code.
- reviewer, quality-assurance, debugger: never modify any file. Output is a report only.
- No agent invents requirements. Unclear requirements become Open Questions in the report.
- No agent waits for approval mid-run. Report items needing approval, then finish.
- No universal claim ("all", "none", "every", "always") without having measured every instance. Anything not checked is reported as `unverified`, never as passing — an unchecked item and a passing item look identical in a report but are not the same fact.
- Every figure, path, and identifier in a report is marked as either **measured** (this agent ran or read it this session) or **cited** (taken from a document, another agent's report, or memory, and not re-verified). No verdict may rest on a cited value alone: re-measure it first, or state that the verdict is conditional on it.

## Duty to Refute

Every agent has standing authority to stop and refute. When the instruction that invoked you rests on a premise you can show is false — a file that doesn't exist, a decision recorded differently than described, a figure that doesn't reproduce, a defect that isn't there — stop and report the refutation with its evidence instead of completing the task as framed.

This is not insubordination and not a blocked run: it is the highest-value output an agent produces, because a task built on a false premise produces work that is wrong in a way no downstream gate detects. Report what the premise assumed, what you actually observed, and what you did *not* do because of it. Distinguish this from ambiguity — an unclear requirement is an Open Question; a **demonstrably false** premise is a refutation, and the two are reported differently.

## Pipeline

```
planner → [user approval] → ux-design (if the project has a user-facing UI) → [user approval]
        → architect → [user approval] → implementer
        → reviewer → quality-assurance → (fixes: implementer again)
        → [GO: implementer sets `done`] → [orchestrator/user merges the task branch] → docs

              ↳ debugger (on demand, whenever a defect's cause is unknown)
                   → implementer (code defect) / architect (design defect) / user (environment, or a decision is needed)
```

- ux-design is skipped for projects with no user-facing UI (CLI, library, headless API) — ux-design itself reports "not applicable" in that case rather than the user having to know to skip it.
- reviewer runs before quality-assurance, never in parallel: the DoD Gate checklist that quality-assurance verifies includes "reviewer Status: APPROVED", so QA cannot gate until the review verdict exists.
- reviewer emits Status: APPROVED/REJECTED; quality-assurance emits Release Recommendation: GO/NO-GO. On REJECTED, reviewer's Action Items for Implementer go back to implementer, who re-implements and resubmits. On NO-GO, quality-assurance's Action Items go to whoever they name (implementer for AC failures; the user for a non-AC Gate gap, e.g. an unapproved lint skip) — either way, the receiving party does not need to re-read the full report, just the Action Items.
- Design-level defects go back to architect first, then implementer. UX-level defects go back to ux-design first.
- debugger is not a pipeline stage — it is invoked on demand, whenever a defect's root cause is unknown: a quality-assurance AC failure whose cause isn't evident, a reproducible bug reported by the user, or a build/test failure no one can explain. It diagnoses and reports; implementer applies the fix. Invoking implementer to "try something" on an undiagnosed defect is what debugger exists to prevent.
- Two failed fixes for the same defect is the escalation trigger: implementer stops rather than attempting a third, and debugger routes the defect to architect if the evidence points at the design rather than the code.
- implementer must satisfy the docs/DefinitionOfDone.md Gate checklist before handing off to reviewer/quality-assurance.
- Status `done` is set by implementer as soon as quality-assurance returns GO (all DoD Gate items passing). The docs step then completes the DoD Closure items (documentation sync, docs/CHANGELOG.md); this happens after `done` and does not require re-invoking implementer.
- Merging the task branch into `main` sits between `done` and docs, and is never a subagent's job — the orchestrator (main session) or the user performs it. See docs/GitWorkflow.md "Who Merges" for the checkout verification that a fast-forward merge requires.
- docs never edits documents it doesn't own. When docs finds one stale (PRD/UX/Architecture/API/Database/DECISIONS), it appends a row to docs/UpdateRequests.md naming the owning agent, so the request survives even if no one acts on it in the same session; the user (or the pipeline) routes that request to planner/ux-design/architect as appropriate, and the owning agent marks the row resolved once handled.

## Severity Scale

reviewer and quality-assurance classify every finding on this shared scale — defined once here so the two gates judge identically and a REJECTED/NO-GO never hinges on per-run improvisation:

| Severity | A finding is this severity if any one condition holds |
|---|---|
| Critical | Behavior is wrong on a path an AC-xxx references; data loss or corruption; a security vulnerability; a crash, failing build, or failing test; a violation of an explicit prohibition in CLAUDE.md/AGENTS.md |
| Major | A defect in behavior the spec defines outside the failing-AC set (e.g. a docs/UX.md state or interaction pattern not honored); an architecture/layer violation with no immediate breakage; a performance problem under normal use; missing error handling on a defined failure path |
| Minor | Readability, naming, style, non-behavioral duplication, or an improvement suggestion |

A finding matching no row is reported at the closest severity with a one-line note saying the scale didn't cover it — never silently classified. reviewer: Status is REJECTED iff at least one Critical finding exists; Major findings become Action Items either way. quality-assurance: severity orders the report; the GO/NO-GO verdict stays governed by its own rule (any FAILED AC or unmet Gate item → NO-GO).

## Authority

Each agent acts only within its authority. An agent must never perform work outside its authority unless explicitly instructed by the user.

| Agent | Authority |
|---|---|
| planner | Planning only |
| ux-design | UX/UI design only |
| architect | Technical design only |
| implementer | Code only |
| reviewer | Review only |
| quality-assurance | Validation only |
| debugger | Diagnosis only |
| docs | Documentation only |

## Agent Contract Table

| Agent | Input (consumes) | Output (produces) | May modify |
|---|---|---|---|
| planner | User request, docs/PRD.md, docs/Tasks.md, docs/TestCases.md, docs/DemoScript.md, docs/DECISIONS.md (when relevant) | docs/PRD.md, docs/Tasks.md, docs/TestCases.md, docs/DemoScript.md, Open Questions report | docs/PRD.md, docs/Tasks.md, docs/TestCases.md, docs/DemoScript.md only |
| ux-design | docs/PRD.md, docs/DECISIONS.md | docs/UX.md (if the project has a UI; includes a Claude Design Prompts section for generating UI mockups externally), design report | docs/UX.md and docs/UX-archive.md (append-only) only |
| architect | docs/PRD.md, docs/UX.md (if present), docs/CodingRules.md | docs/Architecture.md, docs/API.md (if required), docs/Database.md (if required), docs/DECISIONS.md entries, docs/adr/ records, design report | docs/Architecture.md, docs/API.md, docs/Database.md, docs/DECISIONS.md, docs/adr/ only |
| implementer | docs/PRD.md, docs/Architecture.md, docs/CodingRules.md, docs/GitWorkflow.md, docs/Tasks.md, docs/API.md, docs/Database.md, docs/UX.md, docs/DefinitionOfDone.md | Source code, implementation report | Source code; the Status column of its own task row in docs/Tasks.md only (recommend other doc updates; never silently change them) |
| reviewer | git diff (preferred), files explicitly specified by the caller, project documentation, docs/GitWorkflow.md, docs/UX.md (if present) | Review report (Status: APPROVED / REJECTED) | Nothing |
| quality-assurance | git diff (preferred), files explicitly specified by the caller, project documentation, docs/DefinitionOfDone.md, docs/UX.md | Test report (Release Recommendation: GO / NO-GO) | Nothing |
| debugger | The defect report (symptom, reproduction steps, failing output), source code, git history, project documentation, docs/UX.md (if the defect is UI-visible) | Diagnosis report (Root Cause + Proposed Fix + Failing Test Specification; Routing: implementer / architect / user) | Nothing |
| docs | Project changes (git diff), README.md, docs/CHANGELOG.md, other project documentation (read-only, to detect drift) | Updated README.md/docs/CHANGELOG.md, rows appended to docs/UpdateRequests.md for documents it doesn't own, documentation summary | README.md, docs/CHANGELOG.md, docs/UpdateRequests.md (append-only) |
| planner / ux-design / architect | (in addition to their existing inputs) docs/UpdateRequests.md rows naming them as Owning Agent | (in addition to existing outputs) resolved Status on the rows they acted on | (in addition to existing scope) docs/UpdateRequests.md Status column, rows they own only |

## Document Ownership

| Document | Owner (creates/updates) | Everyone else |
|---|---|---|
| CLAUDE.md | User | Read-only |
| AGENTS.md | User | Read-only |
| README.md | docs | Read-only |
| docs/PRD.md | planner | Read-only. docs reports drift as an Update Request; only planner edits |
| docs/Tasks.md | planner | Read-only, except implementer may update the Status column of its own task row |
| docs/TestCases.md | planner | Read-only for case definitions — only planner adds/changes/removes cases. implementer and quality-assurance may append rows to the 실행 기록 table (recording a run is not editing a case). A case is never deleted to make a number look better; it is marked `제외` with a reason |
| docs/DemoScript.md | planner | Read-only for scene definitions — only planner edits. Whoever runs a rehearsal may append rows to the 리허설 기록 table. Demo inputs are not authored here: docs/TestCases.md is their single source |
| docs/UX.md | ux-design | Read-only. docs reports drift as an Update Request; only ux-design edits |
| docs/UX-archive.md | ux-design (append-only) | Read-only. Overflow archive for old Deprecated UX entries; archived IDs stay reserved |
| docs/Architecture.md | architect | Read-only. docs reports drift as an Update Request; only architect edits |
| docs/API.md | architect | Read-only. docs reports drift as an Update Request; only architect edits |
| docs/Database.md | architect | Read-only. docs reports drift as an Update Request; only architect edits |
| docs/DECISIONS.md | architect | Read-only. docs reports drift as an Update Request; only architect edits |
| docs/adr/ | architect | Read-only (ADRs are immutable once accepted) |
| docs/CodingRules.md | User (or architect on request) | Read-only |
| docs/GitWorkflow.md | User | Read-only (implementer follows) |
| docs/DefinitionOfDone.md | User | Read-only (implementer/QA enforce) |
| docs/PromptRules.md | User | Read-only |
| docs/CHANGELOG.md | docs | Read-only |
| docs/UpdateRequests.md | docs | Read-only, except the named Owning Agent (planner/ux-design/architect) may flip a row's Status from `open` to `resolved` |
| Source code | implementer | Read-only |
| .claude/agents/*.md | User | Read-only. An agent's own definition file is not something it edits at runtime |
| .claude/memory-protocol.md | User | Read-only |
| .claude/settings.json | User | Read-only. Wires the hooks below; not something an agent edits to work around a block |
| .claude/hooks/** | User | Read-only. Deterministic guards (no direct commits/push to main, no `--no-verify`/hook-skip flags, no reading/writing `.env`) that back the corresponding prose prohibitions in CLAUDE.md/AGENTS.md/GitWorkflow.md with an enforced block instead of relying on the agent remembering the rule. Includes `lib/` (shared helper code) and `README.md` (the guard-script coding rule, distinct from docs/CodingRules.md) |

## Document Priority

Each agent's own file defines which documents are Required (always read if available) vs. Optional (read only when relevant to the current task) — this keeps agents from burning context on documents outside their role. When documents an agent actually reads conflict, the higher-priority one below takes precedence:

1. CLAUDE.md
2. AGENTS.md
3. docs/PRD.md
4. docs/UX.md
5. docs/UX-archive.md
6. docs/Architecture.md
7. docs/DECISIONS.md
8. docs/adr/
9. docs/CodingRules.md
10. docs/GitWorkflow.md
11. docs/DefinitionOfDone.md
12. docs/Tasks.md
13. docs/API.md
14. docs/Database.md
15. docs/PromptRules.md
16. README.md
17. docs/CHANGELOG.md
18. docs/UpdateRequests.md

README.md and docs/CHANGELOG.md rank below the spec documents because they are derived from them (docs keeps them synchronized) — a derived document must never win a conflict against the spec it was derived from.

## Project Structure

```
project/
├── .claude/
│   ├── agents/           # the eight agent definitions (User-owned)
│   ├── hooks/            # PreToolUse guard scripts (User-owned; README.md has the coding rule, lib/ has shared helpers)
│   ├── memory-protocol.md
│   └── settings.json     # wires the hooks/ scripts to PreToolUse events
├── .env.example          # placeholders only — .env itself is git-ignored, never committed
├── .gitignore
├── CLAUDE.md
├── AGENTS.md
├── README.md
└── docs/
    ├── PRD.md
    ├── UX.md
    ├── UX-archive.md
    ├── Architecture.md
    ├── Tasks.md
    ├── CodingRules.md
    ├── Database.md
    ├── API.md
    ├── CHANGELOG.md
    ├── DECISIONS.md
    ├── DefinitionOfDone.md
    ├── GitWorkflow.md
    ├── PromptRules.md
    ├── UpdateRequests.md
    └── adr/
        └── 0001-....md
```
