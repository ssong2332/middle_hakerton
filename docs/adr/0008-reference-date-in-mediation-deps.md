# ADR-0008: 기준일(referenceDate)은 `MediationDeps` 로 들어오고, MVP는 UTC를 유지한다

- Status: **accepted**
- Date: 2026-08-05
- Owner: architect
- DECISIONS.md entry: #46
- Freeze Point: **F1** (`packages/core/src/contract.ts` · `packages/core/src/pipeline.ts`) — F1 동결 후 **네 번째** 변경(F1-a·F1-b·F1-c에 이어 **F1-d**)
- 소비 태스크: **T28**(파이프라인 조립). 그 전까지 코드 변경은 없다.

## Context

QA 정적 분석 후속으로 두 개의 공백이 보고됐다. **둘은 같은 원인에서 나온 하나의 문제다 — F1 계약에 "지금이 며칠인가"가 들어올 자리가 없다.**

측정 사실(전부 architect가 2026-08-05 직접 열람):

| # | 사실 | 근거 |
|---|---|---|
| 1 | C2 스텝이 기준일을 **요구**한다 | `packages/core/src/steps/c2.ts:61` — `RunToneTransformInput.referenceDate: string` |
| 2 | 그런데 그 값이 **F1 계약 어디에도 없다** | `MediationInput` 은 4필드 동결(`contract.ts:200~213`), `MediationDeps` 는 `llm` + `data`(조회물) 둘뿐(Architecture F1-b) |
| 3 | 현재는 **Route Handler가 인라인으로** 만든다 | `apps/web/app/api/mediate/route.ts:122` — `new Date().toISOString().slice(0, 10)` |
| 4 | 즉 T28이 `run(input, deps)` 를 조립하는 순간 **그 값을 어디서 얻을지가 미정**이다 | 위 2 + `pipeline.ts` 의 `MediationPipeline` 타입 |
| 5 | payload에 실리는 것은 **연도뿐**이다 | `packages/core/src/prompts/c2.ts:53`(*"`referenceDate` 에서 **연도만** 뽑아 여기 싣는다"*)·`:65`(`referenceYear: string`)·`c2.ts:173`(`referenceDate.slice(0, 4)`) |
| 6 | 발신자 타임존은 **계약에 존재하지 않는다** | `contract.ts:141~213` — 타임존은 `RecipientContext.timezone`(`:171`) 하나뿐이며 *"사용자가 확정해야 채워진다 … 미확정이면 `null`"* |
| 7 | core는 시스템 시계를 직접 읽지 않는다는 관례가 이미 있다 | Architecture Conventions 11 계열 — core는 부수효과를 만들지 않고 I/O는 인자와 반환값으로만 (`c2.ts:57~59` 주석이 같은 이유를 적고 있다) |

## Decision

### D1 — 자리: `MediationDeps` 최상위에 값으로 넣는다 (F1-d)

```ts
// packages/core/src/pipeline.ts — 🔒 Freeze Point F1
export interface MediationDeps {
  llm: LLMClient;              // 실행 수단
  data: MediationData;         // 호출 전에 조회가 끝난 DB 산출물 (F1-b)
  referenceDate: string;       // 🔴 F1-d — 호출 시점의 기준일(ISO `YYYY-MM-DD`). 호출자가 만든다
}
```

- **`MediationInput` 은 4필드에서 늘어나지 않는다**(F1-b의 불변 규칙 그대로).
- T28은 `deps.referenceDate` 를 **그대로** `RunToneTransformInput.referenceDate` 에 전달한다 — 스텝 시그니처는 바꾸지 않는다.
- **core 안에 `new Date()` 가 생기는 diff는 반려한다**(위 사실 7).

F1-b 판정표에 행을 하나 추가한다(판정표 자신이 *"표에 없는 케이스가 나오면 임의 판단하지 말고 이 표에 행을 추가한다"* 고 지시한다):

| 이 값이 | then | 이유 |
|---|---|---|
| **호출 시점에 확정되는 요청 단위 스칼라**(기준일 등) | `deps` 최상위 | 당사자 서술도 조회물도 아니다. 호출자만 알 수 있고 core가 만들어서는 안 되는 값이다 |

### D2 — 기준 시각: MVP는 UTC를 유지하고 한계를 적는다

`deps.referenceDate` 는 **UTC 기준의 오늘**이다(현행 `route.ts:122` 와 같은 계산). 발신자 로컬 기준으로 바꾸지 않는다.

**남는 오차의 정확한 크기**: payload에 실리는 것이 연도뿐이므로(사실 5), 틀리는 것은 **UTC 날짜와 발신자 로컬 날짜의 *연도*가 다른 순간뿐**이다.

