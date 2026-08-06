# Git Workflow — 크로스보더 협업 중재 서비스

Owner: User. implementer follows; reviewer checks compliance.

## Prohibitions
- No direct commits to `main`.
- **No direct commits to `dev`.** 작업 브랜치를 거쳐 PR로만 들어간다.
- **작업 브랜치를 `dev`를 건너뛰고 `main`에 머지하지 않는다.**
- No force-push to shared branches (`main`, `dev` 포함).
- No `--no-verify` / hook skipping.
- No commit without a passing local test run.

> ⚠️ 훅으로 강제되는 것은 `main`뿐이다(아래 참조). `dev`와 PR 승인 규칙은 **합의이며 자동 차단되지 않는다** — 지키는 것은 사람 몫이다.

자동 차단되는 것은 **`main` 직접 커밋**과 **`--no-verify`** 두 가지뿐이다 — `block-main-writes.js`, `block-no-verify.js`가 PreToolUse로 해당 `git` 명령을 막는다. 차단은 우회할 대상이 아니라 **브랜치가 필요하다는 신호**다.

> 이 훅들은 `.claude/` 아래에 있고, `.claude/`는 팀원마다 개발 도구가 달라 **리포에서 제외되어 있다**(`.gitignore`). 따라서 **clone 한 사람에게는 훅이 없다.** 위 Prohibitions 전체를 자동 차단이 아니라 **합의로 지켜야 한다.**

## Branches

### 고정 브랜치 (2개, 삭제하지 않는다)
| 브랜치 | 뜻 | 누가 쓰는가 |
|---|---|---|
| `main` | **공개 URL에 배포된 상태.** 항상 배포 가능해야 한다 | 배포 시점에만 갱신. 롤백은 직전 `main` 재배포다(T36) |
| `dev` | **통합 브랜치.** 모든 작업 브랜치가 여기로 합쳐진다 | 평소 작업의 기준점. `dev`에서 따고 `dev`로 돌아온다 |

### 작업 브랜치 (필요한 만큼 만든다)
| Type | Pattern | Example | 머지 대상 |
|---|---|---|---|
| Feature | `feat/{{task-id}}-{{slug}}` | feat/T10-tone-preserve | `dev` |
| Fix | `fix/{{task-id}}-{{slug}}` | fix/T7-null-token | `dev` |
| Docs | `docs/{{slug}}` | docs/prd-v3 | `dev` |
| Chore | `chore/{{slug}}` | chore/gitignore-claude | `dev` |
| **Spike (조사·검증)** | `spike/{{task-id}}-{{slug}}` | spike/T55-selection-overlay | **머지하지 않는다 — 아래 참조** |

**Spike 브랜치 규칙**: 이 프로젝트에는 결과가 코드가 아니라 **가부 판정**인 태스크가 있다(T55 층 1 선택 오버레이 1시간 스파이크, T64 GitHub API 조회 가능성, T71 수동 표본 임계값). 이런 브랜치는 **머지를 전제하지 않는다** — 판정 결과를 보고하고 브랜치는 폐기할 수 있다. 단 **성공/실패 어느 쪽이든 결과는 반드시 보고**하며, 조용히 사라지면 안 된다.

### 타입을 추가할 때
표에 없는 상황이 나오면 **임의로 새 접두어를 만들지 말고 이 표에 행을 추가할지 먼저 합의**한다. 이름이 제각각이면 브랜치 목록에서 무엇이 무엇인지 읽을 수 없게 된다.

**의도적으로 넣지 않은 것**: `release/*`, `hotfix/*`. 정기 배포 주기가 있는 제품을 위한 것이고, 이 프로젝트는 **2026-08-21 단일 런치**다(PRD Delivery & Deployment). 방침이 바뀌면 그때 행을 추가한다.

## Commit Messages
```
{{type}}: {{summary ≤ 50 chars}}

{{body — what and why, not how}}

Refs: {{task ID}}
```
Types: `feat` / `fix` / `refactor` / `docs` / `test` / `chore`

