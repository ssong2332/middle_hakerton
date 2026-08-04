# ADR-0006: 계약의 불변식을 판별 유니온으로 강제한다 — 소급 테스트를 가능하게 만드는 최소 변경

- Status: **accepted**
- Date: 2026-08-04
- Owner: architect
- DECISIONS.md entry: #38
- Freeze Point: **F1** (`packages/core/src/contract.ts` · `packages/core/src/rules/*`, T1 산출물) · 영향 태스크: **T4 · T10 · T24 · T25 · T26 · T28**
- 관계: **ADR-0005 를 뒤집지 않고 그 Follow-up 2를 구체화한다** (아래 "ADR-0005와의 관계")

## Context

T1(F1 동결) PR은 **테스트 0건으로 머지**됐다 — *"T2 직후 소급 작성"* 을 조건으로 사용자가 skip을 승인했다. T2(Next.js 스캐폴드) 구현이 끝난 뒤 implementer가 그 소급 테스트(`packages/core/src/contract.test.ts`)를 쓰려다 **멈추고 보고**했다.

보고 내용은 정확했다. 소급 대상 불변식 3개는 전부 **"필드 2개의 조합"** 인데, `contract.ts` 는 그 두 필드를 **서로 독립된 프로퍼티로 선언한 일반 interface** 라서 불법 조합이 **타입상 항상 유효**하다.

| # | 명세가 요구하는 불변식 | 지금 컴파일을 통과하는 불법 조합 | 근거 |
|---|---|---|---|
| 1 | `offered === true` ⟺ `basis === 'signal_present'` | `{ offered: true, basis: 'undetermined' }` — 판정 근거가 없는데 티켓 링크를 띄운다(**fail-open**) | AC-058 · ADR-0005 · `contract.ts:385` 주석 |
| 2 | 근거가 없으면 `decisionAuthority` 는 반드시 `'불명'` | `{ decisionAuthority: '확정', decisionAuthorityEvidence: null }` — **근거 없는 확정** | AC-050① / AC-064⑤ · `contract.ts:519` 주석 |
| 3 | 근거가 없으면 `authorityStatus` 는 반드시 `'불명'` | `{ authorityStatus: '확정', authorityEvidence: null }` — 같은 문제의 **C7쪽** | AC-064⑤ *"양쪽 모두"* · `contract.ts:543` 주석 |

세 줄 모두 **주석에만 존재하는 불변식**이다. 그 결과 쓸 수 있는 테스트가 *"이 값이 타입에 대입 가능하다"* 뿐인데, 그것은 **항상 참이라 무의미하다(트리비얼 그린)**. `docs/CodingRules.md` Tests 절이 이미 이 함정을 이름 붙여 금지한다 — *"구조 검사는 내용이 옳다는 증거가 아니다"* 와 같은 계열이다.

제약 3개가 선택지를 좁힌다:

- `contract.ts` 는 **런타임 import 0개**가 T1의 명시적 설계 결정이다(파일 헤더 제약 1). zod를 그 파일에 넣을 수 없다.
- 런타임 검증기가 있어야 할 자리(`apps/web/lib/http.ts`, `apps/web/lib/llm/openai.ts`)의 **zod 스키마가 아직 존재하지 않는다**(T4 이후 범위).
- **F1은 동결 지점**이다 — 바꾸려면 이 ADR이 필요하고, 4명의 병렬 작업 전제를 흔들지 않아야 한다.

## Decision

**불법 상태를 표현 불가능하게 만든다 — 세 지점을 판별 유니온으로 바꾸고, 짝을 만드는 통로를 함수 2개로 좁힌다. 경계(zod)의 역할은 "거부"가 아니라 "복원"으로 고정한다.**

### 1) 타입 (F1 변경)

