# Changelog

All notable changes to this Starter Kit will be documented in this file.

This file tracks changes to the **kit itself**. It stays at the kit's root and is not copied into new projects — new projects get `docs/CHANGELOG.md` (a blank template) instead.

Version policy: once a version's section has been pushed, it is closed. Later changes open a new version section rather than being appended to it — a pushed section with entries dated after its own header can no longer be read as a record of what shipped when.

## [1.7.9] - 2026-08-02

Follow-up to 1.7.8: two of the three findings deferred there (A2, Q1) were revisited and adopted; the third (P1, PRD Success Metrics) was kept deferred — this kit's pipeline has no downstream stage that consumes a success-metrics field, so adding one risked an always-empty placeholder.

### Added
- docs/Architecture.md "Observability" section + matching architect responsibility (A2): logging shape, error-tracking/monitoring service (or "logs only for MVP"), and operational metrics — every row filled or an explicit "N/A — reason". Connects directly to 1.7.8's Error Handling section (a caught error is only useful if it's also visible) and CLAUDE.md's no-secrets-in-logs rule.
- quality-assurance Accessibility & Responsive verification (Q1): when docs/UX.md exists, QA now checks the screens a change touches against docs/UX.md's Accessibility and Responsive Behavior sections, reporting `NOT COVERED` (with reason) rather than PASSED when a check can't be exercised — closes the one UX property ux-design specifies that nothing downstream verified. New "Accessibility & Responsive Results" output table alongside the existing AC Results table.

## [1.7.8] - 2026-08-02

Cross-agent audit pass (same external-checklist method as 1.7.7, applied to the seven other agents). Six selected findings fixed; deferred by user decision: planner Success Metrics, architect observability design, QA accessibility/responsive verification.

### Added
- AGENTS.md "Severity Scale" — Critical/Major/Minor defined once, shared by reviewer and quality-assurance (R1). Previously reviewer's REJECTED trigger ("any Critical Issue") and QA's "prioritize by severity" both rested on a term no document defined, so the reject/pass boundary was per-run improvisation. Both agents now cite the scale and must not invent per-run criteria; an uncovered finding is reported at the closest severity with a note, never silently classified.
- docs/Architecture.md "Error Handling" section + matching architect responsibility (A3): where exceptions are caught, how failures surface to the user (mapped to docs/UX.md error states when present), and how errors cross module boundaries — every row filled or an explicit "N/A — reason".
- docs/PRD.md "Non-functional Expectations" section + matching planner responsibility (P2): product-level performance feel and scale (concurrent users, data volume) confirmed by the user at the PRD gate; "no specific expectation" is a valid entry, blank is not. Technical means stay architect's.
- docs/CHANGELOG.md template: semantic version-bump rule (major = breaking, minor = new user-visible feature, patch = fix/doc-only), applied by the docs agent when opening a release section (D1).

### Changed
- architect workflow step 9 now recommends a test runner/framework alongside the linter and formatter (A1) — the DoD Gate requires attached red/green test runs, but no agent owned choosing how tests are written and executed; that decision is now explicitly architect's, made with the stack.
- implementer's dependency rule (I1): when a task genuinely requires a new dependency, implementer must report it (name, version, why, alternatives considered) so architect can record the docs/DECISIONS.md entry its Security Design Checklist expects — implementer cannot edit DECISIONS.md, so a dependency visible only in the lockfile was a decision that never got recorded.

## [1.7.7] - 2026-08-02

### Added
- ux-design.md: "Required when docs/UX.md already exists" clause (matches the conditional-required pattern already used by architect.md) — previously the file's own prior output was listed as merely Optional, so nothing forced it to be read before revalidating in place.
- Screen Catalog template gained a "UI Elements" field (inventory only — input fields, buttons, lists, cards, menus, search/filter, nav — not styling/layout) so implementer isn't left inferring what's on a screen from its actions alone.
- Interaction Patterns list expanded with edge cases that had no explicit coverage: duplicate/double-click submission, stale or already-deleted data, very long text/overflow, slow response.
- Information architecture responsibility now explicitly covers back/cancel behavior, direct URL access, and pre-/post-login redirect behavior, not just the forward navigation targets already captured per-screen.
- Deprecated entries (Rules, Workflow step 2, and the Deliverables list) now require a deprecation date and a replacement Screen/Flow ID (or "no replacement") alongside the reason, closing a gap where a Deprecated entry could be dated and traced to nothing.

