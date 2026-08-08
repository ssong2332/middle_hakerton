# ADR-0010: 삽입 대상 원본(`InsertionOrigin`)을 층 2 어댑터 계약으로 넘긴다 (F4-a)

- Status: accepted
- Date: 2026-08-08
- Owner: architect
- DECISIONS.md entry: #51
- Supersedes: 없음 (ADR-0003 "층1/층2 어댑터 레지스트리"의 경계 규칙은 **그대로 유지**된다 — 이 ADR은 그 경계 위를 지나가는 **데이터 1개**를 추가할 뿐이다)

## Context

`docs/UX.md:187`(UF-011 step 6)과 `docs/UX.md:760`(UX-016 Exit)은 승인된 텍스트를 **"선택이 시작된 필드"**(the originating field)에 삽입할 것을 요구한다. 그런데 F4가 동결한 `findInput()` 은 **인자를 받지 않으므로**, 어댑터가 실행 시점에 원본 필드를 스스로 추론해야 했다. T29(GitHub) 구현은 두 가지로 추론했고 reviewer 트레이스 결과 **두 분기 모두 실제 실행 경로에서 죽어 있다**:

1. **shadow DOM retargeting** — 패널은 open shadow root 안에 마운트되고(`apps/extension/src/layer1/panel-mount.tsx:48`) 마운트 직후 자기 자신에게 포커스를 준다(`apps/extension/src/layer1/MediationPanel.tsx:87~89`). `findInput()` 은 사용자가 Insert 를 누를 때, 즉 그 **한참 뒤** 실행된다. retargeting 규격상 그 시점 `document.activeElement` 는 shadow **host `<div>`** 이며 어떤 textarea 도 아니다. 같은 현상이 이미 `apps/extension/src/layer1/selection.ts:86~98` 에 기록돼 있다.
2. **폼 컨트롤 선택은 `getSelection()` 에 없다** — `<textarea>`/`<input>` 안의 선택에 대해 `window.getSelection()` 은 빈 문자열을 반환한다. 이 저장소는 이 사실을 이미 알고 있고, 그래서 `selectionStart`/`selectionEnd` 로 따로 읽는 `getFormControlSelectionPayload()` 가 존재한다(`apps/extension/src/layer1/selection.ts:178~204`). 즉 "GitHub 댓글창에 내가 쓴 초안을 선택한다"는 **가장 흔한 경로**에서 anchorNode 분기도 항상 빈손이다.

결과는 크래시가 아니라 **조용한 오대상 삽입**(문서 전역 후보 선택자의 첫 매치)이다. 컴포저가 동시에 여러 개 떠 있는 것이 일상인 **Slack**(채널 + 스레드)·**Gmail**(다중 작성창)에서는 GitHub 보다 훨씬 자주 틀린다. T47·T49 가 이 계약 위에 올라가기 **전에** 결정해야 하는 이유가 이것이다.

원본 요소 자체는 **선택 시점에는 알 수 있다** — 잃어버리는 것은 그 뒤(패널 오픈 → 포커스 이동 → 중재 완료)이며, 그것을 이어주는 배선이 없을 뿐이다.

## Decision

**`findInput()` 의 시그니처를 `findInput(origin: InsertionOrigin): HTMLElement | null` 로 바꾼다.** 원본 요소는 층 1이 **선택 시점에** `SelectionPayload.origin` 으로 캡처해 `content.ts → openMediationPanel() → MediationPanel → handleInsert()` 경로로 어댑터에 넘긴다. 어댑터는 그 힌트를 **검증(`isConnected`)·해석(`closest`)** 하고, 힌트가 없을 때만 문서 전역 후보 선택자로 폴백한다.

