# PRD — {{project-name}}

Owner: planner (see AGENTS.md). Others read-only.
Document Version: {{v0.1}} · Last Updated: {{date}}

## Problem Statement
Before scoping any feature, planner decomposes what the user described into individual, concrete problems — not "the product doesn't exist yet" but the actual pain each affected person has today. This is a recommendation, like Monetization below: the user approves, overrides, or rejects each problem block at the PRD approval gate. A problem with no approved block does not get a feature in MVP Scope; a feature with no Problem ID it addresses is scope invented without a stated reason, not a requirement.

If the user's request already states multiple distinct problems, give each its own block rather than merging them — a merged block hides which part of the recommendation the user is actually approving. If the user rejects a block, it stays here (never deleted) with Status `rejected` and a one-line reason, so the decision isn't re-litigated later without new information.

If the user already prescribed the solution to a problem, refine that prescription instead of re-deriving alternatives — the candidate table below is for problems whose solution is still open, not a license to re-litigate a decision the user brought with the request. Record the prescribed idea as Recommended with Status `user-approved (prescribed in the request)`, and challenge it only through an Open Question naming a concrete risk, never by padding the table with competing pitches.

For each problem whose solution is still open, propose at least 3 candidate solution ideas spanning genuinely different registers — not 3 variations on the same idea. At minimum: one **Refined** idea (the well-validated, conventional answer — what a careful practitioner would ship), one **Inventive** idea (a less obvious angle that reframes the problem, still practical), and one **Unconventional** idea (a deliberately unconventional or provocative option — worth naming even if unlikely to be picked, because it can surface an assumption the safe options share and don't question). A row that's just a hedged restatement of the Refined idea in different words is not an Inventive or Unconventional entry — if the honest inventive/unconventional idea is weak, say so in its "Why this fits" cell rather than padding the table with a near-duplicate.

### {{Problem name}} (Problem ID: {{PS-001}})
| Item | Value |
|---|---|
| Problem | {{the problem itself, stated concretely — what goes wrong, for whom, today}} |
| Who's Affected & Impact | {{who experiences this and what it costs them — time, money, errors, missed opportunity}} |

**Candidate Solution Ideas**
| Flavor | Idea | Why this fits |
|---|---|---|
| Refined | {{the safe, well-validated approach}} | {{...}} |
| Inventive | {{a creative angle that reframes the problem, still practical}} | {{...}} |
| Unconventional | {{a deliberately out-of-the-box or provocative option}} | {{...}} |
| {{optional additional flavor}} | {{...}} | {{...}} |

| Item | Value |
|---|---|
| Recommended | {{which flavor planner actually recommends, or a synthesis of two}} |
| Reasoning | {{one line — why this beats the other candidates for this specific problem}} |
| Status | {{one of: proposed / user-approved / user-overridden — name the idea the user chose / rejected — with a one-line reason}} |

## Goal
{{one sentence — what this product does, synthesized from the user-approved Problem Statement blocks}}

## Target Users
{{who, and their core problem — one-line summary; docs/PRD.md's Problem Statement above is the decomposed, reasoned version of this}}

## Monetization
planner designs and recommends the revenue model that best fits this product; the user approves or overrides it at the PRD approval gate. For clearly non-commercial products, state "N/A — non-commercial" explicitly (optionally with a one-line future path) and skip the tables.

| Candidate model | How it fits this product | Pros | Cons |
|---|---|---|---|
| {{e.g. subscription}} | {{...}} | {{...}} | {{...}} |
| {{e.g. one-time purchase}} | {{...}} | {{...}} | {{...}} |

| Item | Value |
|---|---|
| Recommended model | {{planner's pick + one-line reasoning}} |
| Pricing shape | {{suggested starting tiers or price points}} |
| Revenue constraints | {{e.g. "MVP must work without a payment provider", or "none"}} |
| Status | {{one of: proposed / user-approved / user-overridden — if overridden, name the model the user chose}} |

## Delivery & Deployment
How this product reaches its users, decided at planning time rather than discovered at release. planner fills this from the product's nature and the user's constraints; architect designs the mechanism against it (hosting, pipeline, rollback) in docs/Architecture.md. A product whose delivery is only considered after the code works tends to need scope changes it can no longer absorb — app-store review windows, a domain nobody registered, a compliance step with a lead time.

| Item | Value |
|---|---|
| Target environment | {{where it runs — e.g. web (browser), server, user's machine, mobile (iOS/Android), CI job}} |
| Distribution channel | {{how users get it — e.g. public URL, app store, package registry, internal install, binary download}} |
| Release cadence | {{e.g. continuous on merge, weekly, single launch}} |
| Environments needed | {{e.g. local only / local + staging + production, or "local only for MVP"}} |
| Release constraints | {{lead times and gates outside the team's control — app store review, security sign-off, domain/certificate, third-party account approval — or "none"}} |
| Downtime tolerance | {{e.g. "brief downtime acceptable" / "zero-downtime required"}} |
| Rollback expectation | {{what must be possible when a release is bad — e.g. "revert to previous version within 10 min", or "N/A — no users yet"}} |
| Deployment in MVP scope? | {{yes → deployment tasks appear in docs/Tasks.md / no → explicitly deferred, with what unblocks it}} |

## Non-functional Expectations
Product-level expectations the user confirms at the PRD gate — what the product must feel like and tolerate, not how (the technical means are architect's). Downtime tolerance lives in Delivery & Deployment above. State every row explicitly — "no specific expectation" is a valid entry; blank is not.

| Item | Expectation |
|---|---|
| Performance | {{e.g. "interactions feel instant on a mid-range phone", or "no specific expectation"}} |
| Scale | {{concurrent users and data volume the MVP must tolerate — e.g. "single user, <1k records"}} |

## MVP Scope
| # | Feature | Solves Problem(s) | Priority | Acceptance Criteria |
|---|---|---|---|---|
| 1 | {{...}} | PS-001 | P0 | AC-001 |

## Acceptance Criteria
| ID | Verifiable Condition |
|---|---|
| AC-001 | {{...}} |

## Out of Scope (Future)
- {{...}}

## Planning Decisions
The authoritative record of planning-level decisions (scope exclusions, priority calls, MVP boundary judgments). Downstream agents (ux-design, architect) must respect these even when other sections don't repeat them. Technical/architectural decisions do NOT belong here — those go in docs/DECISIONS.md (architect-owned). Append-only: if a decision changes, add a new row and mark the old one Superseded.

| # | Decision | Reason | Affects | Status |
|---|---|---|---|---|
| 1 | {{e.g. "Login is out of MVP scope"}} | {{why}} | {{e.g. UX, Architecture, or "All"}} | {{Active / Superseded}} |

## Assumptions
- {{...}}

## Constraints
- {{...}}

## Risks
| Risk | Impact | Mitigation |
|---|---|---|
| {{...}} | {{...}} | {{...}} |

## Open Questions
Every open question carries planner's recommendation — a bare question stalls the user, a recommendation lets them confirm in one word or redirect in one sentence. Foundational choices (target platform, target users and scale, delivery channel, connectivity requirement, monetization posture, first-release scope) always appear here rather than being silently defaulted; the user answers them at the PRD approval gate. A row's Status is `open` until the user decides, then `answered` with the outcome recorded in the Decision column.

| # | Question | Recommendation | Reason | If decided otherwise | Status | Decision |
|---|---|---|---|---|---|---|
| 1 | {{unresolved requirement}} | {{planner's suggested answer}} | {{one line — why this is the recommendation}} | {{what changes downstream if the user picks differently}} | open | |
