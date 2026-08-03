# Definition of Done — {{project-name}}

Owner: User. Gate checklist enforced by implementer (self-check) and quality-assurance (gate); Closure checklist completed at the docs step after GO.
A task's Status may become `done` in docs/Tasks.md only when every Gate item passes AND quality-assurance has returned Release Recommendation: `GO`.

## Gate Checklist (checked by quality-assurance before GO)
- [ ] Acceptance Criteria (AC-xxx in docs/PRD.md, referenced by docs/Tasks.md) are met, with evidence (output, screenshot, or log).
- [ ] Code follows docs/CodingRules.md.
- [ ] Code is consistent with docs/Architecture.md (no layer violations).
- [ ] Lint passes — command output attached.
- [ ] Build succeeds — command output attached.
- [ ] Tests exist for the change and pass — actual test run output attached, not claimed.
- [ ] Each new test was seen failing before the code that satisfies it existed — the red output is attached next to the green. A test only ever observed passing proves nothing about what it covers; this is what separates a real test from one retrofitted to match whatever the implementation happens to do. (Vacuously satisfied when a change adds no new tests, e.g. a pure refactor.)
- [ ] No unrelated files modified (`git diff` contains only task-scoped changes).
- [ ] reviewer Status: `APPROVED` (or user explicitly accepted the risks of a REJECTED item).

Note: `GO` itself is the *output* of this gate, not a checklist item — quality-assurance never checks its own verdict as an input.

## Closure Checklist (after GO, completed at the docs step)
These do not block the `done` transition, but the task is not fully closed until they pass. They are verified when the docs agent runs as the pipeline's final step.
- [ ] Documentation impact reported (docs agent invoked if documentation changed).
- [ ] docs/CHANGELOG.md updated for user-visible changes.

## Rules
- "Tests pass" without attached output = not done (see CLAUDE.md prohibitions).
- Skipped items must be listed explicitly with the user's approval noted.
- If the docs step is skipped, the pipeline is incomplete even though the task row shows `done` — the pending Closure items must be reported, not silently dropped.
