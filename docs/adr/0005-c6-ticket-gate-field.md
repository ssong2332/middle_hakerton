# ADR-0005: C6 티켓 게이트 판정 필드 — 감정 점수·라벨을 계약에 두지 않는다

- Status: **accepted**
- Date: 2026-08-04
- Owner: architect
- DECISIONS.md entry: #35
- Freeze Point: **F1** (`packages/core/src/contract.ts`, T1) · 영향 태스크: **T25**([FE] UX-004)

## Context

T1(F1 동결) 구현 중 implementer가 멈춘 두 번째 지점이다.

- `docs/API.md` `POST /api/ticket` "게이트" 행: *"감정 신호가 낮은 입력에는 이 라우트를 호출하는 링크가 애초에 렌더되지 않는다(AC-058). **게이트 판정은 `POST /api/mediate` 응답에 포함되며** 이 라우트가 자체 게이트를 만들지 않는다."*
- 그러나 같은 문서의 `POST /api/mediate` Response 200 필드 목록은 **11개**였고 감정 신호·게이트 관련 필드가 **없었다**. `docs/Architecture.md` F1 코드 블록도 동일했다.
- 즉 **위치는 이미 확정돼 있었고 빠진 것은 형식**이다. 그 결과 T25가 링크 렌더 여부를 판정할 입력이 계약에 존재하지 않았다.
- **AC-058**(`docs/PRD.md`): *"① 대조군 케이스 최소 1건에서 옵션 미제시를 확인하고, ② 감정형 케이스에서는 정상적으로 제시됨을 함께 확인해 "항상 제시" 또는 "항상 미제시"가 아님을 증명한다."*
- **UX-004**(`docs/UX.md`)가 이미 두 상태를 정의했다: `TicketLinkVisible` / `TicketLinkAbsent` — *"never a disabled/greyed link"*. UX-007의 Entry도 *"reachable only when the emotional-signal detector fired"* 다.
- 🔴 **법적 제약**: `docs/PRD.md` Risks의 **EU AI Act Article 5(1)(f)**(직장 내 감정 추론 AI 금지, 2025-02-02 발효 — PRD 표기 measured) 행이 R4 제거 후 *"남은 사정권은 두 개뿐"* 이라며 **AC-018 [우려 수준]** 과 **AC-058 감정 신호 판정**을 지목한다. 그 방어 서술은 *"전부 **발신자 본인이 방금 입력한 자기 텍스트**를 대상으로 하고 결과도 **본인에게만** 표시된다"* 이다.
- **AC-070②**: 감정 분류의 부재를 *"감정 분류 함수·프롬프트·LLM 호출·저장 필드가 모두 부재함을 **코드 검색으로 확인**"* 하도록 요구한다 — 판정 방법이 grep이다.

이 ADR이 답해야 할 것: **AC-058을 검증 가능하게 만들면서, 응답 payload에 남는 감정 관련 산출물을 최소로 묶는 형식은 무엇인가.**

## Decision

**`MediationResult` 의 12번째 필드로 `ticketOption` 을 추가한다. 감정 점수·감정 라벨·감정 자연어 서술은 계약에 두지 않는다.**

```ts
// packages/core/src/contract.ts — 🔒 Freeze Point F1
export type TicketOptionBasis = 'signal_present' | 'signal_absent' | 'undetermined';

export interface TicketOption {
  offered: boolean;          // 🔴 화면이 읽는 유일한 값
  basis: TicketOptionBasis;  // 🔴 내부 상태·테스트 출력 전용. 렌더하지 않는다
}
```

불변식: `offered === true` ⟺ `basis === 'signal_present'`. `'undetermined'`(판정 근거 없음 — C2 호출 실패·폴백 등)는 **fail-closed**로 `offered:false`.

**기존 11개 필드의 배치·이름·타입은 바꾸지 않는다** — `docs/Architecture.md` *"필드 배치 판정은 이미 Planning Decision #49 / T1이 확정했다"* 는 그대로 유효하며, 이 결정은 **12번째를 덧붙이는 것**이다.

