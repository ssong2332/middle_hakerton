# Claude Code Starter Kit

A production-ready Starter Kit for Claude Code projects: 8 specialized subagents, a documented agent contract, and a full project-documentation template set.

## Features
- ✅ 8 Specialized Subagents (planner, ux-design, architect, implementer, reviewer, quality-assurance, debugger, docs)
- ✅ CLAUDE.md
- ✅ AGENTS.md (Agent Contract: Authority, Input/Output, Ownership, Document Priority)
- ✅ PRD Workflow
- ✅ UX Workflow (user flows, screen specs, Claude Design prompts for visual mockups)
- ✅ Architecture Workflow
- ✅ Decision Log
- ✅ ADR
- ✅ Definition of Done (Gate + Closure checklists, test-first evidence required)
- ✅ Systematic Debugging (root-cause-before-fix, diagnosis separated from repair)
- ✅ Git Workflow
- ✅ Prompt Rules

## Agent Model Assignments

Each agent's `model:` frontmatter reflects the reasoning load its role actually requires, not a default. `opus` is reserved for open-ended judgment where a weaker model tends to produce a confident wrong answer rather than an honest gap; `sonnet` covers roles that are template-driven or checklist-verifiable.

| Agent | Model | Why |
|---|---|---|
| planner | opus | Must generate genuinely distinct candidate solutions (Refined/Inventive/Unconventional) and a monetization strategy, not three phrasings of one idea — creative/strategic judgment that every downstream document is built on |
| ux-design | sonnet | Work is template-driven (fixed User Flow/Screen Catalog shapes) and checklist-based (duplicate-ID and cross-reference consistency checks) |
| architect | opus | Foundational, expensive-to-reverse technical decisions (language, framework, database, auth, hosting) plus security-checklist judgment that everything downstream is built on |
| implementer | inherit | Follows the orchestrating session's current model — lets the user dial cost/quality per task by switching models before invoking it |
| reviewer | opus | Contract requires re-executing claims rather than accepting them ("Reproduction is the default"), and catching subtle correctness/security issues a shallow pass would miss |
| quality-assurance | opus | "Validate meaning, not just structure" requires judging whether generated output is factually correct and non-misleading, not just checklist/schema verification |
| debugger | opus | Root-cause diagnosis is multi-step hypothesis testing (state → test → confirm/disconfirm), not lookup — a weak model tends to report a plausible-sounding wrong cause as fact |
| docs | sonnet | Drift detection and README/CHANGELOG sync is rule-based comparison against existing documents |

## Quick Start
1. Use this repository as a GitHub Template.
2. Clone your new repository.
3. Open Claude Code.
4. Ask:
   ```
   planner 에이전트로 요구사항 정리해줘
   ```
5. Once the PRD is approved, if the project has a user-facing UI:
   ```
   ux-design 에이전트로 UX 설계해줘
   ```

### Optional: pin a visual design language

The agents specify *what* a screen does; they don't fix *how it looks*. For a UI project that should not ship generic-looking output, preload a visual-quality skill into implementer by adding one line to `.claude/agents/implementer.md`'s frontmatter:

```yaml
skills:
  - frontend-design      # or another visual skill, e.g. nothing-design
```

The skill's full content loads at implementer startup, so it applies without implementer having to invoke anything. It governs visual execution only — `docs/UX.md` stays authoritative for states, validation, and accessibility. See the visual-quality rule in `docs/PromptRules.md` before using this alongside approved Claude Design mockups.

### Optional: connect Figma

Not every project uses Figma, and it needs an authenticated account, so it is never wired into this kit's shared agent templates — add it per-project, the same way as the visual-quality skill above. Add the Figma MCP tool to `.claude/agents/implementer.md`'s `tools:` frontmatter.

**Read direction (design → code, the default use).** Once the user approves a Figma frame as a screen's visual reference, ux-design records the frame's URL in that screen's Screen Catalog entry in `docs/UX.md` (the Figma Frame field) — the same way an approved Claude Design mockup gets synced back into the spec. implementer then reads the URL from there rather than needing it re-pasted into every prompt, and pulls exact tokens, layout, and component structure instead of eyeballing a static mockup image. This changes *fidelity*, not *authority*: `docs/UX.md` remains the authoritative spec for states, validation, and accessibility, and a Figma frame may not introduce a UI decision `docs/UX.md` doesn't already specify. See docs/PromptRules.md's external-data-source rule before combining this with a visual-quality skill.

**Optional write direction (code → Figma).** After a screen is implemented, implementer may push the built result back to Figma as an editable artifact for design review — on request only, never automatically, and only after the user explicitly confirms that specific push (it writes into a real, shared external account, the same standing as any other publish-style action). The pushed artifact is a downstream reference, not a new source of truth: if the design team edits it and wants a change, that feedback goes back through the normal mockup-deviation flow (an approved change gets synced into `docs/UX.md` by ux-design) rather than flowing straight from Figma into source code.

> After cloning, replace this README with your own project's README (`## Overview` / `## Getting Started` / the Documentation table below are a good starting shape). Fill in the `{{placeholders}}` in `CLAUDE.md`. Do **not** carry over this kit's root `CHANGELOG.md` — your project starts from the blank `docs/CHANGELOG.md` instead. Full agent invocation guide: `docs/PromptRules.md`.

## Configuration

This project uses a `.env` file for local secrets and configuration, which is git-ignored and never committed.

1. Copy the example file:
   ```
   cp .env.example .env
   ```
2. Fill in the values in `.env`:

   | Variable | Purpose |
   |---|---|
   | `YOUR_API_KEY` | API key for external service integration |
   | `YOUR_SECRET` | Application secret (session signing, encryption, etc.) |
   | `DATABASE_URL` | Database connection string |

3. When the architecture is defined and new environment variables are introduced, add them to `.env.example` (placeholder value only) and to this table.

## Documentation
| Document | Purpose |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Project rules: startup behavior, secrets management, prohibitions, report template |
| [AGENTS.md](AGENTS.md) | Agent contract: I/O, ownership, priority |
| [docs/PromptRules.md](docs/PromptRules.md) | How to invoke each agent |
| [docs/PRD.md](docs/PRD.md) | Requirements and MVP scope |
| [docs/UX.md](docs/UX.md) | User flows, screens, Claude Design prompts (UI projects only) |
| [docs/UX-archive.md](docs/UX-archive.md) | Overflow archive for retired UX.md entries |
| [docs/Architecture.md](docs/Architecture.md) | System design |
| [docs/API.md](docs/API.md) | API surface (if the project exposes one) |
| [docs/Database.md](docs/Database.md) | Schema (if the project has one) |
| [docs/Tasks.md](docs/Tasks.md) | Implementation tasks and status |
| [docs/CodingRules.md](docs/CodingRules.md) | Coding standards |
| [docs/GitWorkflow.md](docs/GitWorkflow.md) | Branch/commit/PR rules |
| [docs/DefinitionOfDone.md](docs/DefinitionOfDone.md) | Completion criteria (Gate + Closure) |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decision log (details in docs/adr/) |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Release history |
| [docs/UpdateRequests.md](docs/UpdateRequests.md) | Cross-agent drift reports awaiting action |
