# ADR-0009: 응답 출처를 스텝별로 노출한다 (`MediationResult.stepSources`)

- Status: **accepted**
- Date: 2026-08-05
- Owner: architect
- DECISIONS.md entry: #48
- Freeze Point: **F1** (`packages/core/src/contract.ts`) — F1 동결 후 **다섯 번째** 변경(F1-a·F1-b·F1-c·F1-d에 이어 **F1-e**)
- 소비 태스크: **implementer 다음 유지보수 라운드**(route.ts·UI·테스트). 이 커밋은 **계약만** 바꾼다.
- 관련 AC: **AC-041**(폴백 표시) · **AC-001·AC-002**(역번역 안전장치) · AC-032(고정 순서)

## Context

T15/T16 유지보수 라운드에서 implementer가 `ComparisonView.tsx` 에 "폴백 응답 사용 중" 배지를 추가했다가 **라이브 콘텐츠를 폴백으로 오표시하는 반대 방향의 결함**이 생겨 순수 원복했고(reviewer 2라운드가 원복이 옳다고 확인, QA는 이 상태가 AC-041을 위반하지 않음을 재확인), *"어느 영역에 배지를 붙여야 정확한가"* 를 **계약 소유자에게** 넘겼다(`apps/web/components/ComparisonView.tsx:33~39` Open Question).

측정 사실(전부 architect가 2026-08-05 직접 열람):

| # | 사실 | 근거 |
|---|---|---|
| 1 | `MediationResult` 의 출처 필드는 **단일 `source`** 하나뿐이다 | `packages/core/src/contract.ts` `MediationResult` |
| 2 | 그런데 이 라우트는 LLM을 **3회** 호출한다(C1·C2·C4) | `apps/web/app/api/mediate/route.ts:96`·`:118`·`:131` |
| 3 | **출처는 호출마다 따로 결정된다** — 판정이 `complete()` 안에 있다 | `apps/web/lib/llm/openai.ts:253`(cache)·`:323`(live)·`:335`(fallback) |
| 4 | 요청 상한 판정도 **호출마다** 이뤄진다 → 한 요청의 C1과 C2 사이에서 상한이 넘어갈 수 있다 | `apps/web/lib/llm/openai.ts:261~281` |
| 5 | 스텝 자신도 스키마 검증 실패 시 폴백으로 **강등**한다 | `packages/core/src/steps/c1.ts:92` · `c2.ts:172` · `c4.ts:102` |
| 6 | 세 값을 **하나로 합치는 규칙은 어느 문서에도 없었다** — 라우트가 그 자리에서 정했다 | `route.ts:70~84`(주석이 *"어디에도 명시가 없어"* 라고 적고 있다) |
| 7 | 🔴 **폴백 c4 문구는 폴백 c2 문구를 역번역해 작성된 고정 문자열이다** | `packages/core/src/data/fallback-responses.ts:58~62`(작성 경위)·`:96~100`(내용) |
| 8 | 그래서 c1/c2/c4 폴백 3건은 **셋이 함께 뜰 때만** 정합하도록 U-01 하나로 통일돼 있다 | 같은 파일 `:38~44` |
| 9 | UX는 라벨을 **결과 근처**에 두라고 규정한다 | `docs/UX.md` Interaction Patterns(:920) *"a visible, persistent label … **near the result**"* |
| 10 | 세 값은 라우트가 **이미 손에 들고 있다** | `route.ts:135` — `[classification.source, toneSource, backTranslationSource].reduce(combineSource)` |

**문제의 크기는 배지가 아니다.** 사실 7·8에 의해 **C2 live + C4 fallback** 이면 `backTranslation` 은 화면에 보이는 `transformed` 의 역번역이 **아니다**(전혀 다른 문장의 역번역이다). AC-001/AC-002가 세워 둔 *"완전한 검증은 아니지만 큰 오역은 걸러낸다"* 는 안전장치가 **아무 표시 없이** 무력화된다. 단일 `source` 로는 이 상태를 화면이 알아챌 방법이 없다.

## Decision

### D1 — `MediationResult` 에 `stepSources` 를 13번째 필드로 **덧붙인다** (F1-e)

```ts
// packages/core/src/contract.ts — 🔒 Freeze Point F1
export interface StepSources {
  c1: ResponseSource;   // 산출물: urgency(판정분) · urgencyReason
  c2: ResponseSource;   // 산출물: transformed · reason · preserved[] · misreadRisks[]
  c4: ResponseSource;   // 산출물: backTranslation
}

export interface MediationResult {
  /* …기존 12개 필드는 이름·순서·타입·값 어휘 모두 그대로… */
  source: ResponseSource;      // 유지 — 화면 레벨 단일 배지의 입력
  stepSources: StepSources;    // 🔴 13번째
}
```