### Changed
- Screen Catalog's Validation field now has a required-content checklist (required fields, invalid-format handling, length limits, duplicate detection, submit-enabled condition, error display location, clear-on-correction) instead of accepting "validates input" as sufficient.
- Screen Catalog's Failure field now requires a stated recovery action (retry, alternate path, or destination) — a bare error message with no next step is an incomplete Failure entry.
- Claude Design Prompts now restate a screen's UI Elements alongside its other Screen Catalog fields, since a mockup prompt without a component inventory was missing exactly what a mockup needs.

## [1.7.6] - 2026-08-02

### Added
- README.md "Agent Model Assignments" — a table giving the one-line rationale behind every agent's `model:` choice (why planner/architect/reviewer/debugger/quality-assurance are `opus`, why ux-design/docs are `sonnet`, why implementer is `inherit`), so the reasoning behind 1.7.5's swap and the pre-existing assignments isn't only recoverable from CHANGELOG archaeology.
- docs/PromptRules.md orchestrator rule: implementer's `model:` is `inherit`, but the orchestrator should override it per task via the Agent tool's `model` parameter rather than leaving every invocation at whatever the session happens to be on. Adds an if/then table (1–2 files / 1 AC / pattern reuse → `sonnet`; cross-module, new architectural pattern, security/auth/concurrency, or cross-document contradiction → `opus`; anything else → ask the user) so the same judgment isn't made ad hoc per session.

## [1.7.5] - 2026-08-02

### Changed
- ux-design demoted from `opus` to `sonnet` — its work is template-driven (fixed User Flow/Screen Catalog shapes) and checklist-based (duplicate-ID and cross-reference consistency checks), matching the reasoning load already assigned to `sonnet` for quality-assurance and docs rather than the open-ended judgment calls `opus` is reserved for.
- quality-assurance promoted from `sonnet` to `opus` — its "Validate meaning, not just structure" rule requires judging whether generated output (model responses, templated copy, translations) is factually correct and non-misleading, not just structural/checklist verification; that is the same class of judgment already reserved for `opus` elsewhere (reviewer, debugger). Previously deferred as I3 during an earlier audit pass.

## [1.7.4] - 2026-08-02

### Added
- docs/UX.md Screen Catalog gained an optional "Figma Frame" field (ux-design-owned, like every other Screen Catalog row) — once the user approves a Figma frame as a screen's visual reference, ux-design records its URL there, the same sync-back the Claude Design mockup rule already required. Closes a traceability gap in 1.7.3's Figma section: implementer can't edit docs/UX.md, so without this field the approved frame URL only ever existed in chat, with no record of which frame a given screen was actually built against once the Figma file moved on.
- README.md's Figma section now formalizes the optional write direction (code → Figma) alongside the existing read direction: after implementing a screen, implementer may push it back to Figma as an editable design-review artifact — on request only, with the user's explicit confirmation for each specific push, since it writes into a real shared external account (same standing as any other publish-style action). The pushed artifact stays a downstream reference; feedback on it re-enters through the normal mockup-deviation flow into docs/UX.md, never straight into source code.
- docs/PromptRules.md's external-data-source rule extended to name both of the above: the Figma Frame field as the URL's single source of truth (not re-solicited from the user every implementer invocation), and the write-direction confirmation requirement.

## [1.7.3] - 2026-08-02

### Added
- README.md "Optional: connect Figma" — same per-project opt-in shape as the existing visual-quality-skill section, never baked into the shared agent templates (not every project uses Figma, and it needs an authenticated account). Read direction only (design → code): implementer pulls exact tokens/layout/component structure from an approved Figma frame via the Figma MCP instead of eyeballing a static mockup image. Changes fidelity, not authority — the existing Claude Design mockup rule extends to it verbatim: docs/UX.md stays authoritative for states, validation, interaction patterns, and accessibility.
- docs/PromptRules.md: extended the external-plugin boundary rule to cover project-added MCP data sources generally (Figma named as the example) — their output feeds the invoking agent, never bypasses it; a Figma detail absent from docs/UX.md is a spec gap reported to ux-design, not something implementer fills in silently.

## [1.7.2] - 2026-08-02

