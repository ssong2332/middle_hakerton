# ADR-0007: 존댓말 레벨의 결정 경계 — 규약 4축을 유지하고, 빈 프로필에 기본 레벨을 지정하지 않는다

- Status: **accepted**
- Date: 2026-08-05
- Owner: architect
- DECISIONS.md entries: **#39**(규약 절 제외 · 4축 유지) · **#40**(빈 프로필 기본값 미지정)
- Freeze Point: **F1**(`packages/core/src/contract.ts` — **변경 0건**) · 영향 태스크: **T10**(C2 톤 변환) · **T11**(회귀 검증셋) · **T41/T42**(규약 UI, 재논의 시점)
- 문서 단일 출처: `docs/Architecture.md` **Data Flow 1-a**

## Context

T10(C2 톤 변환) 리뷰에서 명세 모순 2건이 보고됐다. 둘 다 **EN→KO 변환의 종결어미 레벨(합쇼체/해요체)** 을 무엇으로 결정하는가에 대한 것이다.

### 모순 1 — AC-046 ②가 전제하는 자리가 규약에 없다

| 출처 | 문구 (원문) |
|---|---|
| `docs/PRD.md:564` **AC-046 ②** | *"적용 레벨은 C3 프로필의 «존댓말 레벨» 항목을 따르며, 해당 상대에 대한 #24 쌍방 규약이 있으면 **규약 값이 우선**한다(Planning Decision #26)"* |
| `docs/PRD.md:555` **AC-037** | *"두 사용자가 **직설 허용 / 이모지 사용 / 호칭 / 마감 표현 4개 항목**에 대해 합의한 규약이 …"* |
| `docs/UX.md:635` **UX-011** | *"Set/edit **the 4 items** (directness allowed / emoji use / form of address / deadline phrasing)"* |
| `docs/PRD.md:591` **AC-073 ②** | *"**제안 축**은 #24 쌍방 규약의 기존 4항목(직설 허용 / 이모지 / 호칭 / 마감 표현)과 정확히 일치하며 **새 축을 만들지 않는다**(축 이름 대조로 확인)"* |

**measured 2026-08-05** — `docs/Database.md` `pair_protocols` 컬럼 목록 · `packages/core/src/contract.ts` `PairProtocol` · `docs/API.md` `PUT /api/protocol` Request 세 곳 모두에서 `honorific`·`존댓말` 매치 **0건**. 즉 AC-046 ②가 요구하는 "규약 우선"을 **표현할 필드가 존재하지 않는다.**

**모순의 소재는 PRD 내부다.** AC-046 ②는 규약이 존댓말 레벨을 담는다고 전제하는데 AC-037이 규약을 4항목으로 열거한다. `docs/UX.md` 도 같은 모순을 물려받았다 — UX-011은 4항목만 정의하면서 UX-004(:430)는 존댓말의 규약 우선 규칙을 서술한다.

⚠️ **부수 발견(architect 자신의 문서 오류)**: `docs/Database.md:147` 과 `docs/API.md:212` 는 4축 고정의 근거로 *"AC-073②: 5번째 필드가 **물리적으로** 존재할 수 없어야 한다"* 를 **인용부호와 함께** 적고 있었다. **PRD에 그런 문장은 없다**(measured — PRD 전문 "물리적" 검색 히트는 :331·:393 의 Border 01 서술뿐). AC-073 ②는 **스타일 추론이 제안하는 축**을 규약 4항목으로 묶는 조항이지 스키마 금지 조항이 아니다. 결론(4축 유지)은 옳았고 **근거가 틀렸다.**

### 모순 2 — 빈 프로필의 기본 레벨

| 출처 | 문구 |
|---|---|
| `docs/PRD.md:577` **AC-059 ②③** | *"건너뛴 계정의 프로필은 빈 상태로 저장되며 **기본값·추측값이 채워지지 않는다** … 이 상태의 변환은 기본 변환만 수행"* |
| `docs/UX.md:430` **UX-004 Business Rules** | *"C3 profile lookup (**skipped entirely if the sender's profile is empty/skipped, AC-059③ — never substituted with guessed defaults**)"* |
| `docs/PRD.md:564` **AC-046 ①** | *"한 메시지 안의 **종결어미 레벨 혼용이 0건**"* — 개인화 여부에 대한 조건이 없다 |

T10 구현은 `DEFAULT_HONORIFIC_LEVEL = 'haeyo'` 를 만들어 프로필이 `null` 일 때 프롬프트에 **해요체를 명시 지정**했다. AC-046 ①을 지키기 위한 판단이었고 `personalizationApplied:false` 는 유지되지만, 위 두 문장과는 어긋난다.

이 ADR이 답해야 할 것: **AC-046 ①과 AC-059 ②③을 동시에 만족하는 형태는 무엇이고, 규약 절은 지금 무엇을 해야 하는가.**