| Option | Pros | Cons |
|---|---|---|
| **`{ offered, basis }`** ✅ | AC-058의 두 케이스를 boolean 하나로 검증. `basis` 가 **정상 대조군(`signal_absent`)과 판정 실패(`undetermined`)를 구분**해 QA가 AC 통과와 파이프라인 고장을 혼동하지 않는다. 응답에 감정 등급·문장이 남지 않는다 | 필드가 객체라 FE가 `.offered` 를 한 번 더 타고 들어간다 |
| `ticketOptionOffered: boolean` (플랫) | 가장 단순 | 🔴 **부분 실패가 정상 판정으로 위장된다** — 근거를 못 얻어 `false` 인 것과 신호가 없어 `false` 인 것이 구분 불가. AC-058 대조군 통과를 QA가 증명할 수 없다 |
| `ticketOption: boolean \| null` | 3상태를 표현 | 🔴 `if (x)` 에서 `null` 과 `false` 가 같아 보인다. 타입은 구분하는데 코드가 구분하지 않는 최악의 조합 |
| `emotionScore: number` (+ 임계값 비교는 FE) | 임계값 튜닝이 배포 없이 가능 | 🔴 **응답 payload가 "사람의 감정 상태에 대한 등급 판정"이 된다** — PRD의 EU AI Act 방어 서술("본인 입력의 자기 확인")과 정면으로 어긋난다. 판정 로직이 FE로 새어 나가 Conventions 6(임계값은 `constants.ts` 한 곳)도 깨진다 |
| `emotionLabel: '분노'\|'불만'\|…` | 화면에 이유를 보여줄 수 있다 | 🔴 위와 같고 더 나쁘다 — **감정 라벨은 그 자체로 감정 인식 산출물**이다. AC-058은 라벨을 요구하지 않는다(요구는 옵션 제시 여부뿐) |
| 게이트를 `POST /api/ticket` 로 이동 | mediate 응답이 11개로 유지 | 🔴 `docs/API.md` 가 명시적으로 배제한 안이다(*"이 라우트가 자체 게이트를 만들지 않는다"*). 판정기가 둘이면 같은 입력이 두 가지로 갈리고, 무엇보다 **링크를 렌더할지는 티켓 라우트를 호출하기 *전에* 알아야 한다** |

### 감정 점수·라벨을 배제한 근거 (이 ADR의 핵심)

1. **AC-058이 요구하는 것은 판정 결과뿐이다.** 등급·확신도·라벨을 요구하는 문장이 없다. 요구되지 않은 감정 데이터를 만들어 응답에 실으면 **AC가 아니라 우리가 노출을 늘린 것**이 된다.
2. **PRD의 방어선과 정합해야 한다.** 남은 사정권 2건의 방어 논리는 "본인 입력에 대한, 본인만 보는 자기 확인"이다. 점수·라벨은 그 산출물의 성격을 **"사람의 감정 상태에 대한 등급 판정"** 으로 바꾼다.
3. **AC-070②의 판정 방법이 grep이다.** 계약에 `emotion*` 필드가 생기면 *"감정 분류 함수·프롬프트·저장 필드 부재"* 를 코드 검색으로 확인할 때 **잡음이 섞인다.** 필드명을 제품 결정(*티켓 옵션을 제시했는가*)으로 지으면 그 검증이 깨끗하게 유지된다.
4. **완곡어법도 쓰지 않는다.** `basis` 값은 PRD 어휘(`signal_present`)를 그대로 쓴다 — 무엇을 하는지 감추는 이름은 AC-034 계열의 다른 문제다.

### 저장·로그·노출 범위

| 항목 | 결정 |
|---|---|
| 저장 | **없음.** `POST /api/mediate` 는 저장하지 않고 `sent_messages` 에 감정 컬럼이 없다(AC-070②). `docs/Database.md` 변경 **0건** |
| 로그 | **없음.** DECISIONS #27의 구조화 로그 필드 목록에 추가하지 않는다 |
| 노출 | **발신자 본인만.** 관리자·수신자·제3자 전달 경로 없음(AC-018과 같은 방어선) |
| AC-058 증거 | **T11 회귀 검증셋의 실행 출력**(대조군 1건 + 감정형 1건). 운영 로그가 아니다 |

