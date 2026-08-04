# ADR-0004: 코어 파이프라인의 두 번째 인자 — DB 조회물은 결과로 넘긴다

- Status: **accepted**
- Date: 2026-08-04
- Owner: architect
- DECISIONS.md entry: #36
- Freeze Point: **F1** (`packages/core/src/contract.ts` · `packages/core/src/pipeline.ts`, T1)

## Context

T1(F1 동결) 구현 중 implementer가 멈춘 지점이다.

- `docs/Architecture.md` Data Flow 파이프라인 ⑤: *"C5 용어사전 주입 ← dictionary_terms (프롬프트에 주입, 별도 LLM 호출 아님)"*
- 그런데 F1의 `MediationInput` 은 `{ text, sender, recipient, context }` **4필드**이고, `SenderContext` 는 *"프로필(빈 상태 가능) + 언어"* 로 한정돼 있다. **사전이 들어올 자리가 없다.**
- `docs/DECISIONS.md` **#22** 는 용어사전의 **스코프(사용자 단위)** 만 확정했다. **주입 경로를 기록한 행은 DECISIONS·adr 어디에도 없었다**(measured — 2026-08-04 `dictionary|용어사전|deps|주입` grep, 해당 행 0건).
- 같은 성격의 조회물이 최소 2건 더 있다: `pair_protocols`, `profile_learned_items`. `docs/API.md` `POST /api/mediate` 의 "읽는 테이블" 행은 6개 테이블을 열거하지만 **어느 인자로 들어가는지는 말하지 않았다.**
- 제약: `docs/Architecture.md` 의존 방향 규칙 — `packages/core` 는 `@supabase/*` 를 **import 할 수 없다**(ESLint `no-restricted-imports` 로 빌드 실패).
- 이미 있는 방향타: **ADR-0001 Consequences** — *"`packages/core` 가 순수하려면 LLM·저장소를 **인자로 주입**받아야 해서 함수 시그니처가 조금 길어진다."* 즉 "인자로 받는다"는 이미 accepted다. **미정이었던 것은 그 인자의 *모양*** 이다.
- 소비 태스크: **T10**(C5 주입) · **T28**(용어사전 화면/연동). 명시하지 않으면 두 사람이 서로 다르게 구현한다.

## Decision

**`run(input: MediationInput, deps: MediationDeps)` 로 고정한다. DB 조회물은 조회 *함수*가 아니라 조회 *결과*로 `deps.data` 에 담아 넘기며, 조회는 Route Handler가 `run()` 호출 전에 끝낸다.**

```ts
// packages/core/src/pipeline.ts — 🔒 Freeze Point F1
export function run(input: MediationInput, deps: MediationDeps): Promise<MediationResult>;

export interface MediationDeps {
  llm: LLMClient;          // 실행 수단 (구현은 apps/web/lib/llm/openai.ts)
  data: MediationData;     // 🔴 호출 전에 조회가 끝난 DB 산출물
}

export interface MediationData {
  dictionary: DictionaryEntry[];   // dictionary_terms  (사용자 스코프 — DECISIONS #22)
  learnedItems: LearnedItem[];     // profile_learned_items
}
```

### 어디에 넣을지의 판정표

| 이 값이 | then | 이유 |
|---|---|---|
| 당사자 1인의 **속성 객체**(발신자 프로필, 그 쌍의 규약, 수신자 국가·타임존) | `MediationInput` — T1이 확정한 4필드 구조 그대로 | `SenderContext.profile` / `RecipientContext.protocol` 에 **이미 자리가 있다.** 바꾸지 않는다 |
| 변환이 참조하는 **목록형 조회물**(사전 N행, 학습 항목 N행) | `deps.data` | 당사자 서술이 아니라 참조 자료이고 건수가 가변 |
| **실행 수단**(LLM, 향후 시계 등) | `deps` 최상위 | `LLMClient` 가 이미 이 자리 |
| core가 **직접 조회** | ❌ 금지 | `packages/core` 는 `@supabase/*` import 불가 |