## Decision

### D1 — 규약은 4축을 유지하고, AC-046 ②의 규약 절은 MVP 구현 대상에서 제외한다

| Option | Pros | Cons |
|---|---|---|
| **제외 + 문서화 + T41/T42 재논의** ✅ | F1 계약·DB·API·프롬프트 **변경 0건**. AC-037/UX-011/AC-073 ②와 계속 정합. 판정 케이스가 없는 절을 구현했다고 주장하지 않는다 | AC-046 ②의 절반이 미구현으로 남는다 — **보고서·태스크 완료 기록에 명시**해야 한다 |
| 5번째 축 추가(`honorific_level`) | AC-046 ②를 문자 그대로 만족 | 🔴 **AC-037의 정의를 바꾸는 일 = 요구사항 신설**(AGENTS.md 금지, planner 소관). DB·API·UX-011 화면·F1 계약 4곳이 동시에 바뀌는데, 그 소비처인 T41/T42는 **P2·컷 후보**다. AC-073 ②의 "축 이름 대조" 판정도 흔들린다 |
| `address_form` 재해석 | 스키마 변경 0 | 🔴 **범주 오류다.** `address_form` = 2인칭 호칭 표기(`김 대리님`/`Sujin Kim` — AC-047, UX-010의 person 엔트리), 존댓말 = 종결어미 레지스터. 한 컬럼에 두 의미를 실으면 **AC-083 ①의 대조 축(호칭 ↔ 실제 호명 방식)** 이 무엇을 비교하는지 판정 불가가 되고, 자유 문자열이라 파싱이 호출부마다 갈린다 |
| 규약 밖 별도 저장소(pair별 존댓말 테이블) | 4축을 건드리지 않는다 | 🔴 "규약과 별개인 pair 단위 설정"은 **PRD에 없는 개념**이다. 새 테이블·새 라우트·새 화면이 따라오고, 그것 역시 planner가 정의해야 할 요구사항이다 |

**부수 결정**: `docs/Database.md:147` · `docs/API.md:212` 의 AC-073 ② 인용을 삭제하고, 4축 유지의 근거를 **ⓐ AC-037의 열거 ⓑ UX-011의 4항목 화면 ⓒ AC-073 ②의 축 이름 대조가 4축 전제 위에서만 성립함** 으로 교체한다. 아울러 *"축을 5개로 늘리는 요청은 400"* 이 실제로 성립하려면 요청 스키마가 **미지 키를 무시하지 않고 거부**해야 하므로(zod 기본 동작은 strip) `PUT /api/protocol` 의 스키마를 `.strict()` 로 명시했다.

### D2 — 프로필이 비면 레벨을 지정하지 않고 일관성만 요구한다

`docs/Architecture.md` **Data Flow 1-a 판정표**가 단일 출처다. 요지:

| 입력 상태 | 프롬프트 |
|---|---|
| `honorificLevel` 이 `hapsyo`/`haeyo` | 그 값을 명시 지정 |
| `honorificLevel === null` | 🔴 **레벨 미지정 + "한 메시지 안에서 하나의 종결어미 레벨을 끝까지 유지하라"** |
| 규약 존재 여부 | **무관** — 규약은 존댓말 레벨에 관여하지 않는다(D1) |

| Option | Pros | Cons |
|---|---|---|
| **레벨 미지정 + 일관성 지시** ✅ | AC-046 ①(혼용 0건)을 그대로 만족하면서 **"추측 기본값 지정"이라는 형태 자체가 사라진다.** UX-004:430·Data Flow ③의 문언과 충돌 0. **빈 프로필과 채워진 프로필의 payload/cacheKey가 서로 다르게 유지**된다 | 빈 프로필 사용자의 레지스터가 호출마다 달라질 수 있다(아래 Consequences) |
| `DEFAULT_HONORIFIC_LEVEL='haeyo'` 지정(현 구현) | 출력이 결정적 | 🔴 ① UX-004:430·Data Flow ③의 *"never substituted with guessed defaults"* 와 문언 충돌 ② 🔴 **cacheKey가 두 상태를 구분하지 못한다** — cacheKey는 `canonicalJSON(payload)` 를 포함하므로 *"프로필 없음"* 과 *"프로필=해요체"* 의 payload가 **완전히 같아진다.** F1-a가 `signal_absent`/`undetermined` 를 분리하고 AC-063 ②가 "화면은 같아도 내부 상태는 구분"을 요구한 것과 **동일한 실패 유형** ③ 해요체 선택 근거가 **미측정(추정)** 이고 `docs/TestCases.md` AC-046 10건에 **빈 프로필 케이스 0건**(measured, :125) — 어떤 AC도 요구하지 않는 값이다(Conventions 9) |
| 빈 프로필이면 en-ko 변환을 거부/경고 | 명시적 | 🔴 AC-059 ①③이 **빈 프로필로도 변환이 정상 완료**될 것을 요구한다. 정면 위반 |