| 발신자 | 오차 구간 | 크기 | MVP 기간(2026-08-04~08-21) 영향 |
|---|---|---|---|
| KST(UTC+9) | 1월 1일 **00:00~09:00 KST** | 9시간 / 년 | **0** — 구간이 기간 안에 없다 |
| JST(UTC+9) | 동일 | 9시간 / 년 | 0 |
| US 서부(UTC−8) | 12월 31일 **16:00~24:00 PST** | 8시간 / 년 | 0 |

이 표는 "괜찮다"는 주장이 아니라 **틀리는 순간이 언제인지 특정한 것**이다. AC-049(날짜 정규화)의 판정 케이스는 `docs/TestCases.md` P-03/P-09/D-01/D-03/D-06이며 전부 원문에 월/일이 있고 연도만 필요하다.

## Alternatives considered

| 대안 | 기각 이유 |
|---|---|
| **`deps.clock: Clock`(`{ today(): string }`) 인터페이스** | 파이프라인의 여러 스텝이 호출하면 **한 요청 안에서 날짜가 바뀔 수 있다**(자정 경계). 그러면 같은 요청의 cacheKey가 스텝마다 갈린다. 값으로 넘기면 결정성이 **구조적으로** 보장되고 인터페이스가 하나 줄어든다(설계 제1원칙 R1 "계층을 늘리지 않는다"). 시계 주입이 필요해지는 소비처가 실제로 둘 이상 생기면 그때 이 ADR을 supersede 한다 |
| **`MediationInput` 에 `context.referenceDate` 추가** | F1-b가 *"`MediationInput` 은 T1이 확정한 4필드에서 늘어나지 않는다"* 를 규칙으로 못 박았고, 이 값은 **당사자의 속성이 아니라 실행 환경**이다. 와이어 형식(`docs/API.md` 요청 body)도 바뀌어 [FE] 목 데이터가 깨진다 |
| **발신자 로컬 기준으로 계산** | 발신자 타임존이 **계약에 없다**(사실 6). 브라우저 타임존을 추측해 채우면 Conventions 9("없는 값을 지어내지 않는다") 위반이고, 필드를 신설하면 PRD에 없는 요구사항 추가(AGENTS.md 금지)다. **두 금지를 동시에 지키는 선택지는 "UTC 유지 + 한계 명시" 하나뿐이다** |
| **전체 날짜(`YYYY-MM-DD`)를 payload에 싣기** | `prompts/c2.ts:55~64` 가 이미 기각한 안이다 — **매일 캐시가 깨진다.** 요구되는 것은 연도뿐이다 |
| **`referenceYear` 를 상수로 하드코딩** | 2027년에 조용히 틀린다. 앞선 버전이 예시 문구에 "2026"을 박아 둔 것이 바로 이 QA 지적의 원인이었다(`prompts/c2.ts:136`) |

## Consequences

**좋아지는 것**

- T28이 조립할 때 기준일의 출처가 **계약에 명시**된다 — 사람마다 다르게 구현할 여지가 사라진다.
- core가 시스템 시계를 읽지 않으므로 **T11 회귀 검증셋이 날짜에 흔들리지 않는다**(픽스처로 고정 가능). `packages/core/src/steps/c2.test.ts` 가 이미 `referenceDate: '2026-08-05'` 를 고정값으로 넣고 있다.
- 캐시 키가 요청 단위로 결정적이다.

**치르는 대가**

- `MediationDeps` 필드가 2 → 3으로 는다. Route Handler가 한 줄 더 두꺼워진다(F1-b가 이미 수용한 것과 같은 종류의 대가).
- 🔴 **연말 9시간 구간의 오차가 남는다.** 숨기지 않고 위 표로 적었다.

**재검토 조건(둘 중 하나가 발생하면 이 ADR을 supersede 한다)**

1. **실사용자 확장**(Planning Decision #27) — 발신자가 임의 타임존이 되는 순간 9시간/년은 더 이상 무시할 수 없다.
2. **연말 구간 시연·리허설** — 그때는 `MediationInput` 에 발신자 타임존을 넣는 **PRD/UX 레벨 변경**이 선행돼야 하며, architect가 단독으로 필드를 만들지 않는다.

## Follow-up

| # | 항목 | 담당 |
|---|---|---|
| 1 | T28에서 `deps.referenceDate` 를 조립하고 `route.ts:122` 의 인라인 `new Date()` 를 그 자리로 옮긴다 | implementer (T28) |
| 2 | `packages/core` 안에 `new Date()`/`Date.now()` 가 없음을 grep 1회로 확인해 출력 첨부 | implementer (T28) / reviewer |
| 3 | 연말 오차 한계를 발표에서 "없는 문제"로 말하지 않는다(AC-034 계열) | docs / [DS] |
