# ADR-0003: 층 1 / 층 2 어댑터 레지스트리 계약 — 컷 안전성을 구조로 만든다

- Status: **accepted** (스택 게이트와 무관하게 성립한다 — 어떤 프레임워크를 고르든 이 경계는 같다)
- Date: 2026-08-04
- Owner: architect
- DECISIONS.md entry: #18

## Context

- **Planning Decision #61**(재논의 대상 아님): Chrome 확장은 **2계층**이다. **층 1** = 범용 선택 오버레이(사이트 무관, `all_urls` 수준, MVP #32, T55~T58) / **층 2** = 사이트별 역삽입(GitHub·Slack·Gmail).
- **Planning Decision #62**: 컷 순서에서 **층 1은 컷 대상이 아니고**, 층 2는 GitHub까지 전부 컷 가능해졌다.
- **Planning Decision #68이 #62의 서열을 갱신했다**(#62 원문 미수정): 갱신 후 순서는 **① P2 전체 → ② 층 2 Slack(T47)·Gmail(T49) 동순위 → ③ 층 2 GitHub(T29) → ④ 로그인 고도화 → ⑤ 여분**. Slack·Gmail의 순서는 **착수 첫 1시간 스파이크의 Y/N 3개 + 실측 분(分)** 으로만 판정하며 사람이 다시 고르지 않는다.
- **AC-053**: ① 결과 영역에 **항상 "클립보드 복사"** ② 층 2가 등록된 사이트에서만 "입력창에 삽입"이 추가로 표시되고 **없으면 표시되지 않는다**(비활성·빈 버튼 금지) ③ 🔴 **층 2 모듈을 전부 제거한 상태에서도 층 1 전체 경로가 동작함을 실제로 1회 실행해 확인** ④ 전송 버튼 자동 클릭 금지.
- **AC-052③**: **대상 사이트를 식별하는 코드 없이** 동작함을 층 2 없는 사이트 3곳에서 확인.
- **T57**이 이미 이 계약의 소유자로 지정돼 있다: *"층 2 모듈이 구현해야 할 인터페이스(선택자 + 삽입 함수)를 여기서 계약으로 고정하고, T29·T47·T49는 그 계약만 구현한다."*
- 프론트는 **1명**이고 T55~T58 + T29·T47·T49 = **7건**이 전부 그 1명에게 간다(Risks: "층 1 신설로 프론트 작업량이 순증").

이 ADR이 답해야 할 것: **컷 순서대로 잘라냈을 때 남는 코드가 빌드·배포되는가**, 그리고 **그것을 실행으로 증명할 수 있는가**.

## Decision

**층 2를 배열 등록형 레지스트리로 만든다. 층 1은 층 2를 import 하지 않고, 층 2 어댑터끼리도 서로 참조하지 않는다.**

```ts
// apps/extension/src/layer1/registry.ts  — 🔒 Freeze Point F4 (T57)
export interface Layer2Adapter {
  id: 'github' | 'slack' | 'gmail';
  matches(url: URL): boolean;
  findInput(): HTMLElement | null;
  insert(el: HTMLElement, text: string): boolean;   // 🔴 삽입만. 전송 버튼 클릭 코드 없음 (AC-040)
}
export let adapters: Layer2Adapter[] = [];
export const registerAdapters = (list: Layer2Adapter[]) => { adapters = list; };

// apps/extension/src/layer2/index.ts   ← 컷 지점. 이 배열에서 한 줄을 지우고 파일을 삭제한다.
export const layer2Adapters = [githubAdapter, slackAdapter, gmailAdapter];

// apps/extension/src/content.ts        ← 유일한 주입 지점
registerAdapters(layer2Adapters);
```

층 1은 `adapters.find(a => a.matches(url))` 의 결과가 있을 때만 "입력창에 삽입"을 렌더한다. 없으면 **렌더하지 않는다**(AC-053②).

