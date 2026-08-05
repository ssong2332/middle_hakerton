# Definition of Done — 크로스보더 협업 중재 서비스

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

## 심사 기준 대조 (제출물 수준 — 사용자 지시, 2026-08-04)

태스크 단위 게이트가 아니다. 아래 **적용 시점**에서 반드시 수행한다.

### 금지 (다른 항목보다 우선)
- 근거 없이 체크하지 않는다. 각 행은 **파일:줄 / 실행 출력 / 수치** 중 하나를 근거 열에 적는다.
- **"계획이 있다"를 "충족"으로 적지 않는다.** 기준 2·4·6-a는 문서가 아니라 **동작하는 산출물**만 근거가 된다.
- 근거가 없는 기준을 빈칸으로 넘기지 않는다 — `없음`이라고 적는다. 빈칸은 미수행으로 간주한다.
- 이전 회차의 근거를 복사하지 않는다. 매 회차 다시 확인한다.

### 적용 시점
| 시점 | 수행자 |
|---|---|
| 각 마일스톤(M1~M4) 종료 | 오케스트레이터 |
| T35 통합 리허설 | 리허설 실행자 |
| 발표 자료(T37) 확정 전 | [DS] |
| 제출 직전 | 팀 전원 |

### 체크리스트
| no | 기준 | 배점 | 충족 판정 조건 (이것만으로 판정한다) | 근거 | 등급 |
|---|---|---|---|---|---|
| 1 | 문제 정의 | 25 | 문제의 **크기**를 뒷받침하는 수치 근거가 있고 출처가 추적 가능한가 (경쟁사·점유율 수치는 여기에 해당하지 않는다) | | |
| 2 | 실현 가능성 | 20 | 핵심 기능이 **공개 URL에서 실제로 동작**하는가 — 실행해 본 출력이 있는가 | | |
| 3 | 시장성 | 15 | 수익 구조 + **시장 규모 근거**가 함께 있는가 | | |
| 4 | UI / UX | 10 | 타깃이 목표를 달성하기까지의 **조작 단계 수**와 화면 간 일관성 | | |
| 5 | 전달력 | 10 | 핵심 메시지가 **발표 시간 안에** 전달되는가 (리허설 실측 시간 필수) | | |
| 6-a | 트랙 · 보더리스 (`*중요`) | 20 | 4개 Border 중 **실제로 동작하는 것**이 몇 개인가 — 명세에 적힌 수가 아니다 | | |
| 6-b | 트랙 · AI 활용도 | ↑ 포함 | AI가 장식이 아니라 문제를 푸는 **핵심 열쇠**로 쓰였는가 | | |
| 6-c | 트랙 · 협업 | ↑ 포함 | 결과물 안에 실제로 **함께 일한 흔적**이 보이는가 | **없음 — 확정.** 사용자가 `docs/GitWorkflow.md`의 PR 동료 승인 규칙을 폐지하고 자가 머지를 허용해(PR #11, 2026-08-05) 근거를 남길 경로(해석 ⓐ)를 포기했다. `docs/PRD.md:359`·`:807`(Decision #115) 참조. 해석 ⓐ/ⓑ 중 무엇이 심사 대상인지는 Open Question #25로 미확인 — 확정된 것은 ⓐ 경로가 채워지지 않는다는 사실뿐이다. | measured |

### 근거 등급 표기
`measured`(직접 확인) / `cited`(제3자 제공, 미검증) / `추정`(확인 수단 없음) 중 하나를 등급 열에 적는다. **기준 1은 `추정` 등급으로 충족 판정할 수 없다** — 심사 기준 문구 자체가 "객관적 근거 및 수치"를 요구하기 때문이다.

### 출처
- 기준 6의 하위 3항목과 배점 20점: 멋쟁이사자처럼 트랙 가이드 페이지 직접 열람 — **measured** (2026-08-04)
- 기준 1~5의 배점·설명: 사용자 제시 — **cited**. 단 트랙 20점이 양쪽에서 일치해 부분 교차 검증됨
- 기준별 우리 근거 매핑은 docs/PRD.md "심사 기준" 섹션이 단일 출처다 (planner 소유)

## Closure Checklist (after GO, completed at the docs step)
These do not block the `done` transition, but the task is not fully closed until they pass. They are verified when the docs agent runs as the pipeline's final step.
- [ ] Documentation impact reported (docs agent invoked if documentation changed).
- [ ] docs/CHANGELOG.md updated for user-visible changes.

## Rules
- "Tests pass" without attached output = not done (see CLAUDE.md prohibitions).
- Skipped items must be listed explicitly with the user's approval noted.
- If the docs step is skipped, the pipeline is incomplete even though the task row shows `done` — the pending Closure items must be reported, not silently dropped.
- 심사 기준 대조는 **태스크 단위가 아니라** 위 표의 4개 시점에서 수행한다. 시점이 도래했는데 수행하지 않으면 그 마일스톤은 완료가 아니다. 수행 결과는 근거와 함께 기록하고, 이전 회차 기록을 덮어쓰지 않는다.