**AC-046 ①이 깨지지 않는 근거**: ①의 판정 단위는 *"한 메시지 안"* 이다. 프롬프트가 레벨을 고르지 않아도 "하나를 골라 끝까지 유지하라"로 충족되며, 메시지 **간** 레벨 차이는 AC-046이 금지하지 않는다. `docs/TestCases.md` AC-046 10건은 전부 프로필 값이 주어진 조건에서 실행되므로(:125) 이 결정의 영향을 받지 않는다.

## Consequences

- **Positive**
  - F1(`contract.ts`)·`docs/Database.md` 스키마·`MediationInput` **변경 0건.** T10의 남은 작업은 `steps/c2.ts`·`prompts/c2.ts` 두 파일에 국한된다.
  - 빈 프로필과 채워진 프로필이 **payload·cacheKey·테스트 출력에서 계속 구별**된다 — AC-059 ③의 "개인화 미적용"이 관측 가능한 사실로 남는다.
  - `docs/UX.md` **수정 불필요.** 이 결정은 UX 문언과 충돌하지 않고 그것을 그대로 실현한다(ux-design 라우팅 없음).
  - 4축 고정의 근거가 실제 AC 문구와 일치하게 되어, 다음 사람이 존재하지 않는 문장을 근거로 판단하지 않는다.
- **Negative / 수용한 대가**
  - **AC-046 ②의 규약 절이 미구현으로 남는다.** T10 완료 보고와 T11 실행 기록에 이 사실을 명시한다 — 조용히 통과시키면 AC-034 계열의 과장이 된다.
  - **빈 프로필 사용자의 출력 레지스터가 호출마다 달라질 수 있다.** 일관된 레지스터가 필요하면 그 수단은 **온보딩 완료**(AC-059 ④ · UX-009 "온보딩 완료하기")이지 시스템의 대리 선택이 아니다.
  - ⚠️ **architect는 LLM을 실행하지 않았다** — "레벨을 지정하지 않아도 모델이 한 레지스터를 유지한다"는 **추정**이다. 확인 수단: T10/T11이 `docs/TestCases.md` AC-046 10건에 **빈 프로필 조건 1회를 추가 실행**해 혼용 0건을 출력으로 보인다(케이스 추가가 아니라 기존 케이스의 실행 조건 추가이므로 planner 소유를 침범하지 않는다). 혼용이 관측되면 이 ADR의 D2를 **addendum으로 재검토**한다 — 그때의 선택지는 "기본값 지정"이 아니라 **"일관성 지시 문구 강화"** 가 먼저다.
- **Follow-ups required**
  1. **T10 / implementer(코드)** — `packages/core/src/prompts/c2.ts`: `DEFAULT_HONORIFIC_LEVEL` 삭제, `C2Payload.honorificLevel` 을 `HonorificLevel | null` 로, `buildC2Payload` 의 3번째 인자를 nullable로, `enKoRules(null)` 은 레벨 라벨 없이 *"pick ONE sentence-final honorific register and use it for every sentence"* 형태의 일관성 지시만 출력. **프롬프트 문구가 바뀌므로 `C2_PROMPT_VERSION` 을 올린다**(Conventions 10). `packages/core/src/steps/c2.ts`: `?? DEFAULT_HONORIFIC_LEVEL` 제거하고 `input.honorificLevel` 을 그대로 전달, 그리고 *"규약에 존댓말 축이 추가되면 override 파라미터를 추가한다"* 주석을 **이 ADR·Data Flow 1-a 참조로 교체**(금지된 경로를 후속 지시로 남기지 않는다).
  2. **T11** — AC-046 회귀 실행에 **빈 프로필(`honorificLevel: null`) 조건 1회**를 포함하고 혼용 0건을 실행 출력으로 남긴다.
  3. **planner(라우팅 필요)** — **AC-046 ② ↔ AC-037 의 모순 해소.** 선택지는 ⓐ AC-046 ②에서 규약 절을 제거 ⓑ AC-037에 5번째 항목을 추가(그 경우 UX-011·`pair_protocols`·`PUT /api/protocol`·AC-073 ② 축 목록이 함께 바뀐다). **T41·T42 착수 전에 결정되어야 하며, architect는 이를 단독으로 정하지 않는다.**
  4. **리뷰 규칙** — 기본 존댓말 레벨 상수를 되살리는 diff, `pair_protocols`/`PairProtocol`/`PUT /api/protocol` 에 5번째 축을 추가하는 diff, `address_form` 에 종결어미 레벨을 싣는 diff는 **반려**한다(`docs/Architecture.md` Conventions 14).