- **세 키 전부 필수**다. AC-032 고정 순서상 세 스텝은 `POST /api/mediate` 에서 **항상 실행**되므로 "값이 없는 스텝"이 존재하지 않는다(contract.ts 헤더 *"선택적 프로퍼티를 쓰지 않는 이유"* 그대로).
- 🔴 **C6·C7은 넣지 않는다.** 별도 엔드포인트이고 각각 LLM 호출이 1회라 `TicketResultBase.source` · `SummaryResult.source` 의 단일 값이 이미 정확하다.

### D2 — `source` 는 파생값으로 **남긴다**, 불변식은 문서로 고정한다

`source` = `stepSources` 의 세 값 중 **가장 신뢰도가 낮은 것**(`fallback` > `cache` > `live`). 이는 `route.ts:82` 의 `combineSource` 가 명세 없이 쓰던 규칙(사실 6)을 계약으로 승격한 것이다.

🔴 **F1-c처럼 타입으로 강제하지 않는다.** 판별 유니온은 *짝* 제약(`offered` ⟺ `basis`)에 통하는 기법이고, 여기 불변식은 **세 값의 집계**라 유니온으로 쓰면 3³ = 27조합이 된다 — 지키려는 것보다 큰 사고 표면이 생기고 읽을 수 없는 타입이 남는다. 대신:

1. 파생을 **함수 하나**로만 한다(웹·확장이 각자 재구현하지 않도록 `packages/core/src/rules/` 가 자연스러운 자리 — 파일명은 implementer 재량).
2. 그 함수의 테스트가 불변식의 근거가 된다(Conventions 13 *"짝을 손으로 조립하지 않는다"* 와 같은 취지).

### D3 — 소비 매핑은 architect가 고정하고, 시각 표현은 ux-design에 남긴다

| 값 | 이 영역의 진실 | 현재 컴포넌트 |
|---|---|---|
| `stepSources.c1` | `urgency`(판정분) · `urgencyReason` | `UrgencyPanel.tsx` |
| `stepSources.c2` | `transformed` · `reason` · `preserved[]` · `misreadRisks[]` | `ComparisonView.tsx` |
| `stepSources.c4` | `backTranslation` | `BackTranslationPreview.tsx` |
| `source` | 응답 전체 | 화면 레벨 1개 |

🔴 **배지를 3개 다 띄울지, 화면 레벨 1개 + 문제 영역만 띄울지는 ux-design 소관**이다. architect가 고정하는 것은 *"어느 값이 어느 영역의 진실인가"* 까지이며, 이 표는 계약이 무엇을 가능하게 하는지를 적은 것이다.

## Alternatives considered

| 대안 | 기각 이유 |
|---|---|
| **단일 `source` 유지 + "부분 폴백 시 구분 불가"를 설계 제약으로 문서화** | AC-041의 최소 요구(*배지가 뜬다*)는 지금도 충족되지만(QA 확인), `docs/UX.md`:920은 라벨을 **near the result** 에 두라고 요구한다 — 영역을 특정하지 못한다고 확정하면 **그 문언을 영구히 못 지킨다고 선언**하는 것이다. 더 결정적으로 사실 7·8의 역번역 불일치(AC-001/AC-002)는 *표시* 문제가 아니라 **정확성** 문제라 문서화로 해소되지 않는다. 비용 논거도 성립하지 않는다 — 사실 10에 의해 값이 이미 존재하고 계층이 늘지 않는다(설계 제1원칙 R1 무영향) |
| **`source` 를 제거하고 `stepSources` 만 남긴다** | 와이어 형식의 기존 필드를 없애는 **첫 F1 변경**이 된다(지금까지 5건 모두 기존 필드 불변). UX-004 States "Fallback"의 화면 레벨 배지, 확장 어댑터, 기존 테스트(`BackTranslationPreview.test.tsx` · `MediationWorkspace.test.tsx` 등)가 한꺼번에 무너진다. 얻는 것은 "중복 제거"뿐이고, 그 중복은 D2의 파생 함수 1개로 이미 통제된다 |
| **`sources` 라는 이름** | 기존 `source` 와 **한 글자 차이**다. TypeScript가 대부분의 오용을 잡지만(객체 ↔ 문자열 비교는 타입 오류), 리뷰·grep·문서에서 사람이 읽어야 하는 이름이라 **눈으로 구분되는 이름**을 택했다. AC-064 ③이 `decisionAuthority`/`authorityStatus` 를 일부러 다른 이름으로 둔 것과 같은 계열의 판단 |
| **`Partial<Record<LLMStep, ResponseSource>>` 또는 `{ step, source }[]`** | 세 스텝이 항상 실행되므로(D1) 선택성·가변 길이가 표현할 것이 없다. 오히려 "없는 스텝"이라는 상태가 타입에 생겨 *"화면이 어느 키를 읽어야 하는가"* 가 호출부마다 갈린다 — contract.ts 헤더가 `?` 를 금지한 바로 그 이유다. `LLMStep`(c1·c2·c4·c6·c7)을 키로 쓰면 이 응답에 존재할 수 없는 c6/c7 자리가 열린다 |
| **판별 유니온으로 불변식 강제(F1-c 방식)** | 3³ = 27조합. D2 참조 |
| **C6·C7 결과에도 같은 구조 적용** | 두 경로는 **LLM 호출이 1회**라 합쳐서 잃는 정보가 없다. 구조를 퍼뜨리면 계약만 두꺼워진다 |