🔴 **`MediationInput` 은 4필드에서 늘어나지 않는다.** 새 조회물은 전부 `deps.data` 로 가고, 표에 없는 케이스가 나오면 임의 판단하지 말고 **표에 행을 추가**한다.

| Option | Pros | Cons |
|---|---|---|
| **`deps.data` 에 조회 *결과*** ✅ | core가 **순수 함수**로 남는다 — Layers 절의 *"I/O는 전부 인자와 반환값으로만"* 그대로. T11(회귀 26건)이 저장소 목 없이 픽스처만으로 "하나의 실행 출력"을 낸다. 부분 실패 정책(Error Handling ④)이 Route Handler 한 곳에 남는다 | `CRITICAL` 로 C3를 건너뛸 때 `learnedItems` 조회 1건이 버려진다 |
| `deps.repo` 에 조회 *함수*(`loadDictionary(): Promise<…>`) | 필요한 것만 늦게 읽는다 | 🔴 저장소 실패가 **core 안에서** 발생한다 — *"예외는 `withApi()` 단 한 곳에서 잡는다"*(Error Handling)가 흐려지고, 어느 스텝이 실패를 삼킬지 사람마다 달라진다. 모든 단위 테스트가 가짜 repo를 필요로 한다 |
| `MediationInput` 에 필드 추가(`input.dictionary`) | 인자가 1개로 유지된다 | 🔴 **F1이 확정한 4필드를 늘린다.** `MediationInput` 은 "사용자 요청"이라는 의미를 잃고 조회물 가방이 된다 — 다음 조회물이 생길 때마다 F1이 다시 열린다 |
| core가 직접 조회 | Route Handler가 얇아진다 | 🔴 **AC-028 위반이자 빌드 실패.** 확장이 core를 번들할 수도 없게 된다 |

## Consequences

- **Positive**
  - core가 **순수 함수 1개**로 남아 `[BE-A]`·`[BE-B]`가 픽스처만으로 병렬 작업한다.
  - "어디서 읽는가"의 답이 **Route Handler 한 곳**이다 — `docs/API.md` 의 "읽는 테이블" 행이 곧 구현 위치다.
  - 새 조회물이 생겨도 F1의 `MediationInput` 을 다시 열지 않는다(판정표 행 추가로 끝난다).
- **Negative / 수용한 대가**
  - `urgency === 'CRITICAL'` 이면 C3를 건너뛰므로 `learnedItems` 조회 1건이 버려진다. 같은 요청이 이미 4~5건을 읽고 동시 10명(NFR Scale) 규모라 무시 가능하다.
  - 시그니처가 인자 2개로 길어진다(ADR-0001이 이미 예고한 대가).
  - `deps.data` 가 커지면 Route Handler가 두꺼워진다. 완화: 조회 코드는 `apps/web/lib/supabase/` 밖으로 나가지 않는다(Conventions 3).
- **Follow-ups required**
  1. **T1**: 위 타입을 `contract.ts`/`pipeline.ts` 에 반영해 F1을 동결한다. `MediationInput` 4필드는 그대로 둔다.
  2. **T10**: `deps.data.dictionary` 를 **구분자로 감싼 데이터 블록**으로 C2 프롬프트에 넣는다 — 지시문으로 취급하지 않는다(Security Abuse cases 12행). 이 책임은 `packages/core/src/prompts/` 에 있고 Route Handler에 있지 않다.
  3. **T28**: 사전 CRUD는 `deps.data.dictionary` 의 **소스 테이블만** 바꾼다 — core 시그니처를 건드리지 않는다.
  4. **리뷰 규칙**: `packages/core` 안에 `Promise` 를 반환하는 저장소성 인자가 새로 생긴 diff는 **반려**한다(예외: `LLMClient`). `MediationInput` 에 5번째 필드를 추가하는 diff도 반려하고 이 ADR의 판정표로 되돌린다.