| Option | Pros | Cons |
|---|---|---|
| **`findInput(origin: InsertionOrigin)`** ✅ | 원본 캡처가 **공유 층 1 코드 1곳**에 남는다(어댑터 3개가 재발명하지 않는다). 층 2 → 층 1 은 **타입 import 만** 유지. 객체 래퍼라 다음 확장(캐럿 위치 등)은 시그니처를 다시 깨지 않는다 | F4 동결 후 **첫 breaking change**. T29 어댑터 1개를 손봐야 한다(파라미터 추가 + 죽은 분기 2개 제거) |
| `findInput()` 유지 + 어댑터가 선택 시점 훅을 자체 등록 | 시그니처 불변 | 🔴 document 리스너와 원본 캡처를 어댑터마다 **3중 구현**. 선택 감지는 층 1 소유라는 정의(AC-052①②③)와 정면 충돌 |
| `findInput()` 유지 + 삽입 대상 결정을 층 1이 수행 | 시그니처 불변 | 🔴 층 1이 "이 요소가 이 사이트의 입력창인가"를 판정 = 사이트 지식이 층 1로 유입(AC-052③ · CodingRules Directory Rules 위반) |
| 인자를 **선택적**(`origin?:`)으로 | T29 무수정 통과 | 무시해도 컴파일되므로 **지금과 같은 조용한 오대상 삽입**으로 되돌아갈 여지가 남는다 |
| `HTMLElement \| null` 을 그대로 전달 | 타입 1개 절약 | 동결 지점을 **두 번** 깨게 된다 — 캐럿 위치·rect 가 필요해지는 순간 또 시그니처 변경 |

## Consequences

- **Positive**: UX.md 두 곳이 요구하는 "originating field" 가 **처음으로 실제 구현 가능**해진다. T47·T49 는 origin 해석 규칙을 상속받아 각자 선택자만 쓰면 된다. `layer2/**` 의 `activeElement`/`getSelection` 사용 0건이라는 **grep 판정 수단**이 생겨, 같은 죽은 분기의 재발을 reviewer가 기계적으로 잡는다.
- **Negative / accepted trade-offs**: ⓐ 동결 계약의 breaking change 1건(F4-a) — 영향 파일은 `registry.ts` + 어댑터 3개 + 층 1 배선 3개로 한정된다. ⓑ TypeScript 구조적 타이핑상 **무인자 함수도 이 인터페이스에 대입되므로 컴파일러가 미채택을 잡아주지 않는다** — reviewer 육안 판정에 의존한다(Architecture F4-a 층 2 규칙 5). ⓒ origin 은 DOM 노드 강참조이므로 패널 인스턴스 밖(모듈 전역)에 보관하면 detached 노드를 붙든다 — 규칙으로 금지했다. ⓓ closed shadow root·iframe 안에서 시작된 선택은 origin 이 `null` 이고 폴백으로 내려간다(수용).
- **Follow-ups required**:
  1. **implementer(T29 후속)** — `selection.ts` 의 `SelectionPayload.origin` 캡처, `panel-mount.tsx`/`MediationPanel.tsx` 배선, `layer2/github.ts` 의 `findOriginatingInput()` 죽은 분기 2개 제거 + 새 파라미터 채택. **테스트**: 컴포저 2개가 있는 DOM에서 두 번째 컴포저를 origin 으로 주고 그것이 선택되는 red→green 1건, origin 이 `isConnected:false` 일 때 폴백으로 내려가는 1건.
  2. **implementer(T47·T49)** — 처음부터 새 형태로 구현. `activeElement`/`getSelection` grep 0건을 완료 근거로 첨부.
  3. **T49 스파이크** — Gmail 작성 본문이 iframe 인지 확인(현재 `manifest.json` 에 `all_frames` 없음). iframe 이면 origin 은 항상 `null` 이며 이 ADR 범위 밖의 별도 결정이 필요하다.
  4. **다음 architect 패스** — 본 문서의 버전 격차(Architecture 기준 PRD v3.2/UX 6.0 vs 실제 v4.0/6.1) 전면 재검증.
