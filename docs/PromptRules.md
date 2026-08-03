# Prompt Rules — {{project-name}}

Owner: User. How to invoke the eight agents. Contract details: AGENTS.md.

## Pipeline with Approval Gates
```
planner → [user reviews PRD — approves/overrides each Problem Statement block and the Monetization recommendation, answers Open Questions]
→ ux-design (if the project has a user-facing UI) → [user approves flows/screens; optionally generates UI mockups in Claude Design using the prompts in docs/UX.md — mockup deviations go back to ux-design to sync the spec]
→ architect → [user approves design]
→ implementer (one Tasks.md ID at a time)
→ reviewer → quality-assurance (sequential — QA's gate includes reviewer's APPROVED)
→ (issues? → implementer again / cause unknown? → debugger first / design defect? → architect first / UX defect? → ux-design first)
→ [GO: implementer marks the task `done`] → [orchestrator/user merges the task branch into main — never a subagent, see docs/GitWorkflow.md]
→ docs
```

## Invocation Table
| When | Say | Agent invoked |
|---|---|---|
| Project start / new requirements | "planner 에이전트로 요구사항 정리해줘" | planner |
| PRD approved, project has a UI | "ux-design 에이전트로 UX 설계해줘" | ux-design |
| PRD (and UX, if applicable) approved, need design | "architect 에이전트로 아키텍처 설계해줘" | architect |
| Design approved, build task | "implementer로 Tasks.md의 T{{n}} 구현해줘" | implementer |
| After implementation | "reviewer로 방금 변경분 리뷰해줘" | reviewer |
| Before marking done | "quality-assurance로 T{{n}} 검증해줘" | quality-assurance |
| A defect whose cause is unknown | "debugger로 {{증상}} 원인 분석해줘" | debugger |
| After merge / release | "docs 에이전트로 문서 동기화해줘" | docs |

## Always
- Explain assumptions before acting on ambiguous input.
- Cite modified files (path + line) in every report.
- Produce a suggested commit message after code changes.

## Never
- Guess requirements — list them as Open Questions instead.
- Modify files unrelated to the current task.
- Rewrite large files when a small diff suffices.

## Rules
- One implementer invocation = one task ID. Never batch tasks in one prompt.
- implementer's `model:` frontmatter is `inherit` by design, but the orchestrator should override it per task via the Agent tool's `model` parameter rather than leaving every invocation at whatever the session happens to be on. Judge each task against this table before invoking — never against a case it doesn't cover without asking the user first:

  | Task shape | Model |
  |---|---|
  | 1–2 files changed, 1 acceptance criterion, reuses an existing pattern (CRUD, style/config change) | `sonnet` |
  | Cross-module changes, a new architectural pattern, security/auth/concurrency logic, or resolving a contradiction between two documents | `opus` |
  | Doesn't clearly fit either row | Ask the user which applies — do not guess |

- Invoke debugger before implementer whenever the cause of a defect is unknown — never ask implementer to change code to see what happens. Pass debugger's Root Cause and Failing Test Specification to implementer verbatim.
- After two failed fixes for the same defect, stop. The third attempt goes to debugger (or architect, if debugger already routed it there), never back to implementer unchanged.
- Quote, never paraphrase, when relaying one agent's findings to another — this applies to every relay (e.g. passing the reviewer/QA report verbatim when re-invoking implementer for fixes), not just fix re-invocations. A paraphrase can silently turn a narrow note into a broader instruction, and the receiving agent may then attribute the change to the wrong source. Agents cite provenance only from text they can verify.
- Approval gates are the user's job — agents report and stop; they never self-approve.
- If an agent's report contains Open Questions, answer them before invoking the next agent. Foundational choices in particular — planner's product set (platform, target users and scale, delivery channel, connectivity, monetization posture, first-release scope) and architect's technical set (language, framework, database engine and hosting as separate decisions, deployment target, auth approach, real-time/websocket requirement) — are always put to the user as explicit questions carrying the agent's recommendation verbatim (use AskUserQuestion when available, with the recommended option listed first); the orchestrator never answers a foundational question on the user's behalf, however obvious the default looks. One round of foundation questions at the planner and architect gates is cheaper than a rebuild on a stack the user never chose.
- Propose-then-approve sections are gate items, not report footnotes. At the PRD gate, relay each Problem Statement block (the problem, its candidate ideas, planner's recommendation) and the Monetization recommendation to the user for an explicit approve / override / reject, and have planner record each outcome in the block's Status row. A Status still reading `proposed` after the gate means the gate didn't actually happen — the orchestrator never fills in an approval on the user's behalf.
- Search the decision records before asking for a decision. Before invoking planner/architect/ux-design to decide something, grep docs/DECISIONS.md, docs/PRD.md's Planning Decisions, docs/UX.md's UX Decision Log, and docs/adr/ for the topic. If a decision already exists, say so in the prompt and ask the agent to build on it or supersede it explicitly — never phrase it as an open question, which invites a fresh answer that silently contradicts the record.
- Mark every figure and path in a prompt as measured or cited. If you have not run or read it in this session, label it (`cited, unverified`) or re-check it first. An agent cannot tell a remembered number from a measured one, and will treat both as given — a wrong premise stated confidently produces confidently wrong work.
- When agents run concurrently, enforce isolation with the run option (a git worktree via `isolation: "worktree"`, or a separate checkout), never with prompt wording. Instructions to "work in an isolated directory" have been observed not to take effect; two agents sharing a working tree will delete each other's build output and produce failures that belong to neither. Sequential invocation needs none of this — it is the default for a reason.
- External plugin agents/skills (marketplace-installed, e.g. accessibility auditors, CI/CD or payment specialists) are outside the AGENTS.md contract: the orchestrator may invoke them for reference, but their output enters the pipeline only as *input* to a contract agent — they never edit owned documents (docs/*, README.md) or source code directly. If one insists on editing, stop it and relay its findings verbatim to the owning agent instead.
- The same boundary applies to project-added MCP data sources (e.g. a Figma MCP added per the README's "Optional: connect Figma"): they feed the invoking agent's own output, never bypass it. A Figma frame pulled during implementation is a fidelity source for what `docs/UX.md` already specifies — states, validation, interaction patterns, and accessibility stay authoritative there; a detail present in the Figma frame but absent from `docs/UX.md` is a spec gap to report back to ux-design, not something implementer fills in silently from the frame. The Figma frame URL itself lives in the screen's Screen Catalog entry (Figma Frame field), recorded by ux-design once the user approves it — not re-solicited from the user on every implementer invocation.
- Pushing an implemented screen back into Figma (the optional write direction) writes into a real, shared external account — this is a publish-style action, not a read: invoke it only when the user explicitly asks, and confirm the specific push before it runs, the same as any other action in this category. Its output is a downstream reference synced back through the normal mockup-deviation flow (ux-design updates `docs/UX.md` if an edit to it is approved) — never a channel straight from Figma into source code.
- Visual-quality skills (e.g. `frontend-design`) apply at the implementer step only, and only to how a screen looks — never to what it does. docs/UX.md remains authoritative for states, validation, interaction patterns, and accessibility; a visual skill may not add, remove, or alter them. When the user has already approved a Claude Design mockup, name that mockup's aesthetic direction in the implementer prompt so the skill executes the approved direction instead of picking a new one — an unconstrained skill invents its own direction each run, which silently discards the approval.