### Added
- Three stack-agnostic PreToolUse hooks (`.claude/hooks/*.js`, wired in `.claude/settings.json`) that enforce prohibitions previously stated only in prose: `block-main-writes.js` blocks `git commit` while on main/master and `git push` targeting it (docs/GitWorkflow.md "No direct commits to main"); `block-no-verify.js` blocks `--no-verify`/`--no-gpg-sign`/hook-bypass git flags (CLAUDE.md/AGENTS.md); `block-env-access.js` blocks Read/Edit/Write on `.env` and Bash commands that would print or overwrite it (CLAUDE.md Secrets Management), while leaving `.env.example` untouched. Written in Node.js (already required to run Claude Code, so no new dependency for a template with no fixed stack yet) and manually verified against 11 allow/block cases before commit. AGENTS.md's Document Ownership table and Project Structure diagram now list `.claude/settings.json` and `.claude/hooks/` as User-owned.

### Fixed
- docs/PRD.md Problem Statement Status row had a `{{}}` placeholder nested inside another — the exact defect class 1.4.0 fixed in the Monetization Status row, reintroduced by 1.7.1
- AGENTS.md Contract Table listed ux-design's Input as docs/PRD.md alone, omitting the docs/DECISIONS.md that ux-design.md reads as Required #5 — same drift class as the 1.6.2 architect/CodingRules fix
- docs/PRD.md's Open Questions preamble and docs/PromptRules.md's foundational-choices list both predated the 1.6.4 granularity expansion: PRD's list gained "target users and scale" and "connectivity requirement"; PromptRules' list is now split into planner's product set and architect's technical set with all 1.6.4 sub-items (connectivity, database engine vs. hosting as separate decisions, real-time/websocket, first-release scope)
- docs/PromptRules.md had no orchestrator rule for the Problem Statement gate (1.7.0's core mechanism): a new rule requires relaying each PS block and the Monetization recommendation for explicit approve/override/reject at the PRD gate — a Status still `proposed` after the gate means the gate didn't happen. The pipeline diagram's planner gate now names this too
- planner.md's summary of architect's foundation set listed 4 of its 7 items — now names all of them

### Changed
- Problem Statement gained the same escape hatch Monetization has: when the user already prescribed the solution to a problem, planner refines the prescription (Status `user-approved (prescribed in the request)`) instead of manufacturing three competing flavors around a settled decision; a concern is raised as an Open Question naming a concrete risk, never as a competing pitch
- CLAUDE.md's startup-priority ladder now mirrors the pipeline order: PRD → Tasks (both from planner) → UX (UI projects) → Architecture — previously it skipped the ux-design stage entirely and placed Tasks after Architecture, though planner produces Tasks before architect runs
- Open Questions Status values are now defined (`open` → `answered`, outcome in the Decision column) in both docs/PRD.md and docs/UX.md — previously no document said what Status becomes after a decision
- README.md's Documentation table gained the missing CLAUDE.md row

### Removed
- `NotebookEdit` from the 5 agents that listed it (planner, ux-design, architect, implementer, docs) — zero references in any agent's instructions (verified by grep), and this pipeline edits markdown and source, not Jupyter notebooks; same zero-reference criterion as the 1.6.2 tool removal

## [1.7.1] - 2026-08-02

### Changed
- docs/PRD.md's Problem Statement (1.7.0) restructured from one flat row per problem to a repeated block (matching docs/UX.md's User Flows pattern), because a single "Recommended Solution Idea" cell only ever proposed one idea. Each problem now gets at least 3 candidate ideas spanning genuinely different registers — Refined (the well-validated, conventional answer), Inventive (a less obvious angle that reframes the problem), Unconventional (deliberately out-of-the-box, kept even when unlikely to be picked because it can surface an assumption the safe options share) — plus a Recommended pick with reasoning. A hedged restatement of the Refined idea doesn't count as the Inventive or Unconventional entry; a genuinely weak option there gets said so, not padded.

## [1.7.0] - 2026-08-02

### Added
- docs/PRD.md "Problem Statement" section (planner-owned, new PS-xxx ID space) — before scoping any feature, planner decomposes the user's request into individual, concrete problems (what goes wrong, for whom, today — not the solution already assumed), proposes a solution idea with reasoning for each, and the user approves, overrides, or rejects per row at the PRD gate. Same propose-then-approve pattern as Monetization; a rejected row stays in the table with a reason rather than being deleted. MVP Scope now carries a "Solves Problem(s)" column referencing PS-xxx, so a feature with no problem behind it surfaces as an Open Question instead of entering scope silently — closes the one stage (problem definition) that was previously folded wordlessly into the Goal one-liner instead of being its own reasoned, traceable step.

