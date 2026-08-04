# API — 크로스보더 협업 중재 서비스

Owner: architect (see AGENTS.md). Others read-only.
Created only when the project exposes an API (architect: "if required").
Based on PRD Version: v3.2 · Based on UX Version: 6.0

> 🔴 **이 문서는 Freeze Point F2다**(`docs/Architecture.md` "동결 지점"). 여기 고정된 경로·상태코드·에러코드가 있어야 [FE]가 백엔드 완성을 기다리지 않고 목 서버로 진행할 수 있다. 변경은 `docs/DECISIONS.md` 에 행을 추가한 뒤에만 한다.
>
> ✅ **프레임워크·호스팅은 2026-08-04 사용자 결정으로 승인되었다**(`docs/Architecture.md` 상단 게이트 표 · `docs/DECISIONS.md` #31). Route Handler 기반 경로 설계가 확정 스택 위에서 그대로 유효하다. 프레임워크 버전은 **Next.js 16**으로 갱신됐다(DECISIONS #37) — **경로·계약에는 영향이 없다.**
>
> ✅ **2026-08-04 F1-c 반영 — 이 문서의 와이어 형식은 변경 0건이다.** `packages/core/src/contract.ts` 의 `TicketOption`·`TicketResult`·`DecisionItem` 이 판별 유니온이 되었지만(DECISIONS #38 · ADR-0006) **필드 이름·순서·값 어휘·JSON 예시가 전부 그대로**다. 추가된 것은 세 라우트 Response 행의 **"어떤 조합이 존재하지 않는가"** 한 줄씩이다 — 목 서버·목 데이터는 그 조합을 쓰고 있지 않은 한 손댈 것이 없다.

## Conventions

| 항목 | 값 |
|---|---|
| Base URL | `/api` — **버전 접두사를 두지 않는다.** 클라이언트가 웹앱·확장 둘뿐이고 둘 다 우리가 같은 리포에서 배포한다. 버전을 두면 17일 안에 쓰지 않을 폴더가 하나 늘 뿐이다 |
| 형식 | 요청·응답 모두 `application/json; charset=utf-8` |
| 인증 | **쿠키 세션(웹앱) 또는 `Authorization: Bearer <Supabase access token>`(확장).** `apps/web/lib/auth.ts` 한 곳에서 분기하며 라우트마다 다른 방식을 만들지 않는다. `/api/health` 를 제외한 **모든 라우트가 인증 필수** |
| 인가 | 앱 코드에서 소유자 필터를 쓰지 않는다 — **Postgres RLS가 강제**한다(`docs/Database.md` RLS 절). 타인 리소스 접근은 404가 아니라 **0행/`NOT_FOUND`** 로 나타난다 |
| 입력 검증 | 전 라우트가 `withApi()` 안에서 **zod 스키마로** body/query를 파싱한다. 실패 시 `400 VALIDATION_FAILED` |
| Error format | **전 라우트 공통 봉투 1개.** 라우트별 다른 모양을 만들지 않는다 |
| 에러 분기 | 클라이언트는 `message`(문장, 변경될 수 있음)가 아니라 **`code`** 로 분기한다. `retryable` 이 재시도 버튼 노출 여부를 결정한다 |
| 멱등성 | `POST /api/messages` 만 `Idempotency-Key` 헤더를 선택적으로 수용(더블클릭 방지). 나머지는 불필요 |
| Rate limit | LLM을 호출하는 라우트에만 적용(AC-041). 초과 시 **에러가 아니라 폴백 응답 200**이 나간다 — 아래 참조 |

```jsonc
// 에러 봉투 (전 라우트 공통)
{ "error": { "code": "LLM_TIMEOUT", "message": "처리에 실패했습니다", "retryable": true } }
```

### Error codes

| code | HTTP | retryable | 발생 조건 | UX 매핑 (docs/UX.md) |
|---|---|---|---|---|
| `VALIDATION_FAILED` | 400 | false | zod 파싱 실패 | 해당 필드 인라인 오류 (UX-001/002/004 Validation) |
| `AUTH_REQUIRED` | 401 | false | 세션·Bearer 없음/만료 | UX-001 리다이렉트 (확장은 패널 NotLoggedIn) |
| `AUTH_INVALID_CREDENTIALS` | 401 | false | Supabase Auth 반환 | UX-001 폼 배너 "이메일 또는 비밀번호가 올바르지 않습니다" |
| `NOT_FOUND` | 404 | false | 대상 없음(타인 소유 포함) | 빈 상태. **빈 회색 박스를 렌더하지 않는다** |
| `CONFLICT_PROTOCOL_AUTHORED` | 409 | false | AC-074④ — 상대가 규약을 직접 작성함 | UX-018 Stage 4: 초안 폐기 + 상대 값 표시 |
| `LLM_TIMEOUT` | 200(폴백) 또는 503 | true | OpenAI 응답 없음 | 폴백 성공 시 배지 / 실패 시 UX-004 Failure 배너 + 원문 보존(AC-029) |
| `LLM_UNAVAILABLE` | 200(폴백) 또는 503 | true | 5xx·네트워크 실패 | 동일 |
| `LLM_MALFORMED` | 200(폴백) 또는 502 | true | 응답이 스키마 검증 실패 | 동일 |
| `QUOTA_EXCEEDED` | **200(폴백)** | false | 요청 상한 초과 / 크레딧 소진 | 🔴 **폴백 응답 + "폴백 응답 사용 중" 배지**(AC-041). 오류 화면이 아니다 |
| `EXTERNAL_FETCH_FAILED` | 502 | true | GitHub 공개 프로필 조회 실패 | UX-018: 해당 항목 "미등록"(AC-065⑤) |
| `INTERNAL` | 500 | true | 그 외 | 재시도 배너 |

🔴 **LLM 계열은 오류 응답보다 폴백 200이 우선이다.** `packages/core/src/data/fallback-responses.ts` 에서 응답을 찾으면 `200` + `source:"fallback"` 을 반환하고, 폴백조차 없을 때만 위 5xx 코드가 나간다. 이 우선순위가 AC-041의 "실패·소진 시 사전 준비된 데모 응답으로 폴백"이다.

### 인증 라우트는 우리가 만들지 않는다

로그인·가입·로그아웃·세션 갱신은 **Supabase Auth 엔드포인트**(`/auth/v1/*`)를 클라이언트 SDK가 직접 호출한다. 우리 `/api` 에 래퍼를 만들지 않는다 — 래퍼는 토큰 갱신·쿠키 설정을 우리가 다시 구현하게 만든다.

| 화면 | 호출 | AC |
|---|---|---|
| UX-001 Login | `supabase.auth.signInWithPassword()` | AC-039 |
| UX-002 Sign Up | `supabase.auth.signUp()` — 🔴 **최소 8자 검증은 Supabase 설정에 맡기고 앱에 복잡도 검증을 만들지 않는다**(AC-060③, Planning Decision #86) | AC-039, AC-060 |
| 전 화면 | `@supabase/ssr` 미들웨어가 쿠키 세션 갱신 | AC-039 |

**예외 1개** — 확장 토큰 인계: `GET /extension/connect`(API가 아니라 페이지). 우리 origin에서 `chrome.runtime.sendMessage` 로 access token을 확장에 넘긴다. `manifest.externally_connectable` 을 **우리 앱 origin 1개로 제한**한다(Architecture.md "확장 인증").

---

## Endpoints

### 코어 중재

#### POST /api/mediate
UX-004(UF-003) · UX-016(UF-011/012/014/015) — **웹앱과 확장이 같은 엔드포인트를 쓴다**(AC-028)

| Item | Value |
|---|---|
| Purpose | C1 분류 → C3 프로필 → C5 용어 주입 → C2 변환 → C4 역번역을 **고정 순서로** 실행(AC-032). 저장하지 않는다 — 저장은 승인 후 `POST /api/messages` |
| Auth | required |
| Request | `{ text: string, recipient?: string \| null, context: { languageDirection: 'ko-en'\|'en-ko', channel: 'web'\|'extension', urgencyOverride?: 'CRITICAL'\|'NORMAL'\|'LOW', needDeadline?: string } }` <br>🔴 **`recipient` 는 nullable·optional** — 층 1의 수신자 미지정 경로가 완결돼야 한다(AC-066①). `sender` 는 세션에서 도출하므로 body에 받지 않는다(클라이언트가 남을 사칭할 수 없게) <br>🔴 **`text` 에 길이 상한 검증을 걸지 않는다** — 5,000자는 소프트 캡이며 초과해도 변환이 차단되지 않는다(AC-061②) |
| Response 200 | `MediationResult` — `packages/core/src/contract.ts` 가 단일 출처. `{ urgency, urgencyReason, transformed, reason, preserved[], backTranslation, warnings[], misreadRisks[], holidayConflicts[], personalizationApplied, source, ticketOption }` <br>🔴 **`ticketOption: { offered: boolean, basis: 'signal_present'\|'signal_absent'\|'undetermined' }`** — AC-058 게이트 판정(2026-08-04 추가, `docs/DECISIONS.md` #35 · `docs/Architecture.md` F1-a). **`offered` 만 화면이 읽는다**: `true` 면 UX-004에 "Convert to Task Ticket" 링크를 렌더하고, `false` 면 레이아웃에서 **완전히 제거**한다(비활성·회색 링크 금지 — AC-058②). `basis` 는 내부 상태·테스트 출력 전용이며 렌더하지 않는다 — `signal_absent`(정상 대조군)와 `undetermined`(판정 불가 → fail-closed)를 QA가 구분해야 하기 때문이다(AC-063②와 같은 원칙). 🔴 **감정 점수·감정 라벨·감정 자연어 서술은 응답에 존재하지 않는다** — 근거는 `docs/Architecture.md` Security "C6 게이트 판정과 EU AI Act 방어선" <br>🔴 **두 필드는 짝이 고정돼 있다(2026-08-04, F1-c · DECISIONS #38 · ADR-0006)**: `offered:true` 는 `basis:'signal_present'` 하고만, `offered:false` 는 `signal_absent`/`undetermined` 하고만 나온다. **`{ offered: true, basis: 'undetermined' }`(fail-open)는 계약상 존재하지 않는다** — `packages/core/src/contract.ts` 에서 판별 유니온이라 컴파일되지 않는다. **JSON 형태는 이전과 동일**하며 이 줄은 조합 제약을 명시한 것이다. 이 필드를 zod로 표현할 일이 생기면 `z.discriminatedUnion('offered', …)` 를 쓴다(`z.object({ offered: z.boolean(), … })` 는 불법 조합을 되살린다) <br>🔴 `misreadRisks[]` 는 **근거가 없으면 빈 배열**(AC-043②) — 위험을 지어내지 않는다 <br>🔴 `holidayConflicts[]` 는 데이터 없는 국가에서도 **빈 배열**이며 "데이터 없음" 항목을 담지 않는다(AC-063①) <br>🔴 `personalizationApplied:false` 는 프로필이 비었거나(AC-059③) 수신자가 미지정일 때(AC-066③) — UI가 "개인화 미적용"을 표시하는 근거 <br>🔴 `source: 'live'\|'cache'\|'fallback'` — `fallback` 이면 배지 표시(AC-041) |
| Errors | 400 `VALIDATION_FAILED` · 401 `AUTH_REQUIRED` · 200+`source:'fallback'`(할당량·LLM 실패) · 503 `LLM_UNAVAILABLE`(폴백도 없을 때) |
| 부분 실패 | 공휴일 조회·이모지 판정이 실패해도 **중재 전체를 실패시키지 않는다** — 해당 배열이 비어 나가고 나머지는 정상 반환 |
| 읽는 테이블 | `profiles`, `profile_learned_items`, `pair_protocols`, `dictionary_terms`, `recipient_enrichments`, `llm_cache` <br>🔴 **조회는 전부 이 Route Handler 안에서 `core/pipeline.run()` 호출 *전에* 끝난다** — core는 조회하지 않는다(`docs/Architecture.md` F1-b · Conventions 11 · AC-028). 전달 경로: `profiles`→`input.sender.profile` / `pair_protocols`→`input.recipient.protocol` / `recipient_enrichments`→`input.recipient.{country,timezone}` / **`dictionary_terms`→`deps.data.dictionary`** / **`profile_learned_items`→`deps.data.learnedItems`** / `llm_cache` 는 `LLMClient` 구현체 내부(Data Flow 2) |

#### POST /api/ticket
UX-007(UF-004) / AC-017, AC-018, AC-050, AC-058, AC-062, AC-064①

| Item | Value |
|---|---|
| Purpose | C6 하소연 → 4섹션 티켓 변환. 승인 전이므로 **영속 쓰기 없음**(UX-007 Data Operations) |
| Auth | required |
| Request | `{ text: string, context: {...} }` |
| Response 200 | `{ sections: { problem, impact, request, concernLevel }, decisionAuthority: '확정'\|'내부 승인 필요'\|'검토 중'\|'불명', decisionAuthorityEvidence: string \| null, source }` <br>🔴 **4개 섹션이 항상 존재하며 근거가 없으면 문자열 `"없음"`**(AC-062) — 섹션 생략·빈 문자열 금지 <br>🔴 필드명은 **`decisionAuthority`**(단일값). C7의 `decisions[].authorityStatus` 와 **이름이 다르고 둘 다 존재**한다(AC-064③) <br>🔴 근거가 없으면 `'불명'`, 임의 판정 금지(AC-050①/AC-064⑤) <br>🔴 **짝이 고정돼 있다(F1-c · ADR-0006)**: `decisionAuthorityEvidence: null` 은 **`decisionAuthority: '불명'` 일 때만** 나온다. `{ '확정', null }`(근거 없는 확정)은 계약상 존재하지 않는다 — 판별 유니온이라 컴파일되지 않는다. 🔴 **LLM이 그런 조합을 뱉어도 요청을 실패시키지 않는다** — `packages/core/src/rules/decision-authority.ts` 의 `resolveAuthority()` 가 `'불명'` 으로 복원한다(부분 실패는 오류가 아니다) |
| Errors | 위 공통 |
| 게이트 | 🔴 **감정 신호가 낮은 입력에는 이 라우트를 호출하는 링크가 애초에 렌더되지 않는다**(AC-058). 게이트 판정은 `POST /api/mediate` 응답의 **`ticketOption.offered`**(위 라우트 Response 200 참조)이며 이 라우트가 자체 게이트를 만들지 않는다 — 판정기가 둘이면 같은 입력이 두 가지로 갈린다. <br>⚠️ 따라서 AC-058의 보장은 **UI 레벨**이다: 이 라우트를 직접 호출하는 경로까지 막지 않으며, 그 잔여 표면은 `docs/Architecture.md` Security의 Abuse cases 13·14 행(결과는 입력자 본인에게만 표시)이 다룬다 |

#### POST /api/summary
UX-008(UF-005) / AC-019, AC-020, AC-038, AC-050, AC-064②

| Item | Value |
|---|---|
| Purpose | C7 결정사항 요약 + 미확정 감지. **스레드를 저장하지 않는다**(UX-008 Data Operations) |
| Auth | required |
| Request | `{ threadText: string, context: {...} }` |
| Response 200 | `{ decisions: [{ decision, owner \| null, dueDate \| null, authorityStatus, authorityEvidence \| null }], unresolved: [{ decision, missingFields: ('owner'\|'dueDate')[] }], source }` <br>🔴 근거 없는 담당자·기한은 **`null`**(UI가 "미정"으로 렌더) — 임의 생성 금지(AC-020/AC-038) <br>🔴 **행별** 필드명은 `authorityStatus`(AC-064②). enum·판정 로직은 C6와 `packages/core/src/rules/decision-authority.ts` 를 공유하며 **C7이 별도 파이프라인을 만들지 않는다**(Planning Decision #8) <br>🔴 **짝이 고정돼 있다(F1-c · ADR-0006)**: `authorityEvidence: null` 은 **`authorityStatus: '불명'` 일 때만** 나온다. `{ '확정', null }` 은 계약상 존재하지 않으며, 복원 경로는 C6와 **같은 `resolveAuthority()`** 다(AC-064④ — 판정 로직 공유, 필드 이름만 분리) |
| Errors | 위 공통 |

---

### 발송 · 이력

#### POST /api/messages
UX-004 승인(UF-003) · UX-016 승인(UF-015) / AC-010, AC-012, AC-032

| Item | Value |
|---|---|
| Purpose | 🔴 **모의 전송.** `sent_messages` 1행 + `diff_records` 1행을 생성한다. **이 라우트는 사용자의 명시적 승인 동작으로만 호출되며, 다른 어떤 라우트도 이것을 내부에서 호출하지 않는다**(AC-010: 자동 발송 코드 경로 부재) |
| Auth | required |
| Request | `{ originalText, finalText, aiSuggestedText, urgency, recipient, recipientCountry?: 'KR'\|'US'\|'JP'\|'CN'\|null, recipientTimezone?, channel: 'web_mock'\|'extension_insert'\|'extension_clipboard', scheduledFor?: string\|null, mediationApplied: boolean, isReminder?: boolean, parentMessageId?: string }` |
| Response 201 | `{ messageId, diffId, sentAt, patternKey \| null, learnedApplied: boolean }` <br>`learnedApplied` = 이 diff로 어떤 패턴이 **3회에 도달해** 프로필에 반영되었는지(AC-013) — UI가 "학습됨" 표시를 하는 근거 |
| Errors | 400 · 401 |
| 서버 규칙 | 🔴 `urgency === 'CRITICAL'` 이면 `scheduledFor` 를 **무시하고 NULL 로 저장**한다(AC-005). 클라이언트를 믿지 않는다 <br>🔴 diff 저장 후 3회 판정은 **`GROUP BY pattern_key`** 만 — `recipient` 축 금지(Planning Decision #35, Database.md G4) |

#### GET /api/messages
UX-015(UF-013) / AC-044

| Item | Value |
|---|---|
| Purpose | 발송 목록 + **업무일 경과·무응답 판정** |
| Auth | required |
| Request | query `?replied=all\|true\|false&limit=50` |
| Response 200 | `{ items: [{ id, recipient, recipientCountry \| null, finalText, urgency, sentAt, replied, repliedMarkedAt, businessDaysElapsed \| null, reminderSuggested: boolean, isReminder, mediationApplied }] }` <br>`businessDaysElapsed` = 주말 + **수신자 국가 공휴일 제외**(AC-044②). 🔴 `recipientCountry` 가 `null`(데이터 없는 국가)이면 **주말만 제외하고 계산하되 어떤 라벨도 반환하지 않는다**(AC-063①) <br>`reminderSuggested` = `businessDaysElapsed >= 2`(Planning Decision #60, 상수는 `packages/core/src/constants.ts` 1곳) |
| Errors | 401 |

#### PATCH /api/messages/{id}
UX-015 "답장 받음" 마킹 · UX-006 예약 설정 / AC-044①, AC-024

| Item | Value |
|---|---|
| Purpose | `replied` 수동 마킹 또는 `scheduledFor` 설정 |
| Auth | required |
| Request | `{ replied?: true, scheduledFor?: string \| null }` |
| Response 200 | 갱신된 항목 |
| Errors | 400 · 401 · 404 `NOT_FOUND`(타인 소유 포함 — RLS 결과) |
| 서버 규칙 | 🔴 **자동 응답 감지 코드 경로가 존재하지 않는다**(AC-044⑤) — `replied` 를 바꾸는 경로는 이 라우트 하나뿐이며 사용자의 명시적 요청으로만 호출된다. CRITICAL 건에는 `scheduledFor` 를 거부한다(AC-005) |

#### POST /api/messages/{id}/reminder
UX-015(UF-013) / AC-044③④

| Item | Value |
|---|---|
| Purpose | C2 톤 변환으로 **리마인드 초안 생성**(재촉이 아닌 정중한 확인) |
| Auth | required |
| Request | `{}` |
| Response 200 | `{ draftText, source }` — 🔴 **초안만 반환한다. 이 라우트는 아무것도 발송·저장하지 않는다.** 사용자가 편집·승인하면 `POST /api/messages`(`isReminder:true`)를 별도로 호출한다(AC-044④) |
| Errors | 401 · 404 · 200+fallback |

#### GET /api/feedback
UX-013(UF-010) / AC-025(응답 시간 부분), AC-070

| Item | Value |
|---|---|
| Purpose | 중재 **전/후 응답 소요 시간** 비교 |
| Auth | required |
| Request | — |
| Response 200 | `{ withMediation: { count, medianHours \| null }, withoutMediation: { count, medianHours \| null }, items: [{ messageId, sentAt, repliedMarkedAt, elapsedHours, mediationApplied }] }` <br>🔴 **감정 분류 필드가 이 응답에 존재하지 않는다**(AC-070②③). 감정 분포를 계산·반환·표시하는 코드 경로가 없다 <br>표본이 0이면 `medianHours: null` — 0이나 임의값으로 채우지 않는다 |
| Errors | 401 |

---

### 프로필 · 사전 · 규약

#### GET / PUT / DELETE /api/profile
UX-003(UF-002), UX-009(UF-006) / AC-011, AC-014, AC-059

| Item | Value |
|---|---|
| Purpose | C3 전역 프로필 조회·저장·삭제 |
| Auth | required |
| Request (PUT) | `{ onboardingState: 'completed'\|'skipped', directness?, emojiPreference?, formality?, honorificLevel? }` <br>🔴 `onboardingState:'skipped'` 이면 스타일 필드를 **받지 않고 전부 NULL 로 저장**한다. **기본값·추측값을 채우지 않는다**(AC-059②) |
| Response 200 | `{ onboardingState, directness \| null, emojiPreference \| null, formality \| null, honorificLevel \| null, updatedAt }` <br>🔴 `not_started` 와 `skipped` 를 구분해 반환한다 — UX-004/016/009의 "개인화 미적용" 렌더 근거(AC-059③) |
| Errors | 400 · 401 |
| DELETE | 프로필 값을 비우고 `onboardingState` 를 `not_started` 로 되돌린다(계정은 삭제하지 않는다) |

#### GET /api/profile/learned · DELETE /api/profile/learned/{id}
UX-009 / AC-013, AC-014

| Item | Value |
|---|---|
| Purpose | 3회 이상 관측되어 반영된 학습 항목 조회·삭제 |
| Response 200 | `{ items: [{ id, patternKey, value, observedCount, appliedAt }] }` — `observedCount` 는 항상 ≥ 3(스키마 CHECK) |
| Errors | 401 · 404 |

#### GET / POST /api/dictionary · PUT / DELETE /api/dictionary/{id}
UX-010(UF-007) / AC-015, AC-016, AC-047

| Item | Value |
|---|---|
| Purpose | 용어(`term`)·사람 호칭(`person`) 엔트리 CRUD |
| Auth | required |
| Request (POST/PUT) | `{ entryType: 'term'\|'person', sourceText, targetText?, koHonorific?, enHonorific?, note? }` |
| Response 200/201 | 엔트리 객체 |
| Errors | 400 · 401 · 404 · 409(중복 `sourceText`) |
| 서버 규칙 | 🔴 `enHonorific` 이 없으면 **직역해 위계를 덧붙이지 않는다**("Manager Kim" 자동 생성 금지 — AC-047③). 미등록 인물은 원문 형태 유지 + `warnings[]` 에 "호칭 미등록"(AC-047②) |

#### GET / PUT /api/protocol
UX-011(UF-008) / AC-037, AC-075

| Item | Value |
|---|---|
| Purpose | 쌍방 규약 조회·저장 |
| Auth | required |
| Request | GET: `?counterpart=<email>` / PUT: `{ counterpart, directnessAllowed?, emojiPolicy?, addressForm?, deadlineStyle? }` |
| Response 200 | `{ pairKey, counterpart, directnessAllowed \| null, emojiPolicy \| null, addressForm \| null, deadlineStyle \| null, authorshipState: 'untouched'\|'inference_draft'\|'sender_confirmed'\|'counterpart_authored', updatedAt }` <br>🔴 `authorshipState` 는 UX-011의 "누가 정한 규칙인가" 배지의 유일한 입력(AC-075④) |
| Errors | 400 · 401 |
| 서버 규칙 | 🔴 **저장 시 규약 값과 `authorshipState` 를 같은 UPDATE 로 함께 쓴다**(UX-011 Data Operations). 저장 주체가 `party_a`/`party_b` 중 상대편이면 `counterpart_authored`, 발신자 본인이면 `sender_confirmed` <br>🔴 **축을 5개로 늘리는 요청은 400 으로 거부**한다(AC-073②: 5번째 필드가 물리적으로 존재할 수 없어야 한다) |

#### POST /api/protocol/confirm-inference
UX-018 Stage 4(UF-018) / AC-074 — **P2, #34와 함께 컷**

| Item | Value |
|---|---|
| Purpose | 추론 초안을 사용자가 확인·수정한 결과를 **`pair_protocols` 같은 행에** 확정 저장. 🔴 **별도/병렬 테이블을 만들지 않는다**(AC-074①, UX-011 Business Rules) |
| Auth | required |
| Request | `{ counterpart, directnessAllowed?, emojiPolicy?, addressForm?, deadlineStyle? }` |
| Response 200 | 갱신된 규약 + `authorshipState:'sender_confirmed'` |
| Errors | 400 · 401 · **409 `CONFLICT_PROTOCOL_AUTHORED`** |
| 서버 규칙 | 🔴 **조건부 UPDATE 의 영향 행이 0이면 409.** `WHERE pair_key=$1 AND authorship_state <> 'counterpart_authored'`(Database.md 참조). 사전 검사가 아니라 **원자적 경합 방어**이며, 409 시 초안을 폐기하고 상대 값을 반환한다(AC-074④) <br>🔴 **이 라우트가 호출되기 전까지 추론 결과는 어디에도 저장되지 않는다**(AC-074②) — 조회로 검증 가능해야 한다 |

#### GET /api/protocol/mismatches
UX-011 불일치 배너(UF-022) / AC-079, AC-083 — **P2, #34와 함께 컷**

| Item | Value |
|---|---|
| Purpose | 관측 지표 ↔ 규약 신고값 **축별 불일치 플래그** 반환. 🔴 **확인 요청이지 판정이 아니다** |
| Auth | required |
| Request | `?counterpart=<email>` |
| Response 200 | `{ axes: [{ axis: 'emoji'\|'directness'\|'addressForm'\|'deadline', mismatched: boolean, comparison: string, sampleCount: number, sources: ('manual'\|'github')[] }] }` <br>🔴 **축 가용성이 출처에 따라 다르다**(AC-083①): `emoji` 는 두 경로 모두 / `directness`·`addressForm`·`deadline` 은 **수동 표시 표본에서만**. GitHub 표본만 있는 상대에게 이 3축은 **배열에 아예 포함되지 않는다**(빈 항목·`null` 로도 넣지 않는다) <br>🔴 축별 최소 표본 미달 시 **조용히 건너뛴다** — 그 축이 배열에 없다(AC-083②) <br>🔴 `comparison` 은 **집계값 어휘만.** 남의 글을 인용하지 않는다(AC-081② 확장) |
| Errors | 401 |
| 서버 규칙 | 🔴 **자동으로 규약을 바꾸는 코드 경로가 존재하지 않는다**(AC-079⑤). 이 라우트는 읽기 전용이며 수정은 `PUT /api/protocol` 로만 |

---

### 시간 계산 (LLM 호출 없음 — 전부 결정적 계산)

#### POST /api/meeting-times
UX-012(UF-009) / AC-023

| Item | Value |
|---|---|
| Purpose | 양측 근무시간이 겹치는 회의 후보 **최대 3개** |
| Auth | required |
| Request | `{ sender: { timezone, workStart, workEnd }, recipient: { timezone, workStart, workEnd }, dateRange: { from, to } }` |
| Response 200 | `{ candidates: [{ startUtc, endUtc, senderLocal, recipientLocal }] }` — 겹침이 없으면 **빈 배열**(억지 후보를 만들지 않는다) |
| Errors | 400 · 401 |

#### POST /api/deadline/check
UX-005(UF-003) / AC-036, AC-057

| Item | Value |
|---|---|
| Purpose | 발신자 희망 기한이 수신자 근무시간 기준으로 실현 가능한지 판정 + 대체 기한 역제안 |
| Auth | required |
| Request | `{ neededBy: string, recipient: { timezone, workStart, workEnd, country?: 'KR'\|'US'\|'JP'\|'CN' } }` |
| Response 200 | `{ feasible: boolean, reason, counterOffers: [{ date, rationale }] }` <br>🔴 대체 기한 후보는 **수신자 국가 공휴일을 제외**한다(UX-005 Business Rules) <br>🔴 **자동으로 기한을 바꾸지 않는다** — 역제안만 반환하고 선택은 사용자가 한다(AC-036c) |
| Errors | 400 · 401 |
| 데이터 | 공휴일은 `packages/core/src/data/holidays-2026.ts`(KR/US/JP/CN) — 🔴 **외부 API 호출 0**(AC-048①/Planning Decision #52) |

---

### 수신자 보강 · 관측 (전부 P2 — #34와 한 덩어리로 컷)

#### POST /api/enrichment/fetch
UX-018 Stage 1(UF-018) / AC-065, AC-071

| Item | Value |
|---|---|
| Purpose | 🔴 **사용자가 붙여넣은 공개 프로필 URL 1건**만 조회 |
| Auth | required |
| Request | `{ recipient: string, profileUrl: string }` |
| Response 200 | `{ location \| null, company \| null, activityHourHistogram \| null, activitySampleCount, timezoneCandidates: string[], fetchedAt, sourceUrl }` <br>🔴 얻지 못한 값은 **`null` = "미등록"**, 추측값을 만들지 않는다(AC-065⑤) <br>🔴 타임존은 **후보만** 반환하고 자동 확정하지 않는다(AC-065④/AC-071③) <br>🔴 표본이 임계값 미만이면 `activityHourHistogram: null`(AC-071②) |
| Errors | 400 · 401 · 502 `EXTERNAL_FETCH_FAILED` |
| 서버 규칙 | 🔴 **검색·크롤링·링크 추적·다른 계정 자동 조회 코드 경로가 존재하지 않는다**(AC-065②, 코드 검색으로 확인). 🔴 `location`·`company`·타임스탬프 **외의 필드는 파싱 단계에서 버린다** — 커밋 메시지·이슈 본문을 읽지도 저장하지도 않는다(AC-071④/AC-065③) |
| 미검증 | ⚠️ 비인증 GitHub 조회 가능 여부·rate limit·약관은 **전부 미검증**(PRD Assumptions). T64 착수 첫 30분 스파이크가 확인 단계이며 불가 판정 시 즉시 중단·보고 |

#### PUT / DELETE /api/enrichment
UX-018 / AC-065④⑥, AC-078

| Item | Value |
|---|---|
| Purpose | 사용자가 확정한 타임존·활동 시간대 저장 / 보강 정보 삭제 |
| Request (PUT) | `{ recipient, location?, company?, activityTimezoneConfirmed?, sourceUrl?, activityHourHistogram? }` |
| Response 200 | 저장된 레코드 |
| Errors | 400 · 401 · 404 |

#### POST /api/enrichment/observe
UX-018 Stage 2 / AC-072, AC-080④, AC-082

| Item | Value |
|---|---|
| Purpose | 관측 지표 4종 집계. 🔴 **수동 표시 표본과 GitHub 표본을 하나의 지표 정의로 합산**한다(AC-080④) |
| Auth | required |
| Request | `{ recipient: string }` |
| Response 200 | `{ indicators: [{ key: 'commentLength'\|'emojiFrequency'\|'responseDelay'\|'activityHours', value, sampleCount, sampleCountBySource: { manual, github } }] }` <br>🔴 **집계값만.** 원본 글을 반환하지 않는다(AC-072②) <br>🔴 **성향 서술을 이 응답에 담지 않는다** — 사실 진술만(AC-072④). 제안은 별도 라우트 |
| Errors | 401 |
| 서버 규칙 | 🔴 지표 산출은 `packages/core/src/observation/indicators.ts` **한 파일**을 쓴다 — 확장(수동 경로)도 같은 파일을 import 한다. 경로별로 두 벌을 만들어 표시 단계에서 합치는 구현은 리뷰에서 반려한다(UX-018 Business Rules) |

#### POST /api/enrichment/suggest
UX-018 Stage 3 / AC-073 — **LLM 호출 있음**

| Item | Value |
|---|---|
| Purpose | 관측 지표를 근거로 **협업 스타일 초안 제안**. 🔴 **저장하지 않는다** |
| Auth | required |
| Request | `{ recipient: string }` |
| Response 200 | `{ suggestions: [{ axis: 'directnessAllowed'\|'emojiPolicy'\|'addressForm'\|'deadlineStyle', value, evidence: { indicatorKey, observedValue }, confidence \| evidenceCount }], source }` <br>🔴 **축은 정확히 위 4개** — 5번째 축을 만들지 않는다(AC-073②) <br>🔴 **근거 없는 제안 항목이 0건**이어야 한다 — `evidence` 가 없는 항목을 반환하면 결함이다(AC-073③) |
| Response 200 (표본 부족) | `{ suggestions: [], insufficientSample: true, requiredSampleCount, currentSampleCount }` — 🔴 **전체를 보류한다.** 일부 축만 추측으로 채우지 않는다(AC-073⑤) |
| Response 200 (상대가 규약 작성) | `{ suggestions: [], protocolAlreadyAuthored: true }` — 🔴 **생성 자체를 건너뛴다**(AC-037/AC-074④) |
| Errors | 401 · 200+fallback |
| 서버 규칙 | 🔴 **어떤 경우에도 저장소에 초안 레코드를 만들지 않는다**(AC-074②). 확정은 `POST /api/protocol/confirm-inference` 뿐 |

#### GET / POST /api/samples · DELETE /api/samples/{id}
UX-019(UF-021), UX-016 Mark 모드(UF-020) / AC-080, AC-081

| Item | Value |
|---|---|
| Purpose | 관측 표본 목록 조회 / 추가(확장 Mark 모드) / 삭제 |
| Auth | required |
| Request (POST) | `{ counterpart: string, source: 'manual', indicatorDeltas: {...}, collectedAt: string }` <br>🔴 **원문 텍스트 필드가 요청 스키마에 존재하지 않는다.** 원문은 확장 콘텐츠 스크립트에서 집계 후 폐기되며 어떤 payload에도 실리지 않는다(AC-081①③) — 네트워크 탭으로 검증 가능해야 한다 |
| Response (GET) 200 | `{ counterparts: [{ counterpart, total, bySource: { manual, github } }], samples: [{ id, counterpart, source, collectedAt, indicatorContribution }] }` <br>🔴 **인용문 필드가 없다.** 표시 가능한 것은 건수·출처·수집 시각·지표 기여도뿐(AC-081②, T72) |
| Response (POST) 201 | `{ id, counterpart, source, collectedAt }` |
| Errors | 400 · 401 · 404 |
| 서버 규칙 | 🔴 삭제 시 지표를 **남은 표본에서 재집계**한다(누적 카운터 감산이 아니다). 삭제된 표본이 지표에서 빠짐을 1건 검증한다(AC-081④) <br>🔴 **페이지 자동 스캔으로 표본이 들어오는 경로가 존재하지 않는다** — 이 라우트는 사용자의 명시적 "상대가 쓴 것으로 표시" 클릭으로만 호출된다(AC-081①) |

---

### 운영

#### GET /api/health
배포 스모크(T17·T35·T36) / AC-026 보조

| Item | Value |
|---|---|
| Purpose | 배포 직후 상태 확인. 화면 없음 |
| Auth | **none** — 이 라우트만 인증 불필요 |
| Request | — |
| Response 200 | `{ ok: true, db: 'up'\|'down', openaiKeyPresent: boolean, commit: string, ts: string }` <br>🔴 **키 값을 반환하지 않는다 — 존재 여부 boolean 만.** 모델명·잔액·환경변수 값도 반환하지 않는다 |
| Errors | 503 (`db:'down'` 일 때 `ok:false`) |

---

## Screen ↔ Endpoint 매핑 (역방향 조회용)

| Screen | Endpoints |
|---|---|
| UX-001 / UX-002 | (Supabase Auth 직접 호출 — 우리 라우트 없음) |
| UX-003 | `PUT /api/profile` |
| **UX-004** | `POST /api/mediate`, `POST /api/messages` |
| UX-005 | `POST /api/deadline/check` |
| UX-006 | `PATCH /api/messages/{id}` |
| UX-007 | `POST /api/ticket` |
| UX-008 | `POST /api/summary` |
| UX-009 | `GET/PUT/DELETE /api/profile`, `GET /api/profile/learned`, `DELETE /api/profile/learned/{id}` |
| UX-010 | `GET/POST /api/dictionary`, `PUT/DELETE /api/dictionary/{id}` |
| UX-011 | `GET/PUT /api/protocol`, `GET /api/protocol/mismatches` (P2) |
| UX-012 | `POST /api/meeting-times` |
| UX-013 | `GET /api/feedback` |
| UX-015 | `GET /api/messages`, `PATCH /api/messages/{id}`, `POST /api/messages/{id}/reminder`, `POST /api/messages` |
| **UX-016** | `POST /api/mediate`, `POST /api/messages`, `POST /api/samples` (Mark 모드, P2) |
| UX-017 | **없음 — 네트워크 호출 0**(고지 버전은 확장 로컬) |
| UX-018 | `POST /api/enrichment/{fetch,observe,suggest}`, `PUT/DELETE /api/enrichment`, `POST /api/protocol/confirm-inference` |
| UX-019 | `GET /api/samples`, `DELETE /api/samples/{id}` |

## 컷 시 삭제되는 라우트

| 컷 단계 | 삭제 라우트 | 남는 것 |
|---|---|---|
| ① P2 전체 | `/api/enrichment/*`, `/api/samples/*`, `/api/protocol/confirm-inference`, `/api/protocol/mismatches`, `/api/meeting-times`, `/api/deadline/check`, `/api/feedback`, `/api/messages/{id}/reminder` | `/api/mediate`, `/api/messages`(POST/GET/PATCH), `/api/ticket`, `/api/summary`, `/api/profile*`, `/api/dictionary*`, `/api/protocol`(GET/PUT), `/api/health` |
| ②③ 층 2 | **라우트 변화 없음** — 층 2는 확장 클라이언트 코드일 뿐 서버 계약을 건드리지 않는다 | 전부 |
| ④ 로그인 고도화 | **라우트 변화 없음** — 인증은 Supabase 쪽 | 전부 |

**층 2 컷이 서버 계약을 전혀 바꾸지 않는다는 것이 이 설계의 컷 안전성의 핵심이다** — 어댑터는 DOM 삽입 함수일 뿐이고 중재 호출은 층 1이 소유한다(Planning Decision #61).