### Red→Green 증거 (v3, 2026-08-06, 사용자 결정)
🔴 **implementer는 새 테스트를 작성한 시점의 실패 상태를 반드시 별도 커밋으로 남긴다** — 구현을 끝낸 뒤 한 번에 스쿼시해 커밋하지 않는다. 최소 형태:
1. `test: add failing test(s) for {{task ID}}` — 새/수정 테스트만 커밋. 이 시점에 실제로 fail해야 하며, 통과하는 테스트를 이 커밋에 넣지 않는다.
2. `feat`/`fix: implement {{task ID}}` (또는 여러 커밋) — 구현을 추가해 1의 테스트를 통과시킨다.

**이유**: T20/T22/T24(2026-08-06)가 태스크당 단일 스쿼시 커밋만 남기는 바람에, quality-assurance가 "새 테스트가 실제로 버그를 잡는지"(red→green)를 매번 재현하지 못하고 "선례와 동일 기준으로 비차단 처리"만 반복했다 — 3연속 같은 공백이 누적됐다. 커밋을 나누면 QA가 `git show {{red-commit}}`으로 실제 실패 로그를 재현할 수 있다.

**적용 범위**: 새 태스크(이 결정 이후 착수하는 것)부터 적용한다. 기존에 이미 `done`으로 병합된 태스크(T2~T24 등)를 소급해 재작업하지 않는다.

## Merge Rules
- One task (docs/Tasks.md ID) = one branch = one PR.
- **작업 브랜치는 `dev`에서 따고 `dev`로 머지한다.** `main`은 배포 시점에만 `dev`를 받는다.
- **(v2, 2026-08-05) 자가 머지를 허용한다.** 팀원 승인 없이 본인 PR을 본인이 머지할 수 있다 — **사용자 결정**: 실제 협업(다른 팀원의 PR 리뷰)이 이루어지지 않을 것으로 판단해, 동료 승인을 머지 조건에서 제거했다.
  - **주의**: 이 규칙 완화로 `docs/PRD.md` "심사 기준 ↔ 우리 근거 대조" 절이 트랙 심사 기준 "협업"의 근거로 지목했던 PR 리뷰 기록이 더 이상 쌓이지 않는다. PRD.md 쪽 반영은 planner 소관이며 별도 처리가 필요하다(아직 미반영).
  - PR 자체(설명·커밋 이력)는 계속 남긴다 — 리뷰가 없어도 변경 이유를 기록하는 습관은 유지한다.
- PR merges only after the docs/DefinitionOfDone.md Gate checklist passes (Closure items complete at the docs step after merge).
- Fast-forward merge when possible (preserves per-task commits for individual revert/bisect); merge-commit when fast-forward is not possible. Never squash — intermediate commits (review fixes, attribution corrections) are part of the audit trail.

## Who Merges
| 머지 | 누가 | 조건 |
|---|---|---|
| 작업 브랜치 → `dev` | 해당 태스크 담당자 | 승인 불요(자가 머지 허용, v2 2026-08-05). DoD Gate는 여전히 통과해야 한다 |
| `dev` → `main` | 오케스트레이터(메인 세션) 또는 사용자 | 배포 시점에만. **implementer는 절대 하지 않는다** |

- Merges into `main` are performed by the orchestrator (main session) or the user — never by implementer. The permission system blocks subagent merges; implementer commits on its task branch, stops, and reports.
- Before merging, the merger verifies the checkout with `git branch --show-current` — a fast-forward merge run while checked out on the feature branch silently reports "Already up to date" without merging anything.
- **`main` 머지 직후에는 배포와 동작 확인이 따라붙는다**(T17·T35·T36). `main`이 배포되지 않은 상태로 남으면 "`main` = 배포된 것"이라는 이 표의 전제가 깨지고, 롤백 지점을 다시 커밋 해시로 찾아야 한다.
- **2026-08-20 배포 동결 이후 `main` 머지 금지**(PRD Delivery & Deployment: 발표 당일 배포 금지). 동결 이후에도 `dev` 작업은 계속할 수 있으나 `main`에 반영하지 않는다.