## [1.6.4] - 2026-08-02

### Changed
- planner's and architect's foundation-question sets (1.6.0) are broken into explicit sub-items instead of one bundled bullet each — planner: platform (with web responsive/desktop-first and mobile OS split-out), target users *and scale* (personal/team/public — drives most downstream decisions), delivery channel, connectivity requirement (offline vs. always-online), monetization, first-release scope; architect: language, framework, database engine *and* database hosting as two separate decisions (previously one bundled item), deployment target, auth approach (build vs. provider), real-time/websocket requirement. The product/technical boundary between the two gates is unchanged — architect's items were not added to planner's set or vice versa.
- ux-design's Open Questions "Suggested Resolution" column is now an explicit rule, not just a template column: always propose a recommendation, leave blank only when there is genuinely no basis to recommend one way and say so — matches the recommendation-required rule planner and architect already followed.

## [1.6.3] - 2026-08-02

### Fixed
- CLAUDE.md's `---` section separators covered only the file's top four sections; the previous fix (1.6.2) matched that local pattern without checking the rest of the file. A full re-read found five more section transitions (Project Overview, Verified Commands, Report Template, Agent Workflow, Change Workflow) with no separator at all — added, so every section boundary in the file is now consistent.

## [1.6.2] - 2026-08-02

### Fixed
- docs/PromptRules.md's verbatim-relay rule stated the same requirement twice — a narrow instance ("pass reviewer/QA reports verbatim") immediately followed by the general rule that already covered it — merged into one bullet
- All 8 agents listed `ListMcpResourcesTool`, `ReadMcpResourceDirTool`, `ReadMcpResourceTool`, `TaskCreate`, `TaskGet`, `TaskList`, `TaskStop`, `TaskUpdate` in their `tools:` frontmatter with zero references anywhere in any agent's instructions (verified by grep) — this pipeline tracks tasks through docs/Tasks.md, not the Task tool, and doesn't browse MCP resources; removed from all 8
- CHANGELOG [1.5.0] was headed 2026-07-28, the date of [1.4.0] beneath it — the commits are dated 2026-07-29
- AGENTS.md's Contract Table listed architect's Input without docs/CodingRules.md, though architect.md reads it as Required #6
- CLAUDE.md's Documentation Maintenance section had no `---` separator after it, unlike every other section in the file

## [1.6.1] - 2026-08-02

### Fixed
- docs/PRD.md Open Questions had no column for a recommendation, so planner's new foundation rule (1.6.0) had nowhere to write one — the table now carries Recommendation / Reason / If decided otherwise, matching what docs/UX.md's Open Questions already supported
- ux-design.md attributed docs/DECISIONS.md to planner; it is architect-owned. The rule now names the correct owner for each document it forbids editing
- docs.md omitted docs/Tasks.md from both its "you do not own" list and its never-edit rule while its routing text already said "planner (PRD/Tasks)" — Tasks.md reads as editable because implementer touches its Status column, so the exception is now stated explicitly
- planner and implementer had responsibilities that never reached their Workflow sections: planner's Workflow now covers foundation questions, Monetization, and Delivery & Deployment; implementer's now has the test-first red/green steps that the DoD Gate requires

## [1.6.0] - 2026-08-02

### Added
- Foundation-by-question rule: planner (product foundations — platform, target users, delivery channel, monetization posture) and architect (technical foundations — language, framework, database, hosting, auth) must surface undecided foundations as Open Questions **with a recommendation, reason, and strongest alternative attached**, never silently defaulting; docs/PromptRules.md requires the orchestrator to relay these to the user as explicit questions (AskUserQuestion, recommendation first) at the planner/architect approval gates and never answer them on the user's behalf. Subagents cannot ask the user mid-run (contract: report, then finish), so the ask happens at the gate via the orchestrator.

## [1.5.0] - 2026-07-29