## Consequences

- **Positive**
  - T25가 `ticketOption.offered` 하나로 렌더를 판정한다 — UX-004의 `TicketLinkVisible`/`TicketLinkAbsent` 두 상태와 1:1.
  - AC-058이 **테스트 2건으로 증명 가능**해진다("항상 제시/항상 미제시가 아님").
  - 판정기가 파이프라인 한 곳에 남아 `POST /api/ticket` 이 게이트를 중복 구현하지 않는다.
  - 응답·DB·로그 어디에도 감정 등급이 남지 않아 PRD의 EU AI Act 방어 서술이 코드와 일치한다.
- **Negative / 수용한 대가**
  - **AC-058의 보장은 UI 레벨이다.** `POST /api/ticket` 을 직접 호출하는 경로는 막지 않는다. 잔여 표면은 Security Abuse cases 13·14행이 다룬다(결과는 입력자 본인에게만 표시). 라우트에 게이트를 하나 더 두는 대가(판정기 이중화)가 이 잔여 위험보다 크다고 판단했다.
  - 게이트가 왜 안 떴는지 사용자에게 설명하지 않는다(`basis` 미렌더). AC-058은 설명을 요구하지 않으며, 설명을 렌더하는 순간 그것이 곧 감정 서술이 된다.
  - ⚠️ **리스크는 0이 되지 않는다.** PRD가 이미 *"AC-018·AC-058이 여전히 감정 관련 처리를 하므로 리스크가 0이 되지 않는다"* 고 명시했고 **법률 자문은 없다(추정)**. 이 ADR이 하는 일은 노출을 AC-058이 요구하는 최소치로 묶는 것이지 안전을 단정하는 것이 아니다.
- **Follow-ups required**
  1. **T1**: `TicketOption`/`TicketOptionBasis` 를 `contract.ts` 에 반영하고 `MediationResult` 12번째 필드로 추가한다. 기존 11개는 손대지 않는다.
  2. **T10 / T28**: `offered === true` ⟺ `basis === 'signal_present'` 불변식을 **`packages/core/src/pipeline.ts` 한 곳**에서 세운다. 판정 임계값이 필요하면 `packages/core/src/constants.ts` 에 둔다(Conventions 6). ⚠️ **판정을 어디서 산출하는지**(C2 호출 결과에 포함할지, 별도 판정으로 둘지)는 **구현 판단이며 이 ADR이 정하지 않는다** — 정하는 것은 *결과의 형식*과 *불변식이 서는 위치*뿐이다. 추가 LLM 호출을 만들지 않는다는 제약(Data Flow ⑥ *"추가 호출 금지"*)은 그대로 적용된다.
  3. **T25**([FE] UX-004): `offered` 만 읽는다. `false` 면 링크를 **레이아웃에서 제거**한다(비활성 렌더 금지 — AC-058②/UX-004).
  4. **T11**: AC-058의 케이스는 **이미 `docs/TestCases.md` 표 B의 T-E 그룹에 존재한다**(measured 2026-08-04) — **새로 만들지 않는다**(T11: *"케이스를 이 태스크 안에서 새로 만들지 않는다"*, planner 소유). 기대값 매핑만 이 계약으로 고정한다: <br>· **T-E03**("확인 부탁드립니다", 검증 항목 *"티켓 변환 옵션 제시 안 함"*) → `ticketOption = { offered: false, basis: 'signal_absent' }` = AC-058① 대조군 <br>· **T-E01/T-E02/T-E04**(감정형) → `{ offered: true, basis: 'signal_present' }` = AC-058② <br>실행 출력에 `basis` 를 남긴다 — `signal_absent` 가 아니라 `undetermined` 로 통과한 대조군은 **AC-058 통과가 아니라 파이프라인 고장**이다. 이 구분이 `basis` 를 둔 이유 그 자체다.
  5. **리뷰 규칙**: `packages/core`/`apps/web` 에 `emotion` 이 들어간 응답 필드·저장 컬럼·로그 키를 추가하는 diff는 **반려**한다(AC-070② grep 판정을 흐린다). `basis` 를 화면에 렌더하는 diff도 반려한다.
