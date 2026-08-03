# Architecture — {{project-name}}

Owner: architect (see AGENTS.md). Others read-only.
Major decisions are logged in DECISIONS.md; details in adr/.
Based on PRD Version: {{x.x}} · Based on UX Version: {{y.y or N/A}} · Last Updated: {{date}}

## Tech Stack
| Layer | Choice | Reason |
|---|---|---|
| {{frontend/backend/db/...}} | {{...}} | {{...}} |

## Folder Structure
```
{{project tree}}
```

## Layers & Module Boundaries
{{layer diagram or list — which layer may depend on which}}

## Data Flow
{{request → ... → response}}

## Security
Outcome of architect's Security Design Checklist (see .claude/agents/architect.md). Every row gets a decision or an explicit "N/A — reason" — never blank.

| Item | Decision |
|---|---|
| Authentication / Authorization | {{strategy, or "N/A — reason"}} |
| Secrets & configuration | {{env vars used and where secrets live, or "no secrets"}} |
| Sensitive data | {{what exists, where stored, protection at rest/in transit, or "none held"}} |
| Input validation boundaries | {{which boundaries validate, which layer owns it}} |
| Attack surface | {{what is exposed and what limits it}} |
| Dependency risk | {{new deps + DECISIONS.md refs, or "no new dependencies"}} |
| Abuse cases | {{per-feature abuse notes, or "no meaningful abuse case"}} |

## Deployment
Designed against docs/PRD.md's Delivery & Deployment section — that section states the requirement, this one states the mechanism. Every row gets a decision or an explicit "N/A — reason"; never blank.

| Item | Decision |
|---|---|
| Hosting / runtime target | {{platform the built artifact runs on, or "N/A — reason"}} |
| Build & release pipeline | {{what runs on merge — build, test, deploy steps — or "manual, documented in README"}} |
| Environments & promotion | {{how a change moves local → staging → production, or "local only"}} |
| Configuration per environment | {{which env vars differ and where they come from — never secret values, see Security}} |
| Database / state migration | {{how schema or stored-state changes ship with a release, or "no persistent state"}} |
| Rollback procedure | {{the concrete steps to undo a bad release, and how long they take}} |
| Health check / smoke test | {{what proves a release is good after it ships, or "N/A — reason"}} |

## Conventions
{{architectural rules implementer must follow — e.g., business logic never imports framework code}}

## Error Handling
Global strategy, not per-feature notes. Every row gets a decision or an explicit "N/A — reason"; never blank.

| Item | Decision |
|---|---|
| Where exceptions are caught | {{which layer(s) own catching — e.g. "route handlers catch, services throw"}} |
| How failures surface to the user | {{mapping to docs/UX.md's error states when present, or the CLI/API error contract}} |
| Cross-boundary propagation | {{how errors cross module/API boundaries — error types, codes, or result values}} |

## Observability
Every row gets a decision or an explicit "N/A — reason"; never blank.

| Item | Decision |
|---|---|
| Logging | {{what gets logged and where it goes — e.g. "structured JSON to stdout", or "console only for MVP"}} |
| Error tracking / monitoring | {{a service (e.g. Sentry) or "none — MVP relies on logs"}} |
| Metrics | {{what's measured operationally — uptime, latency, error rate — or "none for MVP"}} |

## Risks & Trade-offs
| Decision | Trade-off | ADR |
|---|---|---|
| {{...}} | {{...}} | adr/0001 |

## UX Traceability
{{Only when docs/UX.md exists. Maps each Screen ID/Flow ID to the component, endpoint, or table that implements it — e.g. "UX-001 → /api/users endpoint (API.md), users table (Database.md)". Otherwise state "N/A — no docs/UX.md".}}