```ts
// packages/core/src/rules/decision-authority.ts  — enum·판정 로직 단일 출처(AC-064④)
export type DecisionAuthorityStatus = '확정' | '내부 승인 필요' | '검토 중' | '불명';   // 기존, 불변
export type DecisionAuthorityJudged = Exclude<DecisionAuthorityStatus, '불명'>;         // 신규

/** 🔴 필드 이름이 중립이다 — `status`/`evidence` 는 어떤 응답 payload에도 나가지 않는다(AC-064③ 보호). */
export type AuthorityVerdict =
  | { status: DecisionAuthorityJudged; evidence: string }
  | { status: '불명';                  evidence: string | null };
```

```ts
// packages/core/src/contract.ts  — 🔒 F1
export type TicketOption =
  | { offered: true;  basis: 'signal_present' }
  | { offered: false; basis: 'signal_absent' | 'undetermined' };

export interface TicketResultBase { sections: TicketSections; source: ResponseSource }
export type TicketAuthority =
  | { decisionAuthority: DecisionAuthorityJudged; decisionAuthorityEvidence: string }
  | { decisionAuthority: '불명';                  decisionAuthorityEvidence: string | null };
export type TicketResult = TicketResultBase & TicketAuthority;

export interface DecisionItemBase { decision: string; owner: string | null; dueDate: string | null }
export type ItemAuthority =
  | { authorityStatus: DecisionAuthorityJudged; authorityEvidence: string }
  | { authorityStatus: '불명';                  authorityEvidence: string | null };
export type DecisionItem = DecisionItemBase & ItemAuthority;
```

🔴 **와이어 형식(JSON)은 바뀌지 않는다.** 필드 이름·순서·값 어휘가 전부 그대로이므로 **F2(`docs/API.md`)·[FE] 목 데이터·HTTP 응답 예시는 영향받지 않는다.** 바뀐 것은 **불법 조합이 타입에서 사라진 것**뿐이다. 기존 목 데이터가 깨진다면 그 목 데이터가 애초에 명세 위반이었다는 뜻이다.

### 2) 생성자 (짝을 손으로 쓰지 않는다)

⚠️ 아래 둘은 **시그니처 표기**다 — 본문 없는 함수 선언을 `.ts` 에 그대로 쓰면 컴파일되지 않는다(ADR-0004 Addendum A, TS2391). 각 주석 줄이 본문 전부다.

```ts
// packages/core/src/rules/ticket-gate.ts   — 신규 파일
export function ticketOptionFrom(basis: TicketOptionBasis): TicketOption
//   return basis === 'signal_present' ? { offered: true, basis } : { offered: false, basis };

// packages/core/src/rules/decision-authority.ts  — 기존 파일에 추가
export function resolveAuthority(status: DecisionAuthorityStatus, evidence: string | null): AuthorityVerdict
//   return evidence === null || status === '불명' ? { status: '불명', evidence } : { status, evidence };
//   근거가 없으면 '불명' 으로 되돌린다 — 판정을 지어내지 않는다(Conventions 9).
```

`resolveAuthority` 는 **불변식 가드**이지 판정기가 아니다 — 텍스트에서 상태를 뽑는 **판정 로직 본체는 T24가 같은 파일에 추가하고 T26이 재사용**한다(AC-064④ 불변).

TypeScript는 두 변수의 상관관계를 추론하지 못하므로(correlated union) 생성 지점에는 **분기 한 번**이 필요하다. 그 분기가 곧 불변식이 서는 자리다:

```ts
const v = resolveAuthority(raw.status, raw.evidence);
const authority: TicketAuthority =                       // C7이면 ItemAuthority + 다른 두 이름
  v.status === '불명'
    ? { decisionAuthority: '불명',  decisionAuthorityEvidence: v.evidence }
    : { decisionAuthority: v.status, decisionAuthorityEvidence: v.evidence };
return { sections, ...authority, source };
```

### 3) 경계 — 거부가 아니라 복원