| Option | Pros | Cons |
|---|---|---|
| **배열 등록형 레지스트리** ✅ | 컷 = **파일 삭제 + 배열 한 줄 제거**. 남는 코드가 삭제 대상을 참조하는 지점이 배열 한 곳뿐이라 빌드가 반드시 성립한다. AC-053③을 `layer2Adapters = []` 로 만들어 **1회 실행으로 증명** 가능. 어댑터 3개가 서로 독립이라 #68의 스파이크 결과로 순서를 바꿔도 나머지가 영향받지 않는다 | 사이트가 늘면 배열이 길어진다(현재 3개, Teams는 #68이 미추가로 확정) |
| 층 1이 사이트를 직접 분기 (`if (host === 'github.com') …`) | 파일이 적다 | 🔴 **AC-052③("대상 사이트를 식별하는 코드 없이 동작")을 정면으로 위반**한다. 층 1의 정의 자체가 깨지고 Planning Decision #61의 근거 ①(커버리지)이 사라진다 |
| 추상 클래스 상속 (`abstract class BaseAdapter`) | 공통 로직 재사용 | 어댑터가 기반 클래스에 의존하고 기반 클래스가 어댑터 목록을 알게 되기 쉽다. 공통 로직이 실제로 거의 없다(각 사이트의 DOM 셀렉터가 전부 다르다) |
| 동적 import / 플러그인 로더 | 번들 크기 최적화 | 확장 번들에서 코드 스플리팅이 얻는 것이 없고(로컬 로드), MV3 서비스 워커에서 동적 import 제약을 확인해야 한다(추정). 컷이 "파일 삭제"인데 로더는 파일이 없을 때의 런타임 처리를 또 만든다 |
| 런타임 feature flag (`ENABLE_SLACK=false`) | 코드를 지우지 않고 끌 수 있다 | 🔴 **컷된 코드가 리포에 남아 컴파일·린트·테스트 대상이 된다.** 17일 프로젝트에서 컷의 목적은 "안 보이게 하기"가 아니라 **작업량과 실패 표면을 실제로 줄이기**다. 플래그는 그 목적을 달성하지 못한다 |

### 층 2 어댑터끼리의 참조를 금지하는 이유

Planning Decision #68이 Slack·Gmail을 **동순위**로 두고 스파이크 측정치로 하나만 남길 수 있게 했다. `slack.ts` 가 `gmail.ts` 의 헬퍼를 쓰면 **Gmail을 지울 때 Slack이 깨진다** — 즉 #68이 만들어 둔 선택지가 코드 때문에 사라진다. 공통 유틸이 필요하면 `layer1/dom-utils.ts`(위쪽)에 두고 두 어댑터가 각각 가져다 쓴다.

## Consequences

- **Positive**
  - **Planning Decision #62/#68의 컷 순서 전 단계가 파일 삭제로 실행 가능하다.** ②에서 `slack.ts`·`gmail.ts` + 배열 2줄, ③에서 `github.ts` + 1줄. ③ 이후 `layer2Adapters` 는 **빈 배열**로 남고 빌드된다.
  - **서버 계약이 전혀 바뀌지 않는다** — 층 2는 DOM 삽입 함수일 뿐이고 중재 호출은 층 1이 소유한다(`POST /api/mediate`). `docs/API.md` 의 "컷 시 삭제되는 라우트" 표에서 층 2 컷의 행이 "라우트 변화 없음"인 이유가 이것이다.
  - AC-053③의 증명이 **테스트 1개**가 된다: `registerAdapters([])` 후 선택 → 패널 → 중재 → 승인 → 클립보드 전 경로.
  - **Freeze Point F4**가 머지되면 T29·T47·T49가 서로 독립적인 3개 파일이 되어, 프론트 1명이 스파이크 결과에 따라 **순서를 자유롭게 바꿀 수 있다**.
- **Negative / 수용한 대가**
  - 어댑터마다 `matches`/`findInput`/`insert` 3개 함수를 반복해 쓴다(공통 추상화 없음). 3개 규모에서는 중복이 추상화보다 싸다.
  - `registerAdapters` 라는 가변 전역이 하나 생긴다. 주입 지점을 `content.ts` 1곳으로 못 박아 완화한다.
  - 층 1 자체가 실패할 위험(SPA·iframe·Shadow DOM·CSP)은 **이 구조가 해결하지 못한다** — 그것은 T55 스파이크의 대상이며 PRD Risks/Assumptions에 미검증으로 등재돼 있다.
- **Follow-ups required**
  1. **T57**: 위 인터페이스를 M3 앞단에 머지한다. **T29·T47·T49는 이것 없이 착수하지 않는다**(`docs/Tasks.md` 마일스톤 매핑이 이미 이 순서를 고정).
  2. **T57 완료 조건**: `layer2Adapters = []` 상태에서 층 1 전 경로를 **1회 실행**하고 화면 기록을 AC-053③ 근거로 첨부한다.
  3. **T55 착수 첫 1시간**: 층 2 없는 사이트 2곳에서 선택 이벤트 수신·버튼 렌더만 먼저 확인하고, 실패 시 **즉시 중단·보고**한다. 이 결과는 어댑터 전략 전체의 전제이므로 성공/실패 어느 쪽이든 보고 대상이다.
  4. **T47·T49**: 같은 날 연속 스파이크 후 **Y/N 3개 + 실측 분(分)** 을 각 태스크 행에 기록한다. 기록 없이 순서를 정하지 않는다(Planning Decision #68).
  5. **리뷰 규칙**: `layer1/` 이 `layer2/` 를 import 하는 diff, 어댑터가 다른 어댑터를 import 하는 diff, `insert()` 안에서 `.click()` 을 호출하는 diff는 **반려**한다(마지막 항목은 AC-040 위반 = Critical).