Hardening pass from an external multi-agent post-mortem (a months-long project's failures generalized). Three of its findings had already been hit and fixed independently during this kit's own pipeline run — the convergence is why the remaining ones were adopted.

### Added
- **Duty to Refute** (AGENTS.md) — standing authority for every agent to stop and refute when the invoking instruction rests on a demonstrably false premise, reporting the evidence instead of completing the task as framed. Previously the contract only covered *ambiguity* (Open Questions); a false premise had no defined response, and work built on one is wrong in a way no downstream gate detects. Refutation and Open Question are now explicitly distinguished.
- Two AGENTS.md prohibitions applying to every agent: no universal claim ("all", "none", "every") without measuring every instance, with unchecked items reported as `unverified` rather than passing; and every figure/path/identifier marked **measured** vs. **cited**, with no verdict resting on a cited value alone.
- reviewer: "Reproduction is the default, not an option" — verifiable claims in the implementation report are re-executed rather than read and judged plausible, including re-confirming that an attached red run would actually fail. Claims that cannot be re-verified without editing files are reported as `accepted on report`, a visible category rather than a silent one.
- quality-assurance: **meaning validation** for generated output (model responses, templated copy, translations) — structural checks (non-empty, schema-valid, substring present) may not stand as evidence that content is correct, and are reported on separate lines from semantic checks. Mirrored as a docs/CodingRules.md test principle.
- quality-assurance: Runtime Verification runs on a self-chosen port rather than the project default, since "the port was busy" is the most common reason runtime checks are perpetually deferred — and a perpetually deferred check is indistinguishable from a failing one.
- docs/PromptRules.md orchestrator rules: search the decision records (DECISIONS.md, Planning Decisions, UX Decision Log, adr/) before asking any agent to decide something already decided; label prompt figures as measured or cited; and enforce concurrency isolation with the run option (`isolation: "worktree"`) rather than prompt wording, which has been observed not to take effect.
- **Delivery planned from the start**: new docs/PRD.md "Delivery & Deployment" section (planner-owned — target environment, distribution channel, release cadence, environments, release constraints, downtime tolerance, rollback expectation, and whether deployment is in MVP scope) and a matching docs/Architecture.md "Deployment" section (architect-owned — hosting target, build/release pipeline, environment promotion, per-environment config, state migration, rollback procedure, health check). planner states what delivery must achieve and breaks in-scope deployment into real Tasks.md tasks; architect designs the mechanism against it. Previously the pipeline ended at merge and docs, so delivery lead times — app-store review, compliance sign-off, an unregistered domain — surfaced only after the MVP boundary had stopped being movable. Same propose-then-design split already used for Monetization and Security.

## [1.4.0] - 2026-07-28

### Added
- docs/PromptRules.md rules for marketplace-installed plugins: external agents/skills sit outside the AGENTS.md contract and may only feed a contract agent as input, never edit owned documents or source; visual-quality skills apply at the implementer step to appearance only, and must be given the approved mockup's aesthetic direction so they execute it rather than inventing a new one
- README.md "Optional: pin a visual design language" — how to preload a visual skill into implementer via the `skills:` frontmatter field, and the boundary that docs/UX.md still governs behavior
- quality-assurance Runtime Verification step — when an Acceptance Criterion describes user-observable behavior a test suite cannot demonstrate (persistence across reload, rendering, navigation), QA runs the app and reports what it observed, or reports the AC as NOT COVERED with the reason
- architect workflow step: recommend a concrete linter/formatter with the tech stack, so docs/CodingRules.md's Style placeholders get filled before the first DoD gate instead of forcing a lint-skip approval every release
- CHANGELOG version policy — a pushed version section is closed; later changes open a new section

### Fixed
- CLAUDE.md Change Workflow listed the pre-debugger bug-fix route only; it now distinguishes a known cause (straight to implementer) from an unknown one (debugger first) — this file is copied into every new project, so the stale route would have propagated
- AGENTS.md pipeline diagram omitted the merge step that docs/PromptRules.md already documented, and drew debugger's routing as implementer-only when it is three-way (implementer / architect / user)
- AGENTS.md Project Structure now lists `.claude/`, `.env.example`, and `.gitignore` — `.claude/agents/*.md` and `.claude/memory-protocol.md` appeared in the Ownership table but in no structure diagram
- AGENTS.md contract table listed planner's input as "User request, docs/DECISIONS.md", omitting the docs/PRD.md and docs/Tasks.md it actually reads as Required and overstating DECISIONS.md, which planner.md lists as Optional
- docs/PRD.md Monetization Status row had a `{{}}` placeholder nested inside another

## [1.3.0] - 2026-07-27

### Added
- Eighth subagent: **debugger** (root cause diagnosis; never fixes) — closes the harness's only methodology gap, where an undiagnosed defect went straight back to implementer with no diagnostic procedure. Four-phase workflow (reproduce and gather evidence → compare working vs. broken → test one hypothesis at a time → report), `file:line` root cause, a Failing Test Specification for implementer, and `Routing: implementer / architect / user`. Read-only like reviewer and quality-assurance, and deliberately memory-less so a remembered past cause can't anchor a new diagnosis. Concepts absorbed from the `systematic-debugging` methodology; no plugin dependency.
- Two-failed-fixes escalation rule — implementer stops instead of attempting a third fix; the defect goes to debugger, which routes it to architect when the evidence points at the design (matches CLAUDE.md's "2번 실패 → 3번째 반복 금지")
- docs/DefinitionOfDone.md Gate item: each new test must have a failing (red) run attached next to its passing run. The previous Gate accepted "tests exist and pass", which a test retrofitted to match the implementation satisfies without proving anything; quality-assurance now treats a green-only test as an unmet Gate item

## [1.2.0] - 2026-07-24

### Added
- architect Security Design Checklist (auth, secrets, sensitive data, validation boundaries, attack surface, dependency risk, abuse cases) — outcomes recorded in Architecture.md's new Security section, which replaces the bare Authentication/Authorization section; every row requires a decision or an explicit "N/A — reason"
- planner Monetization design — new PRD.md Monetization section: planner proposes 1–3 candidate revenue models (fit/pros/cons), recommends one with reasoning and a starting pricing shape; the user approves or overrides at the PRD gate (Status row records the outcome); non-commercial products state "N/A — non-commercial" explicitly

## [1.1.0] - 2026-07-23

### Added
- Seventh subagent: **ux-design** (user flows, screen specs, Claude Design prompts for generating visual mockups externally)
- docs/UX.md and docs/UX-archive.md (overflow archive for retired UX entries; archived IDs stay reserved)
- docs/PRD.md "Planning Decisions" section — the authoritative record for planner's scope/priority decisions, separate from architect-owned docs/DECISIONS.md
- docs/DefinitionOfDone.md Gate/Closure split — Gate items block the `done` transition and are checked by quality-assurance; Closure items (docs sync, CHANGELOG) complete afterward at the docs step, closing a prior circular dependency
- `.claude/memory-protocol.md` — shared persistent-memory protocol referenced by planner/architect/implementer/ux-design, replacing ~140 duplicated lines per agent
- GitWorkflow.md "Who Merges" section — merges to `main` are the orchestrator's/user's job, not a subagent's; verify checkout before merging
- GitWorkflow.md merge policy decided: fast-forward preferred, merge-commit as fallback, never squash

### Changed
- docs agent granted read-only Bash (`git diff`/`status`/`log`) so it can execute its own documented workflow
- architect and implementer now treat docs/UX.md as Required-when-applicable instead of Optional; implementer likewise for docs/DefinitionOfDone.md and docs/GitWorkflow.md
- reviewer promoted to `opus` (was `sonnet`) so the verifier is never weaker than an `inherit`-model implementer; reviewer now always emits Action Items for Critical/Major findings regardless of APPROVED/REJECTED status
- Agent contract requires reviewer to run strictly before quality-assurance (QA's gate depends on reviewer's verdict)
- Document Priority reordered: README.md and docs/CHANGELOG.md now rank below the spec documents they're derived from
- Agent memory scope corrected from `project` to `user` (matches actual storage path); ux-design granted persistent memory to match the other design-phase agents
- PromptRules.md "pass reports verbatim" rule extended to every cross-agent relay, not just fix re-invocations

### Fixed
- ux-design's dependency on docs/DECISIONS.md corrected — planning-level exclusions live in PRD's Planning Decisions (planner-owned), not in architect-owned DECISIONS.md
- AGENTS.md Document Priority and Project Structure now list docs/UX-archive.md (was present in the ownership/contract tables but missing from these two)

## [1.0.0] - 2026-07-14

### Added
- Initial Claude Code Starter Kit
- Six project subagents
  - planner
  - architect
  - implementer
  - reviewer
  - quality-assurance
  - docs
- CLAUDE.md
- AGENTS.md
- Project documentation templates
- ADR template
- Decision Log
- Definition of Done
- Git Workflow
- Prompt Rules

### Changed
- Switched to project-local `.claude/agents`
- Standardized documentation under `docs/`
- Introduced Required / Optional document loading
- Added document priority rules
- Added Authority model
- Added Decision logging
- Added Git diff–based review workflow

### Notes
Project-local agents take precedence over user-global agents (`~/.claude/agents`) following Claude Code's documented behavior.