## Consequences

**좋아지는 것**

- 배지를 **정확한 영역**에 붙일 수 있다 — 라이브 콘텐츠 오표시(원복 사유)와 통조림 콘텐츠 무표시가 **둘 다** 사라진다.
- 🔴 **역번역이 변환문과 무관해지는 상태를 화면이 알 수 있다**(사실 7·8). AC-001/AC-002의 안전장치가 조용히 죽지 않는다.
- 합치기 규칙이 **명세 없는 라우트 지역 결정**에서 **계약 + 함수 1개**로 올라간다 — T28이 파이프라인을 조립할 때 재발명하지 않는다(`route.ts:78~79` 주석이 예고한 재검토 지점의 처리).
- QA가 "부분 폴백"을 **응답만 보고** 판정할 수 있다(AC-063 ②·F1-a의 `signal_absent`/`undetermined` 분리와 같은 원칙: 화면이 같아도 내부 상태는 구분한다).

**치르는 대가**

- 🔴 **파생값 중복.** `source` 와 `stepSources` 가 어긋날 수 있다 — 타입이 막지 못한다(D2). 갚는 방법은 파생 함수 1개 + 그 테스트뿐이며, 그 이하로는 이 대가가 남는다.
- 🔴 **필수 프로퍼티가 늘어 기존 리터럴이 컴파일되지 않는다**(F1-a 때와 같은 성격). 영향 지점은 아래 Follow-up 3·4. **이 커밋만으로는 타입체크가 통과하지 않는다** — 계약과 구현을 한 라운드에 묶지 말라는 이번 라운드의 지시에 따른 의도된 상태이며, 숨기지 않는다.
- 계약 필드가 12 → 13으로 는다.

**재검토 조건**

1. **파이프라인에 LLM 호출 스텝이 추가된다면**(예: C6를 `POST /api/mediate` 안으로 들이는 변경) `StepSources` 에 키를 추가하는 것이 아니라 **먼저 이 ADR을 다시 연다** — 키가 늘수록 "항상 실행"이라는 D1의 전제가 약해진다.
2. **화면이 영역별 배지를 쓰지 않기로 ux-design이 결정하면**(화면 레벨 1개만 유지) `stepSources` 는 내부 상태·테스트 출력 전용 필드로 남는다 — 그래도 제거하지 않는다. AC-001/AC-002의 역번역 불일치 판정에 여전히 필요하기 때문이다.

## Follow-up

| # | 항목 | 담당 |
|---|---|---|
| 1 | `route.ts` 가 `stepSources: { c1: classification.source, c2: toneSource, c4: backTranslationSource }` 를 채운다 | implementer |
| 2 | `combineSource`(`route.ts:81~84`)를 `packages/core` 의 파생 함수 한 곳으로 옮기고 불변식 테스트를 붙인다 | implementer |
| 3 | 필수 프로퍼티 증가로 깨지는 리터럴 수정(추정 — 확인 방법 `npm run typecheck`): `route.ts:145` · `SenderPanel.test.tsx:109`·`:140`·`:175`·`:213` · `MediationWorkspace.test.tsx:24` 인근 | implementer |
| 4 | `route.test.ts:146~170` 의 **"12개 필드" 키 집합 단언 → 13개** 갱신(테스트 이름 포함) | implementer |
| 5 | `ComparisonView.tsx:33~39` Open Question 주석을 이 ADR 참조로 갱신 + 배지를 `stepSources.c2` 로 복원. `SenderPanel.tsx:119~122` 주석도 함께. `BackTranslationPreview` 는 `source` → `stepSources.c4` | implementer |
| 6 | 영역별 배지의 시각 표현을 UX-004 States/Interaction Patterns에 확정 | ux-design (선택) |
| 7 | 부분 폴백 케이스(C2 live + C4 fallback)를 회귀 케이스로 둘지 판단 — **AC 신설이 아니라 기존 AC-001/AC-041의 관측 지점**이므로 태스크·케이스 신설 여부는 planner 소관 | planner |
