# Documentation Update Requests — 크로스보더 협업 중재 서비스

Owner: docs (see AGENTS.md). Appended when docs finds a document it doesn't own has drifted from the implementation. docs never edits the target document directly — it logs the drift here so the owning agent can act on it, even across sessions.

| # | Date | Target Document | Section | Stale Content | What the Code Actually Shows | Owning Agent | Status |
|---|---|---|---|---|---|---|---|
| 1 | {{YYYY-MM-DD}} | {{docs/PRD.md}} | {{section}} | {{...}} | {{...}} | {{planner}} | open |
| 2 | 2026-08-04 | docs/Architecture.md | 설계 제1원칙 (line 27) | "코드 **0줄**, 태스크 **72건 전부 `todo`**(measured — `docs/Tasks.md` Status 열 grep, 2026-08-04)" — 이 문서 자신의 Last Updated(2026-08-04)와 같은 날짜지만 이후 커밋들과 더 이상 맞지 않음 | `git ls-files` 실측: `apps/web`·`apps/extension`·`packages/core`에 실제 소스 존재. `docs/Tasks.md` Status 열 실측(node 스크립트로 전수 집계): 총 72건 중 `done` 2건(T1, T2), `todo` 70건 — "코드 0줄·전부 todo"는 더 이상 사실이 아님 | architect | open |

## Rules
- Rows are appended by docs only; docs never rewrites or deletes a past row.
- The Status column is the one exception: the named Owning Agent (planner/ux-design/architect) may update it from `open` to `resolved` once they've acted on the row — mirrors implementer's narrow Status-only exception on docs/Tasks.md.
- Everyone else is read-only.