| 지점 | 정책 | 근거 |
|---|---|---|
| LLM 응답 파싱(`apps/web/lib/llm/openai.ts`, **T4**) | **느슨한 쌍**으로 파싱한다(`status` enum + `evidence: string \| null`). 불법 조합이 와도 **요청 전체를 실패시키지 않는다** | Error Handling ④ *"부분 실패는 오류가 아니다"* · AC-041 |
| 정규화(core의 생성자 2개) | 느슨한 쌍 → 계약 타입. 근거 없으면 `'불명'`, 판정 없으면 `undetermined` + `offered:false`(**fail-closed**) | Conventions 9 · AC-050① · AC-058 |
| 응답 재검증 | **두지 않는다 — N/A** | 검증 지점이 둘이면 같은 입력이 두 가지로 판정된다(DECISIONS #12) |

🔴 **계약 타입을 zod로 표현할 일이 생기면 `z.discriminatedUnion` 을 쓴다.** `z.object({ offered: z.boolean(), basis: z.enum([...]) })` 는 불법 조합을 되살려 이 ADR을 무효화한다.

### 검토한 대안

| Option | Pros | Cons |
|---|---|---|
| **판별 유니온 + 생성자 2개** ✅ | 불법 상태가 **표현 불가능**해진다. **소급 테스트가 오늘 가능**해진다(타입 3건 + 런타임 2건). 적용 비용이 지금 사실상 0(생성 코드 0줄) | 생성 지점에서 분기 1회 강제. 계약 타입 3개가 `interface` → `type`. C6·C7 유니온이 두 벌로 중복 |
| 런타임 validator(zod)만, 경계에서 | 실제 데이터를 막는다. F1을 안 건드린다 | 🔴 **스키마가 아직 없다(T4 이후)** — 소급 테스트가 다시 막힌다. 🔴 올바른 경계 정책은 *복원*이라 경계는 불변식을 **증명하는** 자리가 아니다. 타입이 열려 있으면 **복원을 빠뜨린 코드가 그대로 컴파일**된다 |
| 주석 + 리뷰 규칙 유지 | 변경 0 | 🔴 지금 상태다. **테스트가 존재할 수 없다** — 지시("소급 테스트를 의미 있게 만들라")의 답이 아니다 |
| core 곳곳에 `assert…()` 던지기 | 런타임에 잡힌다 | 🔴 던지는 위치가 흩어져 *"예외는 `withApi()` 한 곳"*(Error Handling)이 무너지고, **부분 실패가 오류로 승격**돼 AC-041과 충돌한다 |
| C6·C7 유니온을 제네릭 하나로 공유 | 중복 제거 | 🔴 **필드 이름이 타입 파라미터가 되어 AC-064③의 grep 판정이 흐려진다.** 두 이름이 각자의 경로에만 나타나는지를 코드 검색으로 확인하는 것이 그 AC의 판정 방법이다 |

## ADR-0005와의 관계

ADR-0005 Follow-up 2는 *"`offered === true` ⟺ `basis === 'signal_present'` 불변식을 `packages/core/src/pipeline.ts` 한 곳에서 세운다"* 였다. **이 ADR은 그것을 뒤집지 않고 구체화한다** — *어디서 세우는가*(파이프라인 안, 판정 산출 지점)는 그대로이고, *무엇으로 세우는가*가 **"손으로 쓴 객체 리터럴"에서 "생성자 1개 + 타입"** 으로 바뀐다. ADR-0005가 확정한 **필드 형식·감정 점수/라벨 배제·저장·로그 금지**는 전부 유효하다.

## Consequences

- **Positive**
  - 소급 테스트 `contract.test.ts` 가 **트리비얼 그린이 아닌 형태로 작성 가능**해진다 — 불법 조합 3개 위의 `// @ts-expect-error` 가 실제 주장이 된다.
  - red/green을 **이미 있는 게이트에서** 얻는다: `packages/core/tsconfig.json:6` 의 `"include": ["src"]` 가 `*.test.ts` 를 포함하고 `packages/core/package.json:9` 의 `tsc --noEmit` 이 루트 `npm run typecheck` 에 물려 있다(measured, 2026-08-04). 새 러너·새 설정이 **0개**다.
  - AC-058의 **fail-closed 정책이 코드 위치를 갖는다**(`ticketOptionFrom`) — T24가 그 정책을 다시 결정하지 않는다.
  - 리뷰가 판단에서 **기계 판정**으로 바뀐다: 불법 조합은 빌드가 막는다.
- **Negative / 수용한 대가**
  - 생성 지점마다 **분기 1회**. `TicketResult`·`DecisionItem` 이 `type` 이라 선언 병합이 불가능하고 hover가 교차형으로 보인다.
  - **같은 모양의 유니온이 두 벌** 존재한다(C6·C7). 의도된 중복이며 위 대안 표 마지막 행이 이유다.
  - `Partial<TicketResult>` 같은 **부분 조립 패턴이 어려워진다** — 값을 조각내 만들지 말고 생성자를 거치라는 것이 이 설계의 요구다.
- **⚠️ 미확인 사항 (architect는 셸이 없어 `tsc` 를 실행하지 않았다)**
  - *"T1 산출물을 깨지 않는다"* 는 **grep 기반 추론**이다(2026-08-04 measured: 세 타입을 **생성**하는 코드 0줄 — 히트는 `contract.ts` 선언부와 `llm/client.ts:72` 주석뿐, `steps/c6.ts` 등은 `export {}` 스텁). 확인 수단: implementer의 `npm run typecheck` · `npm test` 출력.
  - `Base & (A | B)` 교차형에서의 판별 narrowing 동작. **사전 승인된 대체 인코딩**: 기대대로 narrowing 되지 않으면 `TicketResultBase`/`DecisionItemBase` 를 각 유니온 멤버에 펼쳐 넣은 **완전한 두 interface의 union** 으로 바꿔도 된다(의미 동일, 중복만 증가). architect 재호출 없이 진행하고 **어느 인코딩을 썼는지 보고에 적는다.**
- **Follow-ups required**
  1. **현 T2 브랜치의 소급 작업**: 위 타입 3건 + `rules/ticket-gate.ts` + `resolveAuthority` + 테스트 3파일(`contract.test.ts` / `rules/ticket-gate.test.ts` / `rules/decision-authority.test.ts`). 🔴 **`contract.test.ts` 에는 런타임 `test()` 가 최소 1개 있어야 한다** — 타입 단언만 있으면 Vitest가 *"No test suite found"* 로 실패한다. `@ts-expect-error` 를 `test()` 본문에 넣고, **이 파일의 근거는 `npm run typecheck` 출력**임을 보고에 명시한다.
  2. **`@ts-ignore` 금지**: `@ts-expect-error` 를 써야 한다. `@ts-ignore` 는 조합이 합법이 돼도 조용히 통과해 테스트가 죽은 줄도 모르게 된다(Conventions 13 위반 판정 ④).
  3. **T4**: LLM 응답을 **느슨한 쌍**으로 파싱하고 core 생성자로 정규화한다. 불법 조합을 이유로 `LLM_MALFORMED` 를 던지지 않는다. ⚠️ `docs/Tasks.md` 는 planner 소유이므로 이 ADR은 **"T4가 소유해야 한다"는 결론만** 남긴다(근거: `docs/Tasks.md:32`).
  4. **T24 / T26**: 판정 로직 본체를 `rules/decision-authority.ts` 에 두고 **양쪽이 같은 함수를 쓴다**(AC-064④). 생성은 위 분기 형태로만 한다.
  5. **T25 / T27**: 읽는 쪽은 그대로다 — `ticketOption.offered` / `decisionAuthority` / `decisions[].authorityStatus`. 유니온이라 `if (x.authorityStatus === '불명')` 로 좁히면 `authorityEvidence` 가 `string` 으로 확정된다.
  6. **리뷰 규칙**: Conventions 13의 위반 판정 4개(①~④)를 그대로 적용해 반려한다.
