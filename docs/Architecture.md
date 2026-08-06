# Architecture — 크로스보더 협업 중재 서비스

Owner: architect (see AGENTS.md). Others read-only.
Major decisions are logged in DECISIONS.md; details in adr/.
Based on PRD Version: v3.2 · Based on UX Version: 6.0 · Last Updated: 2026-08-05
(2026-08-05 **6차 패스** — **PRD·UX 버전 갱신 없음**(v3.2 / 6.0 그대로, 버전 격차 0 — architect가 `docs/PRD.md`·`docs/UX.md` 의 Document Version 헤더를 직접 재확인). 이 패스가 바꾼 것은 **F1 확장 1건뿐**이다: **F1-e 신설 — `MediationResult` 에 스텝별 출처 `stepSources` 13번째 필드 추가**(DECISIONS #48 · ADR-0009). T15/T16 라운드에서 implementer가 architect로 라우팅한 Open Question(*"부분 폴백 시 어느 스텝이 통조림인지 화면이 구분할 수 없다"* — `apps/web/components/ComparisonView.tsx:33~39`)의 처리다. 🔴 **이 커밋은 계약만 확정한다** — `route.ts`·UI 컴포넌트를 채우는 작업은 implementer 다음 라운드이며 목록은 F1-e 절의 이월 표에 있다)
(2026-08-05 **5차 패스** — **PRD·UX 버전 갱신 없음**(v3.2 / 6.0 그대로, 버전 격차 0 — architect가 두 문서의 Document Version 헤더를 직접 재확인). 이 패스가 바꾼 것은 **누적된 정정 5건 + 결정 기록 1건**이다: **① 라우트 이름 6건을 `docs/UX.md` IA(:890)에 맞춰 정정 + 루트 `/` 리다이렉트 확정**(DECISIONS #43) **② 로컬 env 파일 표기 `.env.local` → `.env`**(#44) **③ `POST /api/deadline/check` 에 `urgency` 추가 — AC-005 지연 절반의 서버 게이트**(#45, `docs/API.md`) **④ F1-d 신설 — 기준일을 `MediationDeps` 로**(#46 · ADR-0008) **⑤ RLS 소유자 컬럼명 정정**(#47, `docs/Database.md`) **⑥ T15 AC-028 확장 절반 이월의 사용자 승인 기록**(#42) **⑦ 설계 제1원칙의 진척 수치 갱신** — `docs/UpdateRequests.md` #2 resolved)
(2026-08-05 4차 패스 — **PRD·UX 버전 갱신 없음**(v3.2 / 6.0 그대로, 버전 격차 0). 이 패스가 바꾼 것: **① 존댓말 레벨 결정 규칙 신설**(Data Flow 1-a — AC-046 ②의 "규약 우선" 절을 MVP 구현 대상에서 제외하고, 빈 프로필에 기본 레벨을 지정하지 않는다. DECISIONS #39·#40 · ADR-0007) **② Conventions 14 신설** **③ `docs/Database.md`·`docs/API.md` 의 AC-073 ② 오인용 정정**)
(2026-08-04 3차 패스 — 이 패스가 바꾼 것: **① Next.js 15 → 16**(사용자 결정, DECISIONS #37) **② F1-c 신설**(계약 불변식 강제, DECISIONS #38 · ADR-0006) **③ 문서 정정 4건**(Conventions 12 / F1-b 시그니처 / 폴더 트리 / ADR-0004 Follow-up 3))

> ✅ **승인 게이트 — 기술 기반 6개 항목은 2026-08-04 사용자 결정으로 전부 승인되었다(architect 권고안 그대로).**
> **따라서 "승인 전 T2·T3·T17·T45 착수 금지" 조항은 해제되었다.** 아래는 확정된 기반이며 권고안이 아니다.
>
> | 게이트 항목 | 확정값 | 상태 | 조건 |
> |---|---|---|---|
> | ① 언어 / 프레임워크 | **Next.js 16** App Router + TypeScript(strict) **통합 1리포**(npm workspaces 3패키지) | ✅ **승인** (2026-08-04) | 🔴 **메이저 버전만 15 → 16으로 변경**(2026-08-04 사용자 결정, DECISIONS #37). 프레임워크 선택 자체는 승인 그대로이며 바뀐 것은 버전뿐이다 — 사유는 Tech Stack 프레임워크 행 |
> | ② DB 엔진 | PostgreSQL 15+ (관계형) | ✅ **승인** | 사용자 조건 "무료로 가능하면" — Supabase Free로 충족 확인(아래 무료 티어 한도 표) |
> | ③ DB 호스팅 | Supabase 관리형 Postgres (Free) | ✅ **승인** | 동일 |
> | ④ 배포 대상 | Vercel Hobby + `*.vercel.app` 기본 서브도메인 | ✅ **승인** | 사용자 조건 "무료로 진행 가능하면" — $0 확인. 단 **비상업 전용 제약이 실재**하며 MVP 기간에는 차단 아님(Risks & Trade-offs 참조) |
> | ⑤ 인증 방식 | Supabase Auth(이메일+비밀번호) + RLS. **앱 레벨 비밀번호 복잡도 검증 0줄** | ✅ **승인** | Planning Decision #30이 architect에게 넘긴 판단의 확정 |
> | ⑥ 실시간 / websocket | **불필요** — 요청/응답만. websocket·Supabase Realtime·SSE·폴링 모두 미채택 | ✅ **승인** | — |
>
> 승인 사실은 `docs/DECISIONS.md` **#31**(append-only 신규 행)에 기록되어 있다 — #1·#3·#4·#5·#6·#7의 본문은 이력 보존을 위해 수정하지 않았다.
> 각 항목의 권고 이유·대안·대가는 `docs/adr/0001`·`0002` 및 architect 설계 보고서의 "Foundational Technical Questions" 절에 있다.

---

## 설계 제1원칙 (이 문서의 모든 판단이 여기서 나온다)

마감 **2026-08-21**, 기준일 **2026-08-04** → **17일**. 팀 **4명**.

🔴 **진척 수치 갱신(2026-08-05, `docs/UpdateRequests.md` #2 처리)** — 이 절은 최초 작성 시 *"코드 **0줄**, 태스크 **72건 전부 `todo`**"* 라고 적었고 그것은 **2026-08-04 시점에는 사실이었으나 지금은 아니다.** 현재값(measured — architect가 2026-08-05 `docs/Tasks.md` Status 열을 직접 집계): **총 72건 · `done` 16건 · `review` 2건(T15·T16) · `todo` 54건.** 코드도 0줄이 아니다 — `apps/web`·`apps/extension`·`packages/core` 에 실제 소스가 있다. **아래 R1~R3의 판단은 이 갱신으로 바뀌지 않는다**(남은 기간이 짧아졌을 뿐 근거는 같은 방향으로 더 강해진다).

따라서 이 문서가 최적화하는 것은 **"좋은 아키텍처"가 아니라 "17일 안에 4명이 서로를 기다리지 않고 완주 가능한 아키텍처"** 다. 파생 규칙 3개:

| # | 규칙 | 이 문서에서의 귀결 |
|---|---|---|
| R1 | **계층을 늘리지 않는다.** Repository/Service/UseCase 3단 분리, DI 컨테이너, CQRS는 채택하지 않는다 | Route Handler → core 함수 → Supabase 클라이언트, 2홉이 최대 깊이 |
| R2 | **경계는 먼저 고정하고 내용은 나중에 채운다.** 4명이 병렬로 가려면 인터페이스가 코드보다 먼저 있어야 한다 | 아래 "동결 지점(Freeze Points)" 4개 |
| R3 | **컷은 파일 삭제로 끝나야 한다.** Planning Decision #62/#68 순서대로 잘라냈을 때 남는 코드가 빌드되고 배포돼야 한다 | 층 2·P2 기능은 전부 **레지스트리 등록 1줄 + 파일 1개** 구조 |

채택하지 않은 더 정교한 대안은 "Risks & Trade-offs"에 **"왜 지금은 아닌가"**로 남겼다.

---

## Tech Stack

✅ 아래 표의 **굵은 행 6개가 게이트 항목이며 2026-08-04 사용자 결정으로 전부 승인되었다**(문서 상단 게이트 표 · `docs/DECISIONS.md` #31).

| Layer | Choice | Reason |
|---|---|---|
| **언어** | **TypeScript 5.x (strict)** | 프론트·백엔드·확장이 한 언어여야 4명이 서로의 코드를 읽는다. `docs/CodingRules.md` Prohibitions "No `any`/untyped escapes"가 타입 있는 언어를 전제한다 |
| **프레임워크** | **Next.js 16 (App Router)** — 프론트 + Route Handler 백엔드 통합 | PRD Constraints "기술 스택 팀 선호: Next.js(TypeScript) 통합". 배포 대상 1개, CI 1개, CORS 0개. AC-030(키 백엔드 경유)은 `app/api/*` Route Handler 하나로 충족. <br>🔴 **15 → 16 사유(2026-08-04 사용자 결정, DECISIONS #37)**: T2 스캐폴드 직후 `npm audit --omit=dev` 에서 **next 15가 번들한 `postcss`·`sharp` 의 high severity 3건**이 검출됐고(오케스트레이터 measured, 2026-08-04 직접 실행·재현), 해소 경로가 **`next@16` breaking 업그레이드**뿐이었다. 선택지는 *"15 유지 + 위험 수용"* 과 *"16 업그레이드"* 두 가지였고 **사용자가 16을 명시적으로 선택**했다. `next@16.3.0` 이 현재 `latest` 임은 architect가 registry.npmjs.org/next/latest 를 직접 조회해 확인(measured, 2026-08-04). <br>⚠️ **문서만 갱신된 상태다** — `apps/web/package.json` 은 이 커밋 시점에 `"next": "^15.5.22"`(measured, `apps/web/package.json:15`)이며 실제 설치·마이그레이션은 implementer가 뒤이어 수행한다 |
| 코어 엔진 | `packages/core` — **의존성 0**(프레임워크·DB·HTTP 클라이언트 import 금지) | AC-028 "코어 엔진이 특정 어댑터에 의존하지 않으며 동일 인터페이스로 두 어댑터에서 호출". 패키지 경계로 만들어야 `import` 경로로 **검증 가능**해진다 |
| 모노리포 도구 | **npm workspaces** (Node 20+ 내장) | 추가 도구 설치 0. Turborepo·Nx는 17일 프로젝트에서 학습 비용 > 이득 |
| **DB 엔진** | **PostgreSQL 15+ (관계형)** | 스키마가 실제로 관계형이다(user→profile→learned_items, pair→protocol, message→diff). AC-039(계정 간 데이터 미조회)를 **RLS로 DB 레벨에서** 강제할 수 있는 것이 결정적 |
| **DB 호스팅** | **Supabase 관리형 Postgres (Free)** | PRD Constraints "저장소는 Supabase". 엔진과 호스팅은 별개 결정이며 둘 다 명시한다 |
| **인증** | **Supabase Auth** (이메일+비밀번호), 세션은 `@supabase/ssr` 쿠키 | Planning Decision #30이 architect에게 넘긴 판단. 근거는 ADR-0002 |
| DB 접근 | `@supabase/supabase-js` — **ORM 없음** | Prisma/Drizzle은 스키마 정의·마이그레이션·생성 단계를 하나 더 만든다. 테이블 11개 규모에서 SQL 마이그레이션 + 타입 생성(`supabase gen types`)으로 충분 |
| LLM | **OpenAI API** (Planning Decision #16, user-approved) — 모델명은 `OPENAI_MODEL` 환경변수 | 모델 등급을 코드에 박지 않아야 Decision #29(크레딧 제한 가정)에서 등급을 내릴 때 재배포만으로 끝난다 |
| **배포** | **Vercel Hobby**, `*.vercel.app` 기본 서브도메인 | Planning Decision #28(무료 호스팅 기본 서브도메인, 커스텀 도메인 미구매)을 그대로 만족. `main` 머지 → 자동 반영(Delivery & Deployment "Release cadence")이 기본 동작 |
| Chrome 확장 | **Manifest V3**, 번들러 **Vite**(라이브러리 모드) | 개발자 모드 로드 확정(Planning Decision #4)이라 스토어 패키징 요구가 없다. Vite는 `packages/core` 를 그대로 번들할 수 있다 |
| 테스트 | **Vitest** + `@testing-library/react` | Vite 기반이라 확장·웹앱·코어 **한 러너로** 돈다. T11(회귀 검증셋 26건)이 "하나의 실행 출력"을 요구하므로 러너가 갈리면 안 된다 |
| 린터 / 포매터 | **ESLint (flat config) + Prettier** | `docs/CodingRules.md` Style 칸이 비어 있어 DoD Gate "Lint passes"가 실행 불가 상태다(보고서 권고 항목) |
| CI | **GitHub Actions** (lint + typecheck + test) | Vercel 빌드는 테스트를 돌리지 않는다 — DoD Gate의 "Tests exist and pass"를 자동화하려면 별도 워크플로가 필요하다 |
| **실시간** | **없음** (websocket / Supabase Realtime 미사용) | 근거는 아래 "실시간이 필요 없는 이유" 절 |
| 에러 추적 | **없음** — 로그 + `llm_call_log` 테이블 | Observability 절 참조 |

### 실시간이 필요 없는 이유 (게이트 항목 ⑥의 근거)

| 실시간처럼 보이는 것 | 실제 구조 | 근거 |
|---|---|---|
| 2패널 "수신자 도착"(AC-009) | **같은 브라우저·같은 요청의 응답**을 오른쪽 패널에 렌더할 뿐이다. 두 번째 클라이언트가 없다 | UX Decision Log "Two-Panel Workspace Interpreted as Single-User Before/After Comparison, Not a Two-Account Inbox" |
| 쌍방 규약 합의(#24) | 알림 경로를 **MVP에서 만들지 않기로 확정** — 상대는 직접 화면에 들어와야 본다 | Planning Decision #87 / AC-037 |
| 침묵 감지(#29) | 사용자가 **수동으로** "답장 받음"을 표시한다. 자동 감지 코드 경로가 **없어야** 한다 | AC-044 ⑤ |
| 예약 발송(R3) | mock-send이며 실제 발송 시각에 무언가를 밀어 보낼 대상이 없다 | Planning Decision #37 |

**결론: 요청/응답만으로 전 기능이 성립한다.** 폴링조차 불필요하다(화면 진입 시 조회로 충분). 실시간을 넣으면 구독 수명주기·재연결·중복 이벤트라는 **새 실패 모드 3종**이 생기고, 그중 하나라도 발표 중 터지면 복구 수단이 없다.

---

## Folder Structure

```
cross-border-mediator/
├─ apps/
│  ├─ web/                                  # Next.js 16 · [FE] 소유
│  │  ├─ app/
│  │  │  ├─ page.tsx                        # 🔴 루트 `/` → redirect('/mediate') (DECISIONS #43)
│  │  │  ├─ (auth)/login/page.tsx           # UX-001
│  │  │  ├─ (auth)/signup/page.tsx          # UX-002
│  │  │  ├─ (app)/onboarding/page.tsx       # UX-003 — 🔴 (with-nav) 밖. 상시 내비 미상속
│  │  │  ├─ (app)/(with-nav)/layout.tsx     # 상시 내비게이션 + 로그아웃
│  │  │  ├─ (app)/(with-nav)/mediate/page.tsx              # UX-004 (기본 랜딩)
│  │  │  ├─ (app)/(with-nav)/ticket/page.tsx               # UX-007
│  │  │  ├─ (app)/(with-nav)/decisions/page.tsx            # UX-008
│  │  │  ├─ (app)/(with-nav)/profile/page.tsx              # UX-009
│  │  │  ├─ (app)/(with-nav)/terminology/page.tsx          # UX-010
│  │  │  ├─ (app)/(with-nav)/pair-protocols/page.tsx       # UX-011
│  │  │  ├─ (app)/(with-nav)/pair-protocols/[counterpart]/page.tsx      # UX-011 상대별
│  │  │  ├─ (app)/(with-nav)/meeting-times/page.tsx        # UX-012
│  │  │  ├─ (app)/(with-nav)/feedback/page.tsx             # UX-013
│  │  │  ├─ (app)/(with-nav)/sent-messages/page.tsx        # UX-015
│  │  │  ├─ (app)/(with-nav)/enrichment/page.tsx           # UX-018   ← P2. 폴더 삭제로 컷
│  │  │  ├─ (app)/(with-nav)/observation-samples/page.tsx  # UX-019   ← P2. 폴더 삭제로 컷
│  │  │  ├─ (app)/(with-nav)/observation-samples/[counterpart]/page.tsx # UX-019 상대별 (동일 컷 단위)
│  │  │  ├─ extension/connect/page.tsx      # 확장 토큰 인계 (아래 "확장 인증" 절)
│  │  │  └─ api/…                           # docs/API.md 가 단일 출처
│  │  ├─ components/                        # 화면 컴포넌트. core 를 import 해도 되고, core 는 여기를 절대 import 하지 않는다
│  │  └─ lib/
│  │     ├─ supabase/{server,browser}.ts    # 클라이언트 생성 (여기서만)
│  │     ├─ auth.ts                         # 세션 해석 (쿠키 | Bearer)
│  │     ├─ http.ts                         # withApi(): 인증·검증·에러 매핑 래퍼
│  │     └─ llm/openai.ts                   # LLMClient 구현체 (core 의 인터페이스를 구현)
│  │
│  └─ extension/                            # Chrome MV3 · [FE] 소유
│     ├─ manifest.json
│     └─ src/
│        ├─ layer1/                         # 🔒 컷 대상 아님 (Planning Decision #61/#62)
│        │  ├─ selection.ts                 # T55 mouseup → getSelection → 플로팅 버튼
│        │  ├─ panel.tsx                    # T56 중재 패널 + 클립보드
│        │  ├─ registry.ts                  # 🔒 Freeze Point 2 — Layer2Adapter 계약 (T57)
│        │  └─ notice.ts                    # T58 프라이버시 고지 + 버전 비교 (AC-076)
│        ├─ layer2/                         # ← 컷 지점. 파일 삭제 + index.ts 한 줄 제거
│        │  ├─ index.ts                     #   export const adapters: Layer2Adapter[] = [github, slack, gmail]
│        │  ├─ github.ts                    #   T29
│        │  ├─ slack.ts                     #   T47
│        │  └─ gmail.ts                     #   T49
│        ├─ mark/                            # ← 컷 지점 (P2, T71). 층 1은 이것 없이 동작
│        └─ shared/api.ts                   # 백엔드 호출 (Bearer)
│
├─ packages/
│  └─ core/                                 # 🔒 프레임워크 의존 0 · [BE-A]+[BE-B] 공동 소유
│     └─ src/
│        ├─ contract.ts                     # 🔒 Freeze Point 1 — T1 I/O 스키마 (AC-027)
│        ├─ errors.ts                       # CoreError 계열 + ErrorCode enum
│        ├─ pipeline.ts                     # C1→C3→C5→C2→C4→(C6) 순서 고정 (AC-032)
│        ├─ steps/{c1,c2,c4,c6,c7}.ts       # [BE-A]: c1,c2 / [BE-B]: c4,c6,c7
│        ├─ prompts/                        # 프롬프트 텍스트 + PROMPT_VERSION 상수
│        ├─ llm/client.ts                   # interface LLMClient — 구현은 주입받는다
│        ├─ rules/
│        │  ├─ preservation.ts              # C2 보존 필터 (AC-006/007)
│        │  ├─ misread-risk.ts              # AC-043
│        │  ├─ emoji-risk.ts                # AC-056 — country/region/nationality 필드 없음
│        │  ├─ honorific.ts                 # AC-046
│        │  ├─ business-days.ts             # AC-044② 업무일 계산
│        │  ├─ decision-authority.ts        # 🔒 결정 권한 enum + 판정 로직 단일 출처 (AC-064④) — C6·C7 공용
│        │  └─ ticket-gate.ts               # 🔒 F1-c — TicketOption 생성자 1개 (AC-058 fail-closed)
│        ├─ observation/indicators.ts       # 🔒 지표 정의 단일 출처 (AC-080④) — 서버·확장 공용
│        ├─ data/holidays-2026.ts           # KR/US/JP/CN 하드코딩 (AC-057, 외부 API 0)
│        ├─ data/emoji-risk.ts              # 위험도 3단계 룩업
│        ├─ data/fallback-responses.ts      # AC-041 사전 준비 데모 응답
│        └─ constants.ts                    # 🔒 임계값 상수 격리 지점 (AC-077/AC-082)
│
├─ supabase/migrations/                     # 0001_init.sql … — docs/Database.md 가 단일 출처
├─ tests/                                   # T11 회귀 검증셋 러너 (docs/TestCases.md 를 읽는다)
├─ .github/workflows/ci.yml
├─ package.json                             # workspaces: ["apps/*", "packages/*"]
├─ .env.example                             # 플레이스홀더만 (T3에서 갱신)
└─ docs/
```

🔴 **라우트 이름의 단일 출처는 `docs/UX.md` Information Architecture(:890)다 — 2026-08-05 정정(DECISIONS #43).** 이 트리는 원래 `/dictionary`·`/protocol`·`/meeting`·`/summary`·`/sent`·`/samples` 라는 **짧은 이름 6건**을 쓰고 있었고, 그것이 스캐폴드에도 그대로 들어갔다(measured — `apps/web/app/(app)/(with-nav)/` 실측). **정당화 문구가 어디에도 없었으므로 의도적 예외가 아니라 드리프트로 판정**하고, AGENTS.md Document Priority(UX.md 4위 > Architecture.md 6위)에 따라 UX.md 이름을 채택했다. **`docs/API.md` 의 `/api/*` 경로는 영향받지 않는다**(F2 불변 — 화면 경로와 API 리소스명이 달라지는 것은 의도된 결과다).

⚠️ **코드는 아직 옛 이름이다** — 위 6개 디렉터리 rename과 루트 `page.tsx` 신설은 **미배정 작업**이며(measured — `docs/Tasks.md` 전문에 내비게이션·랜딩·리다이렉트 관련 태스크 0건), architect의 권고는 **상시 내비게이션 바 신설과 묶어 신규 [FE] 태스크 1건**으로 만드는 것이다. 태스크 신설은 **planner 소관**이다.

### 이 구조가 강제하는 것

| 규칙 | 강제 수단 | 검증 방법 |
|---|---|---|
| `packages/core` 는 `apps/*` 를 import 하지 않는다 | 별도 패키지 = `apps` 가 `core` 의 `dependencies` 에 없음 | `npm ls` / import 경로 검사 (AC-028) |
| `packages/core` 는 `next`·`react`·`@supabase/*`·`openai` 를 import 하지 않는다 | ESLint `no-restricted-imports` 를 `packages/core` 에만 적용 | `npm run lint` 가 실패한다 — 리뷰 의견이 아니라 **빌드 실패** |
| 층 1은 층 2를 import 하지 않는다 | `layer1/registry.ts` 는 **인터페이스만** 정의하고, 배열은 `layer2/index.ts` 가 주입 | `layer2/` 폴더 삭제 후 빌드 성공 = AC-053③ |

---

## Layers & Module Boundaries

```
[웹 어댑터]              [확장 어댑터]
apps/web/app/*           apps/extension/src/layer1/*
apps/web/components/*    apps/extension/src/layer2/*  (선택)
      │                        │
      │  둘 다 같은 HTTP 계약(docs/API.md)만 안다
      ▼                        ▼
┌──────────────────────────────────────────────┐
│ apps/web/app/api/**  (Route Handler = 경계)   │  ← 인증·입력검증·에러매핑·rate limit
│   withApi(handler)                            │     여기 밖으로 예외가 새지 않는다
└──────────────────────┬───────────────────────┘
                       ▼
┌──────────────────────────────────────────────┐
│ packages/core   (순수 TypeScript, 의존성 0)    │  ← C1~C7·규칙·데이터·지표 정의
│   pipeline / steps / rules / data             │     I/O는 전부 인자와 반환값으로만
└──────────────────────┬───────────────────────┘
                       │ 인터페이스 주입 (역방향 의존 없음)
      ┌────────────────┴────────────────┐
      ▼                                 ▼
 LLMClient 구현                    저장소 접근
 apps/web/lib/llm/openai.ts       apps/web/lib/supabase/*
```

### 의존 방향 규칙 (implementer가 지켜야 할 것)

| 이 모듈이 | 이것을 import 해도 된다 | 절대 import 하면 안 되는 것 |
|---|---|---|
| `packages/core` | 표준 라이브러리, `zod`(스키마 검증) | `next`, `react`, `@supabase/*`, `openai`, `apps/*` 의 무엇이든 |
| `apps/web/app/api/**` | `packages/core`, `apps/web/lib/**` | `apps/web/components/**`, `apps/extension/**` |
| `apps/web/components` | `packages/core`(타입·상수), `apps/web/lib` | `apps/web/app/api/**` 의 내부 함수(HTTP로만 호출) |
| `apps/extension/src/layer1` | `packages/core`(타입·지표 정의), `shared/api` | `apps/extension/src/layer2/**`, `apps/web/**` |
| `apps/extension/src/layer2/{github,slack,gmail}` | `layer1/registry` 의 **타입만** | 서로(어댑터끼리 참조 금지), `layer1` 의 구현, `packages/core` |

**층 2 어댑터끼리의 참조를 금지하는 이유**: Planning Decision #68이 Slack·Gmail을 동순위로 두고 스파이크 결과로 하나만 남길 수 있게 했다. 서로를 참조하면 하나를 지울 때 다른 하나가 깨진다.

---

## 동결 지점 (Freeze Points) — 병렬 작업의 전제

> **"이것만 합의되면 나머지는 독립적으로 진행 가능"한 지점.** 4명이 서로를 기다리지 않으려면 아래 4개가 **코드보다 먼저** 머지돼야 한다. Risks의 "백엔드 A/B의 I/O 스키마 불일치" 행이 지목하는 재작업이 바로 이것을 늦출 때 생긴다.

| # | 동결 대상 | 파일 | 태스크 | 동결되면 병렬 가능해지는 것 | 목표 시점 |
|---|---|---|---|---|---|
| **F1** | 코어 I/O 계약 | `packages/core/src/contract.ts` | **T1** | [BE-A] C1·C2 / [BE-B] C4·C6·C7 / [FE] 전 화면이 **동시에** 착수 가능. 프론트는 계약만 보고 목 데이터로 UI를 끝낼 수 있다 | M0 (08-04~06) |
| **F2** | HTTP 계약 | `docs/API.md` (본 문서와 함께 이 커밋) | T1 파생 | [FE]가 백엔드 완성을 기다리지 않는다. 경로·상태코드·에러코드가 고정되면 목 서버로 진행 | M0 |
| **F3** | 저장 스키마 | `docs/Database.md` + `supabase/migrations/0001_init.sql` | **T18** (설계는 본 커밋) | [BE-B] 저장 로직과 [FE] 조회 화면이 동시에. **T45 인증이 T18보다 먼저**(Planning Decision #43)이므로 마이그레이션은 인증 완료 직후 적용 | M2 첫날 (08-12) |
| **F4** | 층 2 어댑터 계약 | `apps/extension/src/layer1/registry.ts` | **T57** | T29·T47·T49가 **서로 독립적인 3개 파일**이 된다. 스파이크 결과로 순서를 바꿔도 다른 둘이 영향받지 않는다 | M3 앞단 (08-16) |

**F1이 늦어지면 4명 전원이 멈춘다.** `docs/Tasks.md` Rules 첫 줄이 이미 이 규칙을 명시하고 있다("T1 완료 전 T5 이후 착수 금지").

**F1 동결 후의 변경 이력** — 동결은 "절대 안 바꾼다"가 아니라 **"ADR 없이는 못 바꾼다"** 이다. 지금까지 **5건**이다: **F1-a**(`ticketOption` 12번째 필드 추가 — DECISIONS #35 · ADR-0005) · **F1-b**(파이프라인 시그니처 — #36 · ADR-0004) · **F1-c**(불변식 3개를 판별 유니온으로 — #38 · ADR-0006) · **F1-d**(기준일이 `MediationDeps` 로 들어온다 — #46 · ADR-0008) · **F1-e**(`stepSources` 13번째 필드 추가 — #48 · ADR-0009).

**기존 필드를 바꾼 변경은 여전히 0건**이다 — 다섯 건 모두 이름·타입·값 어휘를 유지한 채 덧붙이거나 조합 제약만 좁혔고, [FE]의 목 데이터가 **읽던** 값이 달라진 적은 없다. 🔴 다만 **필드를 추가하는 변경(F1-a·F1-e)은 `MediationResult` 타입으로 선언된 객체 리터럴의 필수 프로퍼티를 늘리므로 그 리터럴들이 컴파일 오류가 된다** — "와이어 형식은 그대로"와 "코드가 그대로"는 다른 말이며, 이 문서는 앞으로 둘을 구분해 적는다. F1-e의 영향 지점 목록은 아래 F1-e 절의 이월 표에 있다.

### F1 — 코어 I/O 계약 (T1이 확정할 형태)

```ts
// packages/core/src/contract.ts  — 🔒 Freeze Point 1
export interface MediationInput {
  text: string;
  sender: SenderContext;                 // 프로필(빈 상태 가능) + 언어
  recipient: RecipientContext | null;    // 🔴 nullable — AC-066 (층 1 수신자 미지정)
  context: RequestContext;               // 채널·언어방향·override 등
}

export interface MediationResult {
  urgency: 'CRITICAL' | 'NORMAL' | 'LOW';
  urgencyReason: string;                 // AC-003
  transformed: string;
  reason: string;                        // 변환 이유 1건 (단일 필드)
  preserved: PreservedItem[];            // AC-006/007
  backTranslation: string;               // AC-001
  warnings: Warning[];                   // 변환 *결과*의 문제 (이모지·존댓말 혼용·호칭 미등록)
  misreadRisks: MisreadRisk[];           // 🔴 전용 필드 — 원문이 어떻게 읽히는지 (AC-043, Decision #49)
  holidayConflicts: HolidayConflict[];   // AC-057
  personalizationApplied: boolean;       // AC-059③ / AC-066③ — 개인화 미적용 표시의 근거
  source: 'live' | 'cache' | 'fallback'; // 🔴 AC-041 — 폴백 중임을 화면에 표시하는 근거 (화면 레벨 단일 배지)
  ticketOption: TicketOption;            // 🔴 12번째 필드 (2026-08-04 추가, DECISIONS #35) — AC-058 게이트
  stepSources: StepSources;              // 🔴 13번째 필드 (2026-08-05 추가, DECISIONS #48) — 어느 영역이 폴백인지 (F1-e)
}
```

**필드 배치 판정은 이미 Planning Decision #49 / T1이 확정했다** — architect는 이를 바꾸지 않고 형식만 고정한다. `misreadRisks[]` 를 `warnings[]` 에 합치지 않는 이유 4가지는 T1 본문에 있다.

🔴 **`ticketOption` 은 기존 11개 필드의 배치를 바꾸지 않는다** — 순서·이름·타입 모두 그대로이며 **12번째로 덧붙는다.** 위치 자체는 이미 `docs/API.md` `POST /api/ticket` 의 "게이트" 행(*"게이트 판정은 `POST /api/mediate` 응답에 포함되며 이 라우트가 자체 게이트를 만들지 않는다"*)이 확정했다 — 빠져 있던 것은 **위치가 아니라 형식**이다. 아래 F1-a가 그 형식을 고정한다.

C6/C7의 결정 권한 필드는 **이름이 다른 두 필드로 공존**한다(AC-064, Planning Decision #84) — `TicketResult.decisionAuthority`(단일값)와 `SummaryResult.decisions[].authorityStatus`(행별). enum과 판정 로직은 `packages/core/src/rules/decision-authority.ts` **한 곳**을 공유한다(Planning Decision #8: C7이 별도 파이프라인을 만들지 않는다).

### F1-a — C6 티켓 게이트 판정 필드 (DECISIONS #35 · ADR-0005)

UX-004(UF-003, 게이트 판정처) → UX-007(UF-004, 게이트 통과 시에만 도달) / AC-058

```ts
// packages/core/src/contract.ts  — 🔒 Freeze Point 1
export type TicketOptionBasis = 'signal_present' | 'signal_absent' | 'undetermined';

/**
 * 🔴 **판별 유니온** (2026-08-04 F1-c, DECISIONS #38 · ADR-0006).
 * 불변식 `offered === true` ⟺ `basis === 'signal_present'` 이 **주석이 아니라 타입**이다 —
 * `{ offered: true, basis: 'undetermined' }`(AC-058 fail-open)는 컴파일되지 않는다.
 * 화면은 `offered` 만 읽는다: `true` 일 때만 "Convert to Task Ticket" 링크를 렌더하고(AC-058①),
 * `false` 면 레이아웃에서 완전히 제거한다 — 비활성·회색 링크 금지(AC-058②, UX-004 TicketLinkAbsent).
 * `basis` 는 내부 상태·테스트 출력 전용이며 렌더하지 않는다.
 */
export type TicketOption =
  | { offered: true;  basis: 'signal_present' }
  | { offered: false; basis: 'signal_absent' | 'undetermined' };
```

🔴 **JSON 형태는 바뀌지 않았다** — 필드 이름·값 어휘·`docs/API.md` 의 응답 예시 모두 그대로다. 바뀐 것은 **불법 조합이 타입에서 표현 불가능해진 것**뿐이며, 그 근거와 다른 두 불변식은 아래 **F1-c**에 있다.

| 판정 | `offered` | `basis` | 화면 | 근거 |
|---|---|---|---|---|
| 감정 신호 있음 | `true` | `signal_present` | 링크 렌더 | AC-058② "감정형 케이스에서 정상 제시" |
| 감정 신호 없음 | `false` | `signal_absent` | 링크 없음(비활성 아님) | AC-058① 대조군 |
| 판정 불가 | `false` | `undetermined` | 링크 없음 | Conventions 9 "없는 값을 지어내지 않는다" + Error Handling ④ 부분 실패 |

**AC-058 검증 케이스는 이미 존재한다 — 새로 만들지 않는다.** `docs/TestCases.md` 표 B의 **T-E 그룹**(planner 소유)이 그대로 이 필드의 기대값이다: **T-E03**("확인 부탁드립니다" — 검증 항목 *"티켓 변환 옵션 제시 안 함"*) → `{ offered: false, basis: 'signal_absent' }`(AC-058① 대조군) / **T-E01·T-E02·T-E04**(감정형) → `{ offered: true, basis: 'signal_present' }`(AC-058②). 🔴 대조군이 `signal_absent` 가 아니라 `undetermined` 로 통과하면 **AC 통과가 아니라 파이프라인 고장**이다.

**이 형식을 택한 이유 4가지**

1. **AC-058은 boolean 하나로 검증된다.** 요구는 "대조군 1건 미제시 + 감정형 1건 제시"이며 등급·점수·확신도를 요구하지 않는다. 판정 결과보다 많은 것을 응답에 담으면 **AC가 요구하지 않은 감정 데이터를 만들어 내보내는 것**이 된다.
2. **`basis` 를 따로 둔 이유는 AC-063②의 선례와 같다.** 공휴일은 "충돌 없음"과 "데이터 없음"을 화면에서는 똑같이 아무것도 안 보이게 하되 **내부 상태·테스트 출력에서는 구분**한다. 게이트도 동일하다 — `signal_absent`(정상 판정)와 `undetermined`(판정 실패)가 타입에서 구분되지 않으면 QA가 AC-058의 대조군 통과와 파이프라인 고장을 구별할 수 없다.
3. **`null` 이 아니라 항상 존재하는 객체다.** AC-062가 티켓 4섹션에 적용한 원칙("생략·빈칸이 아니라 명시")과 같다. `nullable boolean` 은 `if (x)` 에서 `null` 과 `false` 가 같아 보여 **부분 실패가 정상 판정으로 위장**된다.
4. **fail-closed.** 근거를 얻지 못했을 때 링크를 띄우면 AC-058이 금지한 "항상 제시"에 가까워지고, Conventions 9(근거 없으면 만들지 않는다)에도 걸린다.

🔴 **감정 점수·감정 라벨을 응답에 넣지 않는다 — 명시적 판단이며 누락이 아니다.** 근거는 `docs/PRD.md` Risks의 EU AI Act Article 5(1)(f) 행이다: MVP에 남은 사정권은 AC-018·AC-058 둘뿐이고, 그 방어선은 *"발신자 본인이 방금 입력한 자기 텍스트를 대상으로 하고 결과도 본인에게만 표시된다"* 이다. `emotionScore: number` 나 `emotionLabel: string` 을 계약에 넣으면 **① 응답 payload 자체가 "사람의 감정 상태에 대한 등급 판정"이라는 산출물**이 되어 그 서술과 어긋나고, **② `emotion*` 이라는 이름이 계약에 생기면 AC-070②("감정 분류 함수·프롬프트·저장 필드 부재를 코드 검색으로 확인")의 grep 판정에 잡음이 섞여** 검증 자체가 흐려진다. 필드명을 제품 결정(*티켓 옵션을 제시했는가*)으로 지은 것은 이 두 가지를 동시에 피하기 위한 것이다. 자연어 감정 서술을 담는 자유 문자열도 두지 않는다 — `basis` 는 **enum 3값이 전부**다.

**저장·로그 금지**: `ticketOption` 은 어떤 테이블에도 저장되지 않는다(`POST /api/mediate` 는 저장하지 않으며, `sent_messages` 에 감정 컬럼이 없다 — AC-070②). 구조화 로그에도 필드를 추가하지 않는다(DECISIONS #27의 로그 필드 목록 불변). AC-058의 증거는 **T11 회귀 검증셋의 실행 출력**이며 운영 로그가 아니다.

**소비처**: `[FE]` UX-004 한 곳뿐이다. 확장 패널(UX-016)은 이 필드를 읽지 않는다 — UX-016이 담당하는 Flow 목록에 UF-004(티켓)가 없다. `POST /api/ticket` 은 여전히 **자체 게이트를 만들지 않는다**(`docs/API.md`) — 판정기가 둘이 되면 같은 입력이 두 가지로 갈린다. 따라서 AC-058의 보장은 **UI 레벨의 보장**이며, 라우트를 직접 호출하는 경로까지 막지는 않는다(Security의 Abuse cases 13·14 행이 그 잔여 표면을 이미 다룬다 — 결과는 입력자 본인에게만 표시된다).

### F1-b — 파이프라인 시그니처: DB 조회물이 들어오는 자리 (DECISIONS #36 · ADR-0004)

UX-004(UF-003) · UX-016(UF-011/012/014/015) / AC-015·AC-016·AC-047(용어사전) · AC-013·AC-014(학습 항목) · AC-028(코어 비의존)

```ts
// packages/core/src/pipeline.ts  — 🔒 Freeze Point 1
/**
 * 🔴 **동결 형태는 함수 *선언*이 아니라 함수 *타입 별칭*이다** (2026-08-04 정정 — ADR-0004 Addendum A).
 * 이 문서와 ADR-0004는 원래 `export function run(input, deps): Promise<MediationResult>;` 로 적었으나
 * 그 형태는 본문 없는 함수 선언이라 `.ts` 에서 컴파일되지 않는다
 * (measured: `error TS2391: Function implementation is missing`, T1 implementer 재현).
 */
export type MediationPipeline = (
  input: MediationInput,
  deps: MediationDeps,
) => Promise<MediationResult>;

// 🔴 T28은 이 한 형태로만 구현한다 — `export const run: MediationPipeline = async (input, deps) => {…}`.
//    평범한 `export async function run(...)` 은 별칭을 참조하지 않아 인자 수가 어긋나도 빌드가 통과한다
//    (measured: 3-인자 버전이 EXIT=0 통과 / `const` + 타입 주석 형태는 TS2322 로 즉시 실패).

export interface MediationDeps {
  /** 실행 수단. core는 인터페이스만 알고 구현(`apps/web/lib/llm/openai.ts`)을 모른다. */
  llm: LLMClient;
  /** 🔴 **호출 전에 이미 조회를 마친** DB 산출물. core는 여기서 읽기만 하고 조회하지 않는다. */
  data: MediationData;
  /** 🔴 **F1-d**(2026-08-05 추가 — DECISIONS #46 · ADR-0008) 호출 시점의 기준일(ISO `YYYY-MM-DD`).
   *  호출자가 만들어 넘긴다 — **core 안에 `new Date()` 가 생기면 반려**한다. 아래 F1-d 절 참조. */
  referenceDate: string;
}

export interface MediationData {
  /** C5 용어사전 — `dictionary_terms` 전 행(사용자 스코프, DECISIONS #22). 비어 있으면 `[]`. */
  dictionary: DictionaryEntry[];
  /** C3 학습 항목 — `profile_learned_items` 전 행. 비어 있으면 `[]`(정상 상태, AC-059). */
  learnedItems: LearnedItem[];
}

/** `docs/Database.md` `dictionary_terms` 중 **변환이 읽는 컬럼만**. `id`·`note` 는 화면용이라 넣지 않는다. */
export interface DictionaryEntry {
  entryType: 'term' | 'person';
  sourceText: string;                    // term: 원문 용어 / person: 실명
  targetText: string | null;             // term: 유지할 표기. null이면 원문 유지
  koHonorific: string | null;            // person 전용
  enHonorific: string | null;            // 🔴 person 전용. null이면 추측 생성 금지(AC-047②③)
}

/** `docs/Database.md` `profile_learned_items` 중 변환이 읽는 컬럼만. */
export interface LearnedItem {
  patternKey: string;                    // diff_records.pattern_key 와 같은 어휘
  value: string;
  // observed_count 는 넣지 않는다 — CHECK ≥ 3 이라 행의 존재 자체가 3회 도달을 뜻한다(AC-013)
}
```

**어디에 넣을지의 판정표 (표에 없는 케이스가 나오면 임의 판단하지 말고 이 표에 행을 추가한다)**

| 이 값이 | then | 이유 |
|---|---|---|
| 이 요청 **당사자 1인의 속성 객체**(발신자 프로필, 그 쌍의 규약, 수신자 국가·타임존) | `MediationInput` 안 — T1이 확정한 4필드 구조 그대로 | 이미 `SenderContext.profile` / `RecipientContext.protocol` 에 자리가 있다. **바꾸지 않는다** |
| 변환이 **참조하는 목록형 조회물**(용어사전 N행, 학습 항목 N행) | `deps.data` | 당사자 서술이 아니라 참조 자료이고 건수가 가변이다 |
| **실행 수단**(LLM 호출, 향후 시계 등) | `deps` 최상위 | `LLMClient` 가 이미 이 자리다 |
| 🔴 **호출 시점에 확정되는 요청 단위 스칼라**(기준일 `referenceDate` 등) | `deps` 최상위 | **2026-08-05 추가 행**(F1-d · ADR-0008). 당사자 서술도 조회물도 아니다 — **호출자만 알 수 있고 core가 만들어서는 안 되는 값**이다. 인터페이스(`Clock`)가 아니라 **값**인 이유는 F1-d 절 |
| core가 **직접 조회** | ❌ **금지** | 위 "의존 방향 규칙" — `packages/core` 는 `@supabase/*` 를 import 할 수 없다. ESLint `no-restricted-imports` 가 빌드를 실패시킨다 |

🔴 **`MediationInput` 은 T1이 확정한 4필드에서 늘어나지 않는다.** 앞으로 발견되는 DB 조회물은 전부 `deps.data` 로 간다 — 이 규칙이 없으면 T10·T28에서 사람마다 다른 자리에 넣는다.

**조회 함수가 아니라 조회 *결과*를 넘기는 이유 3가지**

1. **`Layers & Module Boundaries` 의 core 박스가 이미 이것을 규정한다** — *"I/O는 전부 인자와 반환값으로만"*. `loadDictionary(): Promise<…>` 를 주입하면 core 안에서 저장소 실패가 발생하고, **어느 층이 예외를 잡는가**(Error Handling 표: `withApi()` 한 곳)가 흐려진다.
2. **부분 실패 정책이 한 곳에 남는다.** 사전 조회 실패가 중재 전체를 실패시키지 않아야 하는데(Error Handling ④), 조회를 Route Handler가 하면 그 판단이 **`withApi()` 안 한 곳**에 있고, core가 하면 스텝마다 흩어진다.
3. **T11(회귀 검증셋 26건)이 목 없이 돈다.** 순수 함수라 픽스처를 그대로 넣으면 되고, "하나의 실행 출력" 요구가 저장소 목 설정 없이 성립한다.

**수용한 대가**: `urgency === 'CRITICAL'` 이면 C3를 건너뛰므로(Data Flow ③) 그때는 `learnedItems` 조회 1건이 **버려진다.** 같은 요청에서 이미 4~5건을 읽고 있고 동시 사용자 10명(NFR Scale) 규모라 무시할 수 있는 값이며, 그 대가로 얻는 것이 위 3가지다.

🔴 **프롬프트 주입 방어의 소유자**: `dictionary` 값은 사용자 자신의 데이터지만 **지시문이 아니라 데이터로 취급**한다 — 구분자로 감싼 데이터 블록으로 넣는 책임은 `packages/core/src/prompts/`(C2 프롬프트 빌더)에 있고 Route Handler에 있지 않다(Security의 Abuse cases 12행).

### F1-c — 계약 불변식을 타입으로 강제한다 (DECISIONS #38 · ADR-0006)

AC-058(티켓 게이트) · AC-050①/AC-064⑤(근거 없는 판정 금지) / UX-004 `TicketLinkAbsent` · UX-007 · UX-008

**왜 이 절이 생겼는가**: T1 PR이 **테스트 0건으로 머지**됐고(사용자 승인 skip, "T2 직후 소급 작성"), T2에서 그 소급 테스트(`packages/core/src/contract.test.ts`)를 쓰려던 implementer가 멈춰 보고했다 — *"불법 조합 3개가 지금 타입에서 전부 유효해서, 쓸 수 있는 테스트가 '유효한 값은 유효하다'뿐이다(트리비얼 그린)."* 맞는 보고다. 아래 세 조합은 **전부 명세가 금지하는데 컴파일은 통과**한다.

| # | 불변식 (명세) | 지금 타입이 통과시키는 불법 조합 | 근거 |
|---|---|---|---|
| 1 | `offered === true` ⟺ `basis === 'signal_present'` | `{ offered: true, basis: 'undetermined' }` = **판정 실패인데 링크를 띄운다(fail-open)** | AC-058 · ADR-0005 · `contract.ts` `TicketOption` 주석 |
| 2 | 근거가 없으면 `decisionAuthority` 는 반드시 `'불명'` | `{ decisionAuthority: '확정', decisionAuthorityEvidence: null }` = **근거 없는 확정** | AC-050① / AC-064⑤ |
| 3 | 근거가 없으면 `authorityStatus` 는 반드시 `'불명'` | `{ authorityStatus: '확정', authorityEvidence: null }` = 같은 문제의 **C7쪽** | AC-064⑤ *"양쪽 모두"* |

세 줄 다 **주석으로만 존재하는 불변식**이었다. 주석은 테스트할 수 없다.

#### 결정 — ① 타입(판별 유니온) ② 생성자 1개씩 ③ 경계는 "거부"가 아니라 "복원"

```ts
// packages/core/src/rules/decision-authority.ts  — enum·판정 로직 단일 출처 (AC-064④)
export type DecisionAuthorityStatus = '확정' | '내부 승인 필요' | '검토 중' | '불명';   // (기존)
export type DecisionAuthorityJudged = Exclude<DecisionAuthorityStatus, '불명'>;         // 신규

/** 🔴 필드 이름이 **중립**이다 — `status`/`evidence` 는 어떤 응답 payload에도 나가지 않는다(AC-064③ grep 보호). */
export type AuthorityVerdict =
  | { status: DecisionAuthorityJudged; evidence: string }
  | { status: '불명';                  evidence: string | null };

/**
 * 🔴 불변식 2·3의 **유일한 통로**. 근거가 없으면 `'불명'` 으로 되돌린다(판정을 지어내지 않는다).
 * ⚠️ 아래는 **시그니처 표기**이며 `.ts` 에 본문 없이 그대로 쓰면 컴파일되지 않는다(F1-b Addendum A의 TS2391).
 * 본문은 한 줄이다:
 *   return evidence === null || status === '불명' ? { status: '불명', evidence } : { status, evidence };
 */
export function resolveAuthority(status: DecisionAuthorityStatus, evidence: string | null): AuthorityVerdict
```

```ts
// packages/core/src/contract.ts  — 🔒 Freeze Point 1
export type TicketOption =                                     // 불변식 1 (위 F1-a 코드 블록)
  | { offered: true;  basis: 'signal_present' }
  | { offered: false; basis: 'signal_absent' | 'undetermined' };

export interface TicketResultBase { sections: TicketSections; source: ResponseSource }
export type TicketAuthority =                                  // 불변식 2 — C6 이름
  | { decisionAuthority: DecisionAuthorityJudged; decisionAuthorityEvidence: string }
  | { decisionAuthority: '불명';                  decisionAuthorityEvidence: string | null };
export type TicketResult = TicketResultBase & TicketAuthority;

export interface DecisionItemBase { decision: string; owner: string | null; dueDate: string | null }
export type ItemAuthority =                                    // 불변식 3 — C7 이름
  | { authorityStatus: DecisionAuthorityJudged; authorityEvidence: string }
  | { authorityStatus: '불명';                  authorityEvidence: string | null };
export type DecisionItem = DecisionItemBase & ItemAuthority;
```

```ts
// packages/core/src/rules/ticket-gate.ts  — 신규 파일 (F1-c)
/**
 * 🔴 `TicketOption` 을 만드는 **유일한 통로**. `basis` 하나만 받아 `offered` 를 파생시킨다 — 짝을 손으로 쓰지 않는다.
 * ⚠️ 시그니처 표기다(본문 없는 선언을 `.ts` 에 그대로 쓰지 않는다 — TS2391). 본문은 한 줄이다:
 *   return basis === 'signal_present' ? { offered: true, basis } : { offered: false, basis };
 */
export function ticketOptionFrom(basis: TicketOptionBasis): TicketOption
```

🔴 **JSON 와이어 형식은 한 글자도 바뀌지 않는다** — 필드 이름·순서·값 어휘가 그대로이므로 **F2(`docs/API.md`)와 [FE]의 목 데이터는 영향받지 않는다.** 단, 목 데이터가 위 3개 불법 조합 중 하나를 쓰고 있었다면 그것은 이제 컴파일 오류이며, **그 목 데이터가 애초에 명세 위반**이었다는 뜻이다.

🔴 **C6·C7의 유니온을 하나로 공유하지 않고 일부러 두 벌 쓴다.** 이름만 다른 같은 모양을 제네릭 하나로 묶고 싶어지지만, **AC-064③의 판정 방법이 "두 이름이 각자의 경로에서만 나타나는지 grep"** 이다. 필드 이름을 타입 파라미터로 만들면 그 grep이 흐려진다 — 공유되는 것은 **enum과 판정 로직**(`resolveAuthority` 한 함수)이고, 나뉘는 것은 **필드 이름과 배치**뿐이라는 AC-064④/③의 분업을 그대로 코드에 옮긴 것이다.

#### 생성 지점의 형태 (T24·T26이 이대로 쓴다 — 임의 변형 금지)

TypeScript는 **두 변수의 상관관계를 추론하지 못한다**(correlated union). 그래서 `{ decisionAuthority: v.status, decisionAuthorityEvidence: v.evidence }` 를 그냥 쓰면 컴파일되지 않는다. **분기 한 번이 필요하며, 그 분기가 곧 불변식이 서는 자리다**:

```ts
const v = resolveAuthority(raw.status, raw.evidence);          // ← 판정 결과를 정규화 (rules 한 곳)
const authority: TicketAuthority =                             // C7이면 ItemAuthority + 다른 두 이름
  v.status === '불명'
    ? { decisionAuthority: '불명', decisionAuthorityEvidence: v.evidence }
    : { decisionAuthority: v.status, decisionAuthorityEvidence: v.evidence };
return { sections, ...authority, source };
```

#### 경계(zod)의 역할 — 거부가 아니라 복원

| 지점 | 하는 일 | 근거 |
|---|---|---|
| **LLM 응답 파싱**(`apps/web/lib/llm/openai.ts`, **T4**) | 모델 출력은 **느슨한 쌍**(`status` enum + `evidence: string \| null`)으로 파싱한다. 🔴 **불법 조합이 왔다고 요청 전체를 실패시키지 않는다** | Error Handling ④ *"부분 실패는 오류가 아니다"* · AC-041(폴백은 화면을 죽이지 않는다) |
| **정규화**(`resolveAuthority` / `ticketOptionFrom`, core) | 느슨한 쌍 → 계약 타입. 근거가 없으면 `'불명'`, 판정이 없으면 `undetermined` + `offered:false`(**fail-closed**) | Conventions 9 · AC-050① · AC-058 |
| **응답 재검증** | **두지 않는다 — N/A** | 검증 지점을 늘리면 같은 입력이 두 가지로 판정된다(DECISIONS #12). 생성자를 통과한 값은 이미 타입이 보증한다 |

🔴 **어떤 zod 스키마도 `TicketOption` 을 `z.object({ offered: z.boolean(), basis: z.enum([...]) })` 로 쓰지 않는다.** 그 스키마는 불법 조합을 그대로 통과시켜 타입의 보증을 되돌린다 — 계약 타입을 zod로 표현할 일이 생기면 `z.discriminatedUnion('offered', …)` 이다.

#### 이것으로 무엇이 검증 가능해지는가 (소급 테스트의 실체)

| 층 | 파일 | 무엇을 주장하는가 | red / green을 어디서 얻는가 |
|---|---|---|---|
| **타입** | `packages/core/src/contract.test.ts` | 불법 조합 3개가 **컴파일되지 않는다** — 각 조합 위에 `// @ts-expect-error` | `npm run typecheck`. **DU 적용 전에는 "미사용 `@ts-expect-error` 지시어"(TS2578)로 실패**하고, 적용 후 통과한다 — 이것이 첨부할 red/green 쌍이다(DoD Gate "red 출력을 green 옆에 첨부") |
| **런타임** | `rules/ticket-gate.test.ts` · `rules/decision-authority.test.ts` | `ticketOptionFrom('undetermined')` → `{ offered: false, … }`(fail-closed) · `resolveAuthority('확정', null)` → `{ status: '불명', … }` | `npm test`(Vitest). 함수가 없는 상태에서 먼저 실패시키고(red) 구현 후 통과(green) |
| **경계** | (T4 범위) | 느슨한 LLM 출력이 정규화를 거쳐 계약 타입이 된다 | T4의 테스트. **지금은 만들지 않는다** — 존재하지 않는 코드에 의존하면 소급 테스트가 또 막힌다 |

⚠️ **`contract.test.ts` 에는 런타임 `test()` 가 최소 1개 있어야 한다** — 타입 단언만 있는 파일은 Vitest가 *"No test suite found"* 로 실패시킨다. `@ts-expect-error` 단언을 `test()` 본문 안에 넣고 값에 대한 사소한 런타임 확인을 함께 두는 형태로 쓴다. 🔴 **그 런타임 확인이 이 파일의 주장이 아니다** — 이 파일이 지키는 것은 타입이며, 근거는 `npm run typecheck` 출력이다(`docs/CodingRules.md` Tests의 *"structural과 semantic은 다른 주장"* 과 같은 계열의 구분).

**`@ts-expect-error` 가 실제로 검사되는지 확인됨(measured, 2026-08-04)**: `packages/core/tsconfig.json` 의 `"include": ["src"]`(:6)가 `src` 아래 **`*.test.ts` 를 포함**하고, `packages/core/package.json:9` 의 `tsc --noEmit -p tsconfig.json` 이 루트 `npm run typecheck`(`package.json:14`)에 물려 있다. 즉 타입 테스트는 CI가 이미 돌리는 게이트에서 red/green이 난다 — 새 러너·새 설정이 필요 없다.

#### 왜 (a) 판별 유니온인가 — 기각한 대안

| Option | Pros | Cons |
|---|---|---|
| **판별 유니온 + 생성자** ✅ | 불법 상태가 **표현 불가능**해진다. 지금 적용 비용이 사실상 0이다(아래 measured). 소급 테스트가 **오늘** 가능해진다 | 생성 지점에서 분기 한 번을 강제한다(위 코드). 계약 타입 3개가 `interface` → `type` 이 된다 |
| 런타임 validator만(zod, 경계) | 실제 데이터를 막는다 | 🔴 **그 스키마가 아직 없다**(T4 이후) — 소급 테스트가 다시 막힌다. 게다가 올바른 경계 정책은 *거부*가 아니라 *복원*이라(위 표), 경계는 불변식을 **증명하는** 자리가 아니라 **복구하는** 자리다. 타입이 열려 있으면 복원을 빠뜨린 코드가 그대로 컴파일된다 |
| 주석·리뷰 규칙으로 유지 | 변경 0 | 🔴 지금 상태다. **테스트가 존재할 수 없다** — 소급 테스트 지시의 답이 되지 않는다 |
| `assert` 함수를 core 곳곳에 | 런타임에 잡힌다 | 🔴 던지는 위치가 흩어져 *"예외는 `withApi()` 한 곳"*(Error Handling)이 무너지고, 부분 실패를 오류로 승격시킨다 |

#### 지금 적용해야 하는 이유 (측정된 비용)

**현재 이 3개 타입을 *생성*하는 코드는 리포에 0줄이다**(measured, 2026-08-04 grep `ticketOption|decisionAuthority|authorityStatus|TicketOption|TicketResult|DecisionItem` — 히트는 `contract.ts` 선언부와 `llm/client.ts` 주석 1줄뿐이며, `steps/c6.ts:1-3` 등은 `export {}` 스텁이다). **소비처가 0인 지금이 F1 변경 비용의 최저점**이며, T24(C6)·T25(FE)·T26(C7)이 붙는 순간 매일 비싸진다.

⚠️ **architect는 `tsc` 를 실행하지 않았다(셸 없음) — 위 "T1 산출물을 깨지 않는다"는 grep 기반 추론이다.** 확인 수단: implementer가 반영 직후 `npm run typecheck` 와 `npm test` 출력을 첨부한다. **사전 승인된 대체 인코딩**: 만약 `Base & (A | B)` 교차형에서 `v.status === '불명'` 판별 narrowing이 기대대로 동작하지 않으면, **`TicketResultBase`/`DecisionItemBase` 를 각 유니온 멤버에 펼쳐 넣은 완전한 두 interface의 union**으로 바꿔도 된다(의미 동일, 중복만 늘어남). 이 대체는 **이미 승인된 것으로 취급**하며 architect 재호출이 필요 없다 — 다만 어느 쪽을 썼는지 보고에 적는다.

#### 소유 태스크

| 무엇을 | 누가 | 비고 |
|---|---|---|
| `contract.ts` 3개 유니온 + `rules/ticket-gate.ts` + `resolveAuthority` + 테스트 3파일 | **현 T2 브랜치의 소급 작업**(F1 수정이므로 T1 산출물에 대한 후속) | 이 절이 그 착수 근거다 |
| `resolveAuthority` 를 쓰는 **판정 로직 본체**(텍스트 → status) | **T24**, 재사용은 **T26** | AC-064④ — 별도 파이프라인 금지 |
| 느슨한 LLM 출력 파싱 + 정규화 호출 | **T4**(`apps/web/lib/llm/openai.ts`) | ⚠️ `docs/Tasks.md` 는 planner 소유라 architect가 고치지 않는다. **이 문서의 결론은 "T4가 소유해야 한다"** 이며(근거: `docs/Tasks.md:32` T4 = OpenAI 호출 백엔드 프록시 = LLM 응답 경계), 태스크 문구 반영 여부는 planner 판단이다 |
| `ticketOptionFrom` 호출 위치(파이프라인 어디서 게이트를 산출하는가) | **T10 / T28** | ADR-0005 Follow-up 2가 이미 지정했다. F1-c는 *어디서 세우는가*를 바꾸지 않고 *무엇으로 세우는가*(생성자 1개)만 고정한다 |

---

### F1-d — 기준일(`referenceDate`)이 들어오는 자리 (DECISIONS #46 · ADR-0008)

UX-004(UF-003) / AC-049(날짜 정규화) · AC-006(보존)

```ts
// packages/core/src/pipeline.ts — 🔒 Freeze Point F1
export interface MediationDeps {
  llm: LLMClient;
  data: MediationData;
  referenceDate: string;   // 🔴 F1-d — ISO `YYYY-MM-DD`. 호출자가 만든다
}
```

**왜 이 절이 생겼는가**: C2 스텝은 기준일을 **요구**하는데(`packages/core/src/steps/c2.ts:61` `RunToneTransformInput.referenceDate`) F1 계약에 그 값이 들어올 자리가 없었다. 현재는 Route Handler가 인라인으로 만든다(`apps/web/app/api/mediate/route.ts:122` — `new Date().toISOString().slice(0,10)`, measured). **T28이 `run(input, deps)` 를 조립하는 순간 그 값의 출처가 미정이 된다** — 명시하지 않으면 사람마다 다르게 구현한다(F1-b가 사전을 두고 겪은 것과 같은 공백이다).

| 항목 | 결정 |
|---|---|
| 자리 | **`deps` 최상위**(위 판정표 신규 행). `MediationInput` 은 **4필드 그대로** |
| 형태 | 🔴 **인터페이스가 아니라 값**(`string`). `Clock { today(): string }` 을 기각한 이유는 **한 요청 안에서 날짜가 바뀔 수 있기 때문**이다(자정 경계) — 그러면 같은 요청의 cacheKey가 스텝마다 갈린다. 값이면 결정성이 구조적으로 보장된다 |
| 만드는 곳 | **Route Handler.** 🔴 **`packages/core` 안에 `new Date()`/`Date.now()` 가 생기는 diff는 반려**한다(core는 부수효과를 만들지 않는다) |
| T28의 할 일 | `deps.referenceDate` 를 **그대로** C2에 전달한다. 스텝 시그니처(`c2.ts:61`)는 바꾸지 않는다 |
| 기준 시각 | 🔴 **MVP는 UTC 유지.** 발신자 로컬로 바꾸지 않는다 — 아래 한계 참조 |

**남는 한계를 숨기지 않는다.** payload에 실리는 것은 **연도뿐이므로**(`packages/core/src/prompts/c2.ts:53`·`:65`, `:173` `referenceDate.slice(0,4)`) 틀리는 것은 *"UTC 날짜와 발신자 로컬 날짜의 **연도**가 다른 순간"* 뿐이다:

| 발신자 | 오차 구간 | 크기 | MVP 기간(08-04~08-21) |
|---|---|---|---|
| KST/JST(UTC+9) | 1월 1일 00:00~09:00 로컬 | 9시간 / 년 | **0** |
| US 서부(UTC−8) | 12월 31일 16:00~24:00 로컬 | 8시간 / 년 | **0** |

**발신자 로컬 기준을 채택하지 않은 이유**: `MediationInput` 어디에도 발신자 타임존이 없다(measured — `packages/core/src/contract.ts:141~213`. 타임존은 `RecipientContext.timezone` 하나뿐이고 그것도 *"사용자가 확정해야 채워진다 … 미확정이면 `null`"*). 브라우저 타임존을 추측해 채우면 **Conventions 9**("없는 값을 지어내지 않는다") 위반이고, 필드를 신설하면 **PRD에 없는 요구사항 추가**(AGENTS.md 금지)다. 두 금지를 동시에 지키는 선택지는 *"UTC 유지 + 한계 명시"* 하나뿐이다. **재검토 조건**은 실사용자 확장(Planning Decision #27) 또는 연말 구간 시연이며, 그때는 PRD/UX 레벨에서 발신자 타임존을 먼저 정해야 한다.

---

### F1-e — 스텝별 출처(`stepSources`) (DECISIONS #48 · ADR-0009)

UX-004(UF-003) · UX-016(UF-011/012/014/015) / **AC-041**(폴백 표시) · **AC-001·AC-002**(역번역 안전장치)

```ts
// packages/core/src/contract.ts  — 🔒 Freeze Point 1
export interface StepSources {
  c1: ResponseSource;   // 산출물: urgency(판정분) · urgencyReason
  c2: ResponseSource;   // 산출물: transformed · reason · preserved[] · misreadRisks[]
  c4: ResponseSource;   // 산출물: backTranslation
}

export interface MediationResult {
  /* …12개 필드 그대로… */
  source: ResponseSource;        // 화면 레벨 단일 배지 (기존 필드 — 유지)
  stepSources: StepSources;      // 🔴 13번째 필드
}
```

**불변식(F1-c와 달리 타입으로 강제하지 않는다)**: `source` = `stepSources` 세 값 중 **가장 신뢰도가 낮은 것**(`fallback` > `cache` > `live`). 판별 유니온으로 쓰면 3³ = 27조합이 되어 지키려는 것보다 큰 사고 표면이 생긴다 — F1-c의 기법은 *짝* 제약에만 통한다. 대신 **파생 함수 하나**(아래 이월 표 #2)와 그 테스트가 근거가 된다.

**소비 매핑 — 배지를 어디에 붙이는가**

| 값 | 판정 대상 | 화면 영역 (현재 컴포넌트) | 근거 |
|---|---|---|---|
| `stepSources.c1` | `urgency`(판정분)·`urgencyReason` | 긴급도 패널(`UrgencyPanel.tsx`) | AC-041 + `docs/UX.md` Interaction Patterns(:920) *"near the result"* |
| `stepSources.c2` | `transformed`·`reason`·`preserved[]`·`misreadRisks[]` | 비교 뷰(`ComparisonView.tsx`) | 동일 |
| `stepSources.c4` | `backTranslation` | 역번역 프리뷰(`BackTranslationPreview.tsx`) | 동일 |
| `source`(기존) | 응답 전체 | 화면 레벨 1개 | `docs/UX.md` UX-004 States "Fallback" |

🔴 **이 표는 계약이 무엇을 가능하게 하는지를 적은 것이며, 최종 시각 표현(배지를 3개 다 띄울지, 화면 레벨 1개 + 문제 영역만 띄울지)은 ux-design 소관이다.** architect가 고정하는 것은 *"어느 값이 어느 영역의 진실인가"* 까지다.

**이 필드를 만든 근거 3가지 (전부 measured — architect가 2026-08-05 직접 열람)**

1. **출처는 스텝마다 따로 결정된다.** `apps/web/lib/llm/openai.ts` 의 `complete()` 안에서 `:253`(cache)·`:323`(live)·`:335`(fallback)가 판정되고, 이 함수는 C1·C2·C4마다 **한 번씩** 호출된다(`route.ts:96`·`:118`·`:131`). 스텝 자신도 스키마 검증 실패 시 폴백으로 강등한다(`steps/c1.ts:92`·`c2.ts:172`·`c4.ts:102`). **부분 폴백은 가설이 아니라 코드 경로다** — 요청 상한 판정(`openai.ts:261~281`)도 호출마다 이뤄지므로 한 요청의 C1과 C2 사이에서 상한이 넘어갈 수 있다.
2. **오표시가 양방향으로 실재한다.** `combineSource`(`route.ts:82`)가 "가장 신뢰도 낮은 쪽이 이긴다"로 합치므로 ⓐ C2 live + C4 fallback → **라이브 변환문에 폴백 배지**, ⓑ C2 fallback + C4 live → **통조림 변환문에 배지 없음**. 2026-08-05 라운드에서 `ComparisonView.tsx` 배지가 ⓐ 때문에 원복됐고(reviewer 2라운드 확인), 그 원복이 남긴 Open Question이 이 절이다.
3. 🔴 **가장 큰 손실은 배지가 아니라 AC-001/AC-002다.** 폴백 c4 문구는 **폴백 c2 문구를 역번역해 작성된 고정 문자열**이다(`packages/core/src/data/fallback-responses.ts:58~62`·`:96~100`). 따라서 C2 live + C4 fallback이면 `backTranslation` 은 화면에 보이는 `transformed` 의 역번역이 **아니며**, "큰 오역을 걸러내는 1차 안전장치"가 조용히 무력화된다. 세 값이 함께 폴백일 때만 성립하도록 통일해 둔 것(같은 파일 `:38~44`)이 부분 폴백에서 깨진다.

**"단일 `source` 유지 + 구분 불가를 제약으로 문서화"를 택하지 않은 이유**: 그 안은 AC-041의 요구를 *배지가 뜬다*로만 읽는다(그 최소 요구는 지금도 충족된다 — QA 확인). 그러나 근거 3이 보여주듯 문제는 표시가 아니라 **정확성**이고, "어느 영역이 통조림인지 모른다"를 제약으로 확정하면 UX.md:920의 *near the result* 를 영구히 지킬 수 없다고 선언하는 셈이 된다. 비용도 근거가 되지 못한다 — `route.ts:135` 가 **이미 세 값을 손에 들고 있고** 합치기만 한다.

**보안 체크리스트 재실행(이 패스)**: 신규 의존성 0 · 신규 환경변수 0 · 신규 엔드포인트/포트 0 · `stepSources` 는 **enum 3값 × 3**이라 사용자 콘텐츠·개인정보를 담지 않는다 · 저장·로그 대상 아님(`POST /api/mediate` 는 저장하지 않으며 구조화 로그 필드 목록은 DECISIONS #27 불변) · **abuse case 없음**(응답을 만든 쪽의 신뢰도를 낮게 말하는 방향으로만 쓰이며, 높게 위장하는 조합은 불변식이 금지한다). Security 절의 어떤 행도 이 패스로 바뀌지 않는다.

**이월 — 이 커밋은 계약만 확정한다(코드 채우기는 implementer 다음 라운드)**

| # | 항목 | 담당 | 근거 위치 |
|---|---|---|---|
| 1 | `route.ts` 가 `stepSources: { c1: classification.source, c2: toneSource, c4: backTranslationSource }` 를 채운다 | implementer | `route.ts:135` 가 이미 세 값을 갖고 있다 |
| 2 | `combineSource` 의 규칙(`fallback` > `cache` > `live`)을 **파생 함수 한 곳**으로 옮긴다 — 웹·확장이 각자 다시 구현하지 않도록 `packages/core/src/rules/` 가 자연스러운 자리다(architect 권고, 파일명은 implementer 재량) | implementer | `route.ts:81~84` |
| 3 | `ComparisonView.tsx:33~39` 의 **Open Question 주석을 이 절 참조로 갱신**하고 배지를 `stepSources.c2` 기준으로 되살린다. `SenderPanel.tsx:119~122` 의 원복 사유 주석도 같이 갱신 | implementer | 원복 이력이 그 주석에 있다 |
| 4 | `BackTranslationPreview` 의 배지 입력을 `source` → `stepSources.c4` 로 바꾼다 | implementer | `BackTranslationPreview.tsx:53` |
| 5 | 🔴 **필수 프로퍼티가 늘어 컴파일이 깨지는 지점**(추정 — TypeScript 필수 프로퍼티 규칙에 따른 예상. 확인 방법: `npm run typecheck`): `apps/web/app/api/mediate/route.ts:145` · `apps/web/components/SenderPanel.test.tsx:109`·`:140`·`:175`·`:213` · `apps/web/components/MediationWorkspace.test.tsx:24` 인근 `mediateSuccessResponse` | implementer | grep 결과 |
| 6 | `apps/web/app/api/mediate/route.test.ts:146~170` 의 **"12개 필드" 키 집합 단언을 13개로** 갱신(테스트 이름 포함) | implementer | 해당 테스트가 정확한 키 집합을 단언한다 |
| 7 | 배지 표현(3개 병렬 vs 화면 레벨 1개 + 문제 영역)을 UX-004 States/Interaction Patterns에 확정 | ux-design (선택) | 위 소비 매핑 표의 🔴 |

---

### F4 — 층 2 어댑터 계약 (`registry.ts`)

```ts
// apps/extension/src/layer1/registry.ts  — 🔒 Freeze Point F4
// (파일 안의 라벨도 "F4" 로 쓴다 — 위 동결 지점 표의 번호가 단일 출처다)
export interface Layer2Adapter {
  id: 'github' | 'slack' | 'gmail';
  matches(url: URL): boolean;            // origin/path 판정만
  findInput(): HTMLElement | null;       // 입력창 DOM 노드
  insert(el: HTMLElement, text: string): boolean;  // 삽입만. 🔴 전송 버튼 클릭 코드 없음 (AC-040)
}
```

층 1은 `adapters.find(a => a.matches(url))` 결과가 있을 때만 "입력창에 삽입" 버튼을 렌더한다. 없으면 **렌더하지 않는다**(비활성 버튼 금지 — AC-053②). `layer2/index.ts` 가 빈 배열이어도 층 1 전체 경로가 동작한다 = AC-053③.

---

## Data Flow

### 1) 웹앱 중재 (UF-003 / UX-004) — 주 경로

```
[UX-004] 작성 → "Run Mediation"
   │  POST /api/mediate  { text, recipient?, context }
   ▼
withApi(): 세션 확인 → zod 입력 검증 → rate limit 확인 (AC-041)
   ▼
🔴 조회는 여기서 끝난다 — dictionary_terms · profile_learned_items 를 읽어 deps.data 를 만든다 (F1-b)
   ▼
core/pipeline.run(input, deps)                         ← 순서 고정 (AC-032)
   ① C1 분류 ─────────────────────────────────────► urgency + reason
   ②  CRITICAL 이면 예약·지연 경로를 건너뛰고 톤 정제만 (AC-005)
   ③ C3 프로필 조회  ← profiles / profile_learned_items
        └ 프로필이 비었으면(skipped) **건너뛴다. 추측 기본값을 넣지 않는다** (AC-059②③)
        └ 존댓말 레벨(en-ko)의 결정 규칙은 아래 **1-a** 가 단일 출처다
   ④ 쌍방 규약 조회  ← pair_protocols   (4축 한정 — 충돌 시 규약 우선, Planning Decision #26)
        └ 🔴 **4축 = 직설 허용 / 이모지 / 호칭 / 마감 표현.** 존댓말 레벨은 이 4축에 없으므로
          규약 우선 규칙이 적용되지 않는다 — 근거와 판정은 **1-a**(DECISIONS #39 · ADR-0007)
   ⑤ C5 용어사전 주입 ← deps.data.dictionary (프롬프트에 주입, 별도 LLM 호출 아님 · F1-b)
        └ core가 조회하지 않는다 — 위에서 이미 조회된 것을 인자로 받는다 (AC-028)
   ⑥ C2 톤 변환 ─── 🔴 한 번의 LLM 호출로 transformed / preserved / warnings /
                        misreadRisks / holidayConflicts 를 **함께** 산출
                        (추가 호출 금지 — NFR 체감 5초 + Decision #29)
   ⑦ C4 역번역 ────────────────────────────────────► backTranslation
   ⑧ 감정 신호가 있으면 C6 티켓 링크를 "제시만" (AC-058 — 항상 제시/항상 미제시 금지)
        └ 판정은 ticketOption { offered, basis } 로 나간다 (F1-a). 점수·라벨을 만들지 않는다
   ▼
응답 → [UX-004] 비교 뷰 렌더 (승인 전)
   ▼
사용자 "Approve & Send"  ← 🔴 이 클릭 없이 실행되는 저장/발송 경로가 코드에 존재하지 않는다 (AC-010)
   │  POST /api/messages
   ▼
sent_messages 1행 (mock-send) + diff_records 1행 (AI 제안문 vs 최종문, AC-012)
```

### 1-a) 존댓말 레벨 결정 규칙 (EN→KO, AC-046) — 이 절이 단일 출처다

**소비처**: UX-004(2패널 중재) · UX-016(층 1 패널) · UX-009(프로필 표시) / **구현 위치**: `packages/core/src/steps/c2.ts` · `packages/core/src/prompts/c2.ts` / **태스크**: T10 · T11
**배경**: T10 리뷰에서 발견된 명세 모순 2건에 대한 판정이다(DECISIONS **#39**·**#40**, ADR-0007). implementer·reviewer는 이 표만 읽으면 된다.

#### 판정표 (이 표에 없는 케이스는 임의 판단하지 말고 architect에게 되돌린다)

| # | 입력 상태 | 프롬프트에 실리는 것 | 근거 |
|---|---|---|---|
| 1 | `languageDirection === 'ko-en'` | 존댓말 레벨을 **싣지 않는다** | 영어 출력에 합쇼체/해요체 구분이 없다 |
| 2 | `sender.profile.honorificLevel === 'hapsyo' \| 'haeyo'` | **그 값**을 명시 지정 | AC-046 ② 프로필 절 |
| 3 | `sender.profile.honorificLevel === null` (미응답·`skipped`·`not_started`) | 🔴 **레벨을 지정하지 않는다.** "한 메시지 안에서 하나의 종결어미 레벨을 끝까지 유지하라"는 **일관성 지시만** 싣는다 | AC-046 ① 은 개인화와 무관하게 항상 요구되고, AC-059 ②③ 은 빈 프로필에 값을 채우는 것을 금지한다. **둘을 동시에 만족하는 유일한 형태가 "레벨 미지정 + 일관성 요구"** 다 |
| 4 | 해당 상대에게 쌍방 규약(`PairProtocol`)이 있다 | **행 2·3의 결과가 그대로 유지된다** — 규약은 존댓말 레벨에 관여하지 않는다 | 아래 "AC-046 ②의 규약 절" 참조 |
| 5 | 출력에 레벨 혼용이 실제로 발생 | `warnings[]` 에 `honorificLevelMixed` (AC-046 ③) | 행 1~4와 독립. 어느 행에서도 검사한다 |

#### 🔴 행 3 — 빈 프로필에 기본 레벨을 지정하지 않는 이유 (DECISIONS #40)

기각한 대안은 **"프로필이 비면 `haeyo`(해요체)를 기본값으로 지정한다"** 이다. AC-046 ①만 보면 성립하지만 셋이 걸린다.

1. **명세 문장과 어긋난다.** `docs/UX.md` UX-004 Business Rules(:430): *"C3 profile lookup (**skipped entirely if the sender's profile is empty/skipped, AC-059③ — never substituted with guessed defaults**)"*. 이 문서 Data Flow ③ 도 같은 문장을 쓴다. 값을 지정하는 순간 "건너뛴다"가 사실이 아니게 된다.
2. 🔴 **캐시 키가 두 상태를 구분하지 못한다.** cacheKey는 `canonicalJSON(payload)` 를 포함한다(Data Flow 2). 기본값을 채우면 **"프로필 비어 있음"과 "프로필=해요체"의 payload가 완전히 같아져** 같은 키가 되고, 로그·테스트 출력·캐시 어디에서도 두 경우를 구분할 수 없다. 이것은 F1-a가 `signal_absent`/`undetermined` 를 분리하고 AC-063 ②가 "화면은 같아도 내부 상태는 구분"을 요구한 것과 **정확히 같은 문제**다.
3. **판정 근거가 없다.** 해요체를 고른 근거는 implementer 스스로 "측정되지 않음(추정)"이라고 적었고, `docs/TestCases.md` AC-046 10건의 판정 절차는 *"프로필=합쇼체 / 프로필=해요체 두 조건으로 실행"* 이라 **빈 프로필 케이스가 0건**이다(measured — `docs/TestCases.md:125`). 즉 이 기본값은 어떤 AC도 요구하지 않고 어떤 케이스도 검증하지 않는다. Conventions 9("없는 값을 지어내지 않는다")의 대상이다.

**행 3이 AC-046 ①을 어떻게 만족하는가**: AC-046 ①이 요구하는 것은 *"한 메시지 안의 혼용 0건"* 이지 *"특정 레벨"* 이 아니다. 프롬프트가 레벨을 고르지 않아도 "하나를 골라 끝까지 유지하라"는 지시로 충족된다. 메시지 **간** 레벨이 달라지는 것은 AC-046이 금지하지 않는다.
**대가(숨기지 않는다)**: 빈 프로필 사용자의 출력 레지스터가 호출마다 달라질 수 있다. 일관된 레지스터가 필요하면 그것은 **온보딩을 완료하는 것**(AC-059 ④, UX-009의 "온보딩 완료하기")이지 시스템이 대신 고르는 것이 아니다.

#### 🔴 AC-046 ②의 규약 절 — MVP 구현 대상에서 제외 (DECISIONS #39 · ADR-0007)

AC-046 ②는 *"해당 상대에 대한 #24 쌍방 규약이 있으면 **규약 값이 우선**"* 을 요구한다. **그 값을 담을 자리가 규약에 없다**(measured 2026-08-05 — `docs/Database.md` `pair_protocols` 컬럼 목록 · `packages/core/src/contract.ts` `PairProtocol` · `docs/API.md` `PUT /api/protocol` Request 전부에서 "honorific"·"존댓말" 매치 0건).

- **축을 5개로 늘리지 않는다.** 4축은 **AC-037이 열거**했고 `docs/UX.md` UX-011도 *"the 4 items"* 로 고정했다. 축을 늘리는 것은 AC-037의 정의를 바꾸는 일이라 **planner 소관**이며 architect가 단독으로 할 수 없다(AGENTS.md — "No agent invents requirements").
- **기존 축 재해석도 하지 않는다.** `address_form`(호칭)은 *2인칭 호칭 표기*(`김 대리님` / `Sujin Kim` — AC-047, UX-010)이고 존댓말 레벨은 *종결어미 레지스터*다. 겹쳐 담으면 한 컬럼이 두 의미를 갖고, AC-083 ①의 대조 축(*호칭 ↔ 실제 호명 방식*)이 무엇을 비교하는지 판정 불가가 된다.
- **판정 수단도 없다.** `docs/TestCases.md` AC-046 10건에 규약 조건 케이스가 **0건**이다(measured, :125). 지금 구현해도 통과를 증명할 케이스가 없다.

**따라서 AC-046은 ①(혼용 0건) + ②의 프로필 절 + ③(경고)로 종결 가능하며, ②의 규약 절만 미구현으로 남는다.** 이 사실은 T10 완료 보고에 명시한다 — 조용히 통과시키면 AC-034 계열("없는 것을 있는 것처럼")이 된다.
**재논의 시점**: T41·T42(규약 UI) 착수 시. 그때도 architect가 아니라 **planner가 AC-037/AC-046 ②의 정합을 먼저 결정**해야 한다(ADR-0007 Follow-up).

---

### 2) LLM 호출 3단 해석 (AC-041 — Decision #29가 architect에게 넘긴 설계)

```
core/steps/*  →  LLMClient.complete(step, promptVersion, payload)
                      │
                      ▼
        cacheKey = sha256(model ∥ promptVersion ∥ step ∥ canonicalJSON(payload))
                      │
        ┌─────────────┼──────────────────────────────┐
        ▼             ▼                              ▼
 ① llm_cache 적중   ② 미적중 → OpenAI 호출        ③ 실패 / 상한 초과 / 크레딧 소진
    source:'cache'     성공 시 llm_cache 저장          data/fallback-responses.ts 조회
    LLM 호출 0건       source:'live'                   → cacheKey 일치분 우선, 없으면 시나리오 기본값
                                                       source:'fallback'  🔴 화면에 "폴백 응답 사용 중" 표시
```

| 설계 항목 | 결정 | 이유 |
|---|---|---|
| **캐시 키** | `sha256(model ∥ promptVersion ∥ step ∥ canonicalJSON(정규화된 입력))`. 정규화 = 앞뒤 공백 제거 + 개행 통일. **user_id를 키에 넣지 않는다** | 데모 시연에서 **같은 원문을 여러 번 실행**하는 것이 정상 동작이다(리허설 T35, 발표 T37). user_id를 넣으면 계정을 바꾼 순간 캐시가 통째로 무효가 되어 발표 직전에 크레딧을 태운다. 대신 개인화 값(프로필·규약)은 payload에 들어가므로 **내용이 다르면 키도 다르다** |
| **저장 위치** | **Postgres `llm_cache` 테이블** | Vercel Function은 호출마다 프로세스가 다를 수 있어 **인메모리 LRU는 발표 중 적중하지 않는다.** Vercel KV를 쓰면 무료 티어 한도가 하나 더 늘어난다 — 이미 있는 Postgres가 가장 싸다 |
| **요청 상한** | `llm_call_log` 를 세어 **① 사용자·일 단위** `MAX_LLM_CALLS_PER_USER_PER_DAY` **② 전역·일 단위** `MAX_LLM_CALLS_GLOBAL_PER_DAY` 두 겹 | 사용자 단위만 두면 심사위원 계정이 여러 개일 때 전역 크레딧이 그대로 소진된다 |
| **폴백 경로** | `packages/core/src/data/fallback-responses.ts` — 리포 내 정적 데이터. `docs/TestCases.md`·`docs/DemoScript.md` 의 시연 입력에 대응하는 응답을 **동일 cacheKey 로 미리 계산해** 담는다 | 발표 중 크레딧이 소진돼도 **대본에 있는 장면은 정상 동작한다.** 대본 밖 입력은 시나리오 기본값 + 폴백 배지 |
| **폴백 표시** | **화면 레벨**은 `MediationResult.source`(합쳐진 값)를, **영역별**은 `MediationResult.stepSources.{c1,c2,c4}` 를 읽는다(2026-08-05 F1-e · DECISIONS #48) | AC-041 "폴백 중임을 화면에 표시(실제 LLM 결과인 것처럼 보이지 않게)" + `docs/UX.md` Interaction Patterns(:920) *"near the result"*. 🔴 이 표의 ①②③ 판정이 **스텝마다 따로** 일어나므로 합쳐진 한 값으로는 어느 영역이 통조림인지 말할 수 없다 — 근거는 F1-e 절 |

### 3) 확장 층 1 (UF-015 / UX-016)

```
임의 페이지에서 드래그 → mouseup → window.getSelection()
   ▼ (🔴 사이트 식별 분기 없음 — 층 1의 정의, Planning Decision #61)
플로팅 버튼 → 패널 열기 (선택 텍스트가 입력에 채워진 상태)
   ▼ POST /api/mediate   Authorization: Bearer <access token>
   ▼ (웹앱과 **완전히 같은** 엔드포인트·같은 core — 확장 전용 엔진 없음, T56)
결과 패널 → 승인
   ├─ 항상: 클립보드 복사                      ← 기본 전달 경로 (Planning Decision #63)
   └─ registry에 현재 origin의 층 2가 있을 때만: "입력창에 삽입"
        └ insert() 만 실행. 🔴 전송 버튼 자동 클릭 코드 경로가 존재하지 않는다 (AC-040)
```

### 4) 관측 표본 — 수동 표시 경로 (P2, AC-080/081)

```
드래그 선택 → "상대가 쓴 것으로 표시" → 상대 식별자 입력(수동)
   ▼
🔴 콘텐츠 스크립트 안에서 core/observation/indicators.ts 로 **집계값만 계산**
   (원문은 계산 직후 폐기 — 어떤 요청 payload에도 들어가지 않는다, AC-081①③)
   ▼ POST /api/samples  { counterpart, source:'manual', indicatorDeltas, collectedAt }
observation_samples 1행  ← 🔴 원문 컬럼이 스키마에 존재하지 않는다 (AC-081②)
```

**같은 `indicators.ts` 를 GitHub 경로(서버측 T64)도 import 한다** — 지표 정의가 경로별로 갈리지 않는다(AC-080④). 이것이 `packages/core` 를 별도 패키지로 만든 두 번째 이유다(첫 번째는 AC-028).

### 5) 확장 인증 (설계 신규 — Open Question으로도 보고)

Supabase 세션 쿠키는 `SameSite=Lax` 라 **확장의 교차 사이트 요청에 실려 가지 않는다**(추정 — 확인 수단: T56 착수 시 네트워크 탭에서 쿠키 헤더 유무 관찰). 따라서:

```
확장 패널 "로그인" → 웹앱 /extension/connect 탭 열기 (우리 origin)
   → 그 페이지가 chrome.runtime.sendMessage 로 access token 전달
     (manifest externally_connectable 을 **우리 앱 origin 1개로만** 제한)
   → 확장은 chrome.storage.session 에 보관 (디스크 아님)
   → 이후 모든 /api/* 호출에 Authorization: Bearer
```

API 라우트는 **쿠키 세션 또는 Bearer** 둘 다 수용한다(`apps/web/lib/auth.ts` 한 곳에서 분기). 기각한 대안: 층 1 패널을 우리 origin의 iframe으로 띄워 쿠키를 1st-party로 쓰는 안 — 대상 사이트의 `frame-src` CSP가 막을 수 있고, 그것이 정확히 AC-052가 걱정하는 실패 모드다.

---

## Security

Outcome of architect's Security Design Checklist (see .claude/agents/architect.md). Every row gets a decision or an explicit "N/A — reason" — never blank.

| Item | Decision |
|---|---|
| Authentication / Authorization | **Supabase Auth (이메일+비밀번호)** — Planning Decision #30이 architect에게 넘긴 판단. 세션은 `@supabase/ssr` 의 HttpOnly 쿠키, 확장은 Bearer 토큰(위 "확장 인증"). **인가는 Postgres RLS로 DB 레벨에서 강제**한다 — 모든 사용자 데이터 테이블에 `<소유자 컬럼> = auth.uid()` 정책. 🔴 **2026-08-05 정정(DECISIONS #47)**: 소유자 컬럼 이름은 **한 가지가 아니라 두 가지**다 — `user_id`(`profiles`·`profile_learned_items`·`diff_records`·`sent_messages`) / `owner_user_id`(`dictionary_terms`·`recipient_enrichments`·`observation_samples`). 이 문단은 앞서 전부 `owner_user_id` 인 것처럼 적고 있었으나 `docs/Database.md` Schema·Indexes 절과 적용된 마이그레이션이 그렇지 않다. **정확한 표는 `docs/Database.md` RLS 절이 단일 출처다.** AC-039("다른 사용자 데이터가 조회되지 않는다")를 애플리케이션 코드의 `where` 절에 맡기지 않는 것이 이 결정의 핵심이다(빠뜨린 `where` 하나가 곧 유출이다). **비밀번호 정책은 최소 8자, 추가 복잡도 규칙 없음**(AC-060/Planning Decision #86) — Supabase의 최소 길이 설정을 8로 두고 **문자 요구사항은 켜지 않는다.** 앱 코드에 중복 검증을 만들지 않는다(#86의 지시). ⚠️ Supabase 최소 길이가 대시보드에서 8로 설정 가능한지는 **추정** — 확인 수단: T45 착수 시 Auth 설정 화면 확인 + `aaaaaaaa` 가입 1건 실행 |
| Secrets & configuration | 전부 환경변수. **신규 변수 5개**: `OPENAI_API_KEY`(서버 전용), `OPENAI_MODEL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`(서버 전용). **`NEXT_PUBLIC_` 접두사가 없는 변수는 클라이언트 번들에 들어가지 않는다** — 이것이 AC-030(키 프론트 미노출)의 강제 수단이다. `SUPABASE_SERVICE_ROLE_KEY` 는 **RLS를 우회하므로 `apps/web/lib/supabase/server.ts` 의 `createServiceClient()` 한 함수에서만** 생성하고, 그 함수를 쓰는 곳은 `llm_cache`·`llm_call_log` 접근 2곳으로 제한한다. T3에서 `.env.example` 과 README 설정 표를 **동일 항목**으로 맞춘다(AC-031). `.env` 는 훅으로 차단되어 있으며 어떤 문서·로그·예제에도 실제 값을 쓰지 않는다. <br>🔴 **2026-08-06 추가 — 로컬 전용 변수 3개**(범주 B 의존성 `@google/genai`, DECISIONS #49): `LLM_PROVIDER`, `GEMINI_API_KEY`(서버 전용), `GEMINI_MODEL`. **셋 다 `NEXT_PUBLIC_` 접두사가 없어 클라이언트 번들에 들어가지 않는다.** **Vercel 프로덕션에는 셋 다 설정하지 않는다** — `LLM_PROVIDER` 미설정이 곧 OpenAI 경로다. `.env.example:37~43` 과 `README.md:90~92` 에 **양쪽 등재 확인**(measured 2026-08-06). 따라서 위 5개 + 이 3개 = **선언된 환경변수 8개**이며, 프로덕션에서 값이 필요한 것은 여전히 **5개뿐**이다 |
| Sensitive data | **보유하는 것**: ① 사용자 이메일·비밀번호 해시(Supabase Auth 관리) ② 사용자가 입력한 업무 메시지 원문·변환문(`sent_messages`, `diff_records`) ③ 자기신고 커뮤니케이션 프로필 ④ **제3자(수신자) 정보** — `location`/`company`/활동 시간대(`recipient_enrichments`)와 관측 집계값(`observation_samples`). **위치**: Supabase Postgres(전송 구간 TLS, 저장 시 관리형 암호화). **추가 보호 없음** — 컬럼 단위 암호화·pseudonymization은 MVP에 구현하지 않는다. **전송**: 메시지 원문은 백엔드를 경유해 OpenAI로 나간다(구조상 불가피). 완화는 Planning Decision #11(합성 데이터만 사용)이며 **실사용 단계에서는 성립하지 않는 완화**임을 PRD Risks가 이미 명시한다. 🔴 **관측 표본의 원문은 저장하지 않는다** — 확장 콘텐츠 스크립트에서 집계 후 폐기하며 `observation_samples` 에 원문 컬럼이 **존재하지 않는다**(AC-081②③). 🔴 **정보주체 통지는 미구현** — 관측 대상이 된 사람은 그 사실을 알지 못한다. 이것은 설계로 해결되지 않는 남은 한계이며 발표에서 먼저 인정한다(PRD Risks) |
| Input validation boundaries | **경계는 3개, 검증 소유자는 각각 하나다.** ① **HTTP 경계** — `apps/web/lib/http.ts` 의 `withApi()` 가 **zod 스키마로** 모든 요청 body/query를 파싱한다. 파싱 실패 = 400 `VALIDATION_FAILED`. core 함수는 **이미 검증된 타입만** 받는다(core 안에 재검증을 만들지 않는다). ② **외부 API 응답 경계** — OpenAI 응답은 신뢰하지 않는다. `apps/web/lib/llm/openai.ts` 가 JSON 파싱 + zod 검증에 실패하면 `LLM_MALFORMED` 로 폴백 경로(AC-041)로 넘긴다. GitHub 공개 프로필 응답도 동일(`location`/`company` 외 필드는 **파싱 단계에서 버린다** — AC-065③). ③ **확장 → 백엔드 경계** — 확장이 보내는 값도 외부 입력으로 취급해 ①과 같은 검증을 통과시킨다. 🔴 **입력 길이는 검증 대상이 아니다** — 5,000자는 소프트 캡이며 초과를 차단하는 코드 경로를 만들지 않는다(AC-061②). **파일 업로드 없음** — N/A |
| Attack surface | **노출되는 것**: ① `*.vercel.app` 의 HTTPS 엔드포인트 — `docs/API.md` 에 열거된 라우트 전부. 열린 포트는 없다(서버리스). ② Supabase의 공개 REST 엔드포인트 — `anon key` 로 접근 가능하나 **RLS가 전 테이블에 걸려 있어** 인증 없이는 0행이 반환된다. ③ **Chrome 확장의 `all_urls` 급 권한** — 이 프로젝트 최대의 노출면(Planning Decision #64). **제한 수단**: manifest 권한을 `activeTab` + 우리 API origin `host_permissions` + 콘텐츠 스크립트 `<all_urls>` 로 최소화하고 T58에서 1회 검토·기록(AC-054②). `externally_connectable` 은 **우리 앱 origin 1개로 제한**(임의 사이트가 확장에 메시지를 보낼 수 없게). ④ **제3자 콜백 없음** — 웹훅·OAuth 리다이렉트·결제 콜백을 만들지 않는다(결제는 MVP 제외, Monetization). **제한 수단 요약**: 전 라우트 인증 필수(`/api/health` 제외), RLS, LLM 요청 상한 2겹, 서비스 롤 키 사용처 2곳으로 격리 |
| Dependency risk | **신규 의존성 전부 `docs/DECISIONS.md` 에 행이 있다**: `next`·`react`(#1), `@supabase/supabase-js`·`@supabase/ssr`(#4), `openai`(**#8** — 이 자리에 `#7` 로 적혀 있던 것은 오기다. #7은 "실시간 미채택"이고 LLM 클라이언트 결정은 #8이다. 2026-08-06 정정), `zod`(#12), `vitest`(#13), `eslint`+`prettier`(#14), `vite`(#15). **유지보수 위험 판정**: 8개 모두 주요 프로젝트이며 미유지보수·알려진 위험 패키지 **0건**. <br>✅ **취약점 스캔이 실행됐다 — 앞 패스의 `추정` 항목이 해소됐다.** T2 스캐폴드 직후 `npm audit --omit=dev` 를 오케스트레이터가 직접 실행해(measured, 2026-08-04) **high severity 3건**을 확인했다: **next 15가 번들한 `postcss`·`sharp`**. 해소 경로가 `next@16` breaking 업그레이드뿐이었고 **사용자가 업그레이드를 선택**했다(DECISIONS #37 · Tech Stack 프레임워크 행). ⚠️ **architect는 이 명령을 재실행하지 않았다(셸 없음)** — 위 수치의 출처는 오케스트레이터 실행 출력이다. **재확인 수단**: `next@16` 설치 직후 `npm audit --omit=dev` 를 1회 더 실행해 3건이 0건이 됐는지 출력을 첨부한다(업그레이드가 실제로 해소했는지는 **아직 미확인**이다). **정책**: 위 8개 외의 신규 의존성은 `docs/CodingRules.md` Prohibitions에 따라 DECISIONS.md 행 없이 추가할 수 없다. <br>🔴 **범주 B — 로컬 전용 조건부 의존성 (2026-08-06 신설 · DECISIONS #49)**: 위 8개는 **프로덕션 실행 경로가 실제로 쓰는 의존성**이며 이하 "범주 A"로 부른다. 그와 별개로 **개발자 로컬 환경에서만 활성화되고 프로덕션 실행 경로에서는 로드되지 않는** 의존성을 범주 B로 둔다. **범주 B도 DECISIONS.md 행이 반드시 필요하다** — 다른 점은 *심사 기준*이지 *기록 의무*가 아니다. **현재 범주 B 목록: `@google/genai@^2.15.0`(#49) 1건.** <br>**범주 B의 성립 조건 4개(하나라도 깨지면 그 의존성은 범주 A로 재심사한다)**: ① 활성화가 **환경변수 1개로만** 이뤄지고 그 변수의 **미설정 기본값이 프로덕션 경로**일 것(`LLM_PROVIDER` 미설정 → OpenAI, `apps/web/lib/llm/create-client.ts:19~25`). ② **동적 import** 로 프로덕션 라우트의 eager 번들에서 빠질 것 — 판정은 빌드 후 `apps/web/.next/server/app/api/mediate/route.js` 에 해당 심볼 grep **0건**(measured 2026-08-06: `GoogleGenAI` 0건. 실물은 지연 로더가 참조하는 별도 청크에만 존재). ③ `packages/core` 가 import 하지 않을 것(ESLint `no-restricted-imports` 가 이미 강제). ④ **일몰 조건이 DECISIONS 행에 적혀 있을 것.** <br>🔴 **범주 B는 "배포되지 않는다"를 뜻하지 않는다** — 지연 청크도 `route.js.nft.json` 에 등재돼 함수 파일시스템에는 올라가고, 패키지는 프로덕션 install 대상이다. 따라서 범주 B도 **`dependencies` 에 두어 `npm audit --omit=dev` 스캔 대상으로 유지**한다(devDependencies로 옮기면 이 프로젝트의 유일한 취약점 스캔에서 사라진다 — #49 조건 ①) |
| Abuse cases | 아래 별도 표 |

### C6 게이트 판정과 EU AI Act 방어선 (2026-08-04 추가 · DECISIONS #35 · ADR-0005)

위 "Sensitive data" 행에 대한 보충이다 — **AC-058 게이트 판정이 응답 payload에 무엇을 남기는가**를 설계 시점에 못 박는다.

| 항목 | 결정 |
|---|---|
| 응답에 담는 것 | `ticketOption: { offered: boolean, basis: 'signal_present'\|'signal_absent'\|'undetermined' }` **이것이 전부다**(F1-a) |
| 응답에 담지 **않는** 것 | 🔴 **감정 점수(수치)·감정 라벨(분노/불만 등)·감정에 대한 자연어 서술.** 계약에 `emotion*` 이라는 이름의 필드를 만들지 않는다 |
| 저장 | **없음.** `POST /api/mediate` 는 저장하지 않고, `sent_messages` 에 감정 컬럼이 존재하지 않는다(AC-070②) |
| 로그 | **없음.** DECISIONS #27의 로그 필드 목록에 추가하지 않는다 |
| 노출 대상 | **발신자 본인만.** 관리자·수신자·제3자에게 전달되는 경로가 존재하지 않는다(AC-018의 [우려 수준]과 같은 방어선) |
| 근거 | `docs/PRD.md` Risks의 EU AI Act Article 5(1)(f) 행 — MVP에 남은 사정권은 AC-018·AC-058 둘뿐이며, 방어 서술은 *"발신자 본인이 방금 입력한 자기 텍스트를 대상으로 하고 결과도 본인에게만 표시된다"* 이다. **점수·라벨을 payload에 두면 그 서술과 어긋난다** — 그 순간 산출물이 "본인 입력에 대한 옵션 제시"가 아니라 "사람의 감정 상태에 대한 등급 판정"이 된다 |
| ⚠️ 등급 | 위 행이 **리스크를 0으로 만들지 않는다.** PRD가 이미 *"AC-018·AC-058이 여전히 감정 관련 처리를 하므로 리스크가 0이 되지 않는다"* 고 명시했고 **법률 자문은 없다(추정)**. 이 설계가 하는 일은 노출을 **AC-058이 요구하는 최소치로 묶어 두는 것**이지 안전을 단정하는 것이 아니다 |

### Abuse cases (MVP 기능별 1문장)

| MVP # | 기능 | 악용·오용 시나리오 | 이 설계의 대응 |
|---|---|---|---|
| 1·3 | C4 역번역 / C2 톤 변환 | 무료 계정으로 **범용 번역기·문장 다듬기 도구**로 반복 사용해 우리 OpenAI 크레딧을 태운다 | 사용자·일 상한 + 전역·일 상한(AC-041), 캐시 적중은 호출 0건 |
| 2 | C1 긴급도 분류 | 실제 CRITICAL을 LOW로 오분류시켜 **대응을 지연**시키는 데 도구를 핑계로 쓴다 | override 항상 가능 + 판단 근거 상시 노출(AC-003/004) — 최종 판단은 사람에게 남는다 |
| 5 | 승인 후 전송 | **자동 발송으로 스팸**을 보낸다 | 자동 발송 코드 경로가 존재하지 않는다(AC-010/AC-040). 확장도 삽입까지만 |
| 11 | C3 diff 학습 | 의도적으로 같은 수정을 반복해 **프로필을 오염**시킨다 | 본인 프로필에만 영향 + 열람·수정·삭제 가능(AC-014). 타인에게 전파되지 않는다 |
| 12 | C5 용어사전 | 사전에 **프롬프트 주입 문자열**을 넣어 변환 결과를 조종한다 | 사전 값은 사용자 자신의 데이터이며 **본인 변환에만** 주입된다. 프롬프트에는 값을 구분자로 감싼 데이터 블록으로 넣고 지시문으로 취급하지 않는다 |
| 13·14 | C6 티켓 / C7 요약 | 타인의 대화 스레드를 붙여 넣어 **제3자의 감정·권한을 판정**시킨다 | `불명`/`미정` 강제(AC-020/AC-050①)로 근거 없는 판정을 만들지 않는다. 결과는 입력자 본인에게만 표시 |
| 26 | 로그인 | 계정 열거·무차별 대입 | Supabase Auth의 기본 rate limit에 의존(⚠️ 구체 수치 **미확인 — 추정**. 확인 수단: T45에서 연속 실패 10회 시도 후 응답 관찰). 우리가 별도 구현하지 않는다 |
| 32 | 층 1 범용 오버레이 | **다른 사람의 화면·페이지 내용을 몰래 읽는** 도구로 오해받거나 실제로 그렇게 쓰인다 | 선택한 텍스트만 전송, 페이지 자동 스캔 코드 부재, 최초 실행 고지(AC-054), 새 동작 추가 시 고지 버전 재표시(AC-076) |
| 34 | 수신자 정보 보강 · 관측 | 🔴 **상대의 동의 없이 스타일을 프로파일링**한다 — 이 프로젝트에서 악용이 아니라 **정상 동작 자체가 문제인** 유일한 항목 | 사용자가 선택/붙여넣은 것만, 집계값만 저장, 브라우저 로컬 처리, 표본 확인·삭제 가능(AC-081 4방어선). **그럼에도 정보주체 통지는 미구현이며 이것은 완화되지 않는다** |
| 36 | 수신자 자동 감지 | 페이지 내용을 읽는 범위가 넓어진다 | 브라우저 안에서만 사용·전송/저장 금지(AC-068①), 근거 없으면 자동 선택 안 함(AC-067③), P2라 컷 가능 |
| 9 | 공개 URL 배포 | 공개 URL에 아무나 가입해 크레딧을 소모한다 | 위 요청 상한 2겹. ⚠️ **가입 자체를 막지는 않는다** — 심사위원이 직접 써 봐야 하기 때문(AC-026) |
| 4·10 | 2패널 데모 / 데모 데이터 | 실제 사내 메시지가 데모에 섞여 외부 LLM으로 나간다 | Planning Decision #11(합성 데이터만) + AC-033 |
| 6·7·8·15·17 | 코어 분리 / 폴백 UI / 백엔드 프록시 / 오케스트레이션 / 발표자료 | **의미 있는 악용 사례 없음** — 사용자 대면 입력 표면이 없거나(6·15) 내부 구조 결정이다 | — |

---

## Deployment

Designed against docs/PRD.md's Delivery & Deployment section — that section states the requirement, this one states the mechanism. Every row gets a decision or an explicit "N/A — reason"; never blank.

| Item | Decision |
|---|---|
| Hosting / runtime target | **Vercel Hobby** — Next.js 빌드 산출물이 정적 자산 + Node 서버리스 함수로 배포된다. 공개 URL은 **`*.vercel.app` 기본 서브도메인**이며 커스텀 도메인을 구매하지 않는다(Planning Decision #28). Chrome 확장은 **배포하지 않는다** — `apps/extension/dist` 를 개발자 모드로 로드한다(Planning Decision #4). DB는 **Supabase 관리형**(별도 배포 단위 아님). <br>✅ **조직 리포 제약 — 확인 결과 우리에게는 해당 없음(2026-08-04, 오케스트레이터 measured).** Vercel 공식 문서의 *"Vercel does not support connecting a project on your Hobby team to Git repositories owned by Git organizations"*(vercel.com/docs/limits) 라는 제약 **자체는 실재한다.** 다만 리모트가 `https://github.com/ssong2332/middle_hakerton.git` 이고 `gh api users/ssong2332 --jq .type` → `User` 로 소유자가 **조직이 아니라 개인 계정**임이 확인되었다. **따라서 T17 배포의 차단 요인이 아니다.** ⚠️ 리포를 나중에 조직으로 이관하면 이 제약이 즉시 발동한다 — 이관 계획이 생기면 배포 대상을 재검토해야 한다 |
| Build & release pipeline | **2단 구성.** ① **GitHub Actions**(`.github/workflows/ci.yml`) — PR·push 시 `lint` → `typecheck` → `test` 를 실행한다. **DoD Gate의 "Lint passes / Build succeeds / Tests pass"의 출력이 여기서 나온다**(Vercel 빌드는 테스트를 돌리지 않으므로 이것이 없으면 Gate 항목 3개를 매번 수동 실행해야 한다). ② **Vercel Git 연동** — `main` 머지 시 자동 빌드·배포(Delivery & Deployment "Release cadence: main 머지 시 웹앱 자동 반영"을 그대로 구현). 확장은 파이프라인 밖 — `npm run build:ext` 로 로컬 산출물을 만들고 각자 로드한다 |
| Environments & promotion | **Production(`main`) + Local 2단계.** PRD "별도 스테이징 없음"을 그대로 따른다. Vercel의 **Preview 배포(PR별)는 자동으로 생기는 부산물**이며 승격 단계로 운용하지 않는다 — 관리 비용이 0이고(설정 불필요) PR 화면 확인에만 쓴다. 승격 경로는 `feature 브랜치 → PR(CI 통과 + reviewer APPROVED) → main 머지 → 자동 프로덕션` 하나뿐이다. **2026-08-20 이후 배포 동결**(T36), **2026-08-21 발표 당일 배포 금지**(Delivery & Deployment) |
| Configuration per environment | **환경별로 값이 다른 변수**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `MAX_LLM_CALLS_PER_USER_PER_DAY`, `MAX_LLM_CALLS_GLOBAL_PER_DAY`. **출처**: 로컬은 **`.env`**(git 무시), 프로덕션은 Vercel 프로젝트 환경변수. 🔴 **2026-08-05 정정(DECISIONS #44)** — 이 행은 원래 *"로컬은 `.env.local`"* 이라고 적고 있었으나 저장소의 실제 표준은 `.env` 다: `CLAUDE.md` Secrets Management 전 항목 · `README.md:77`·`:102`(`cp .env.example .env`) · 그리고 **강제 수단인 `.claude/hooks/block-env-access.js:19`·`:37` 이 `.env` 계열을 차단 대상으로 판정**한다. 문서만 다른 이름을 쓰면 문서가 가리키는 파일과 훅이 지키는 파일이 갈린다. **값은 어떤 문서에도 쓰지 않는다** — `.env.example` 에 플레이스홀더 이름만(Security 절 참조). ⚠️ **Supabase 프로젝트는 1개만 만들고 로컬·프로덕션이 공유**한다 — Free 티어가 활성 프로젝트 2개까지이고(measured, supabase.com/pricing 2026-08-04 직접 열람) 17일 안에 2환경 스키마를 동기화하는 비용이 이득보다 크다. **대가**: 로컬 개발이 프로덕션 데이터에 쓴다. 완화 = 데모 시드는 T61이 만드는 전용 계정으로만 두고, 개발용 계정과 계정 단위로 분리한다(RLS가 그것을 강제한다) |
| Database / state migration | **`supabase/migrations/NNNN_*.sql` 파일이 단일 출처.** 수동 DDL 금지. 적용은 `supabase db push`(CLI)이며 **머지 후 사람이 1회 실행**한다 — CI에서 자동 적용하지 않는다(17일 프로젝트에서 마이그레이션 자동화의 실패 모드가 배포 실패보다 비싸다). 🔴 **2026-08-19 00:00 KST 이후 마이그레이션은 additive-only**: `ADD COLUMN`(nullable) / `CREATE TABLE` / `CREATE INDEX` 만 허용하고 `DROP`·`RENAME`·`ALTER TYPE` 을 금지한다. **이유는 롤백이다** — 아래 행 참조. 확장의 로컬 상태(고지 버전 번호, AC-076)는 `chrome.storage.local` 이며 마이그레이션 대상이 아니다(버전 번호 비교만 하므로 스키마가 없다) |
| Rollback procedure | **코드 롤백 — 목표 10분 이내(Delivery & Deployment "Rollback expectation")**: Vercel 대시보드 → Deployments → 직전 정상 배포 → **Promote to Production**. 재빌드 없이 별칭만 전환되므로 **분 단위**로 끝난다(⚠️ 실제 소요 시간은 **추정** — 확인 수단: **T36에서 1회 실제로 실행해 시간을 측정하고 기록한다.** 측정하지 않은 롤백 수단은 롤백 수단이 아니다). <br>🔴 **DB 롤백은 존재하지 않는다.** Supabase Free에 시점 복구가 없고, 있어도 17일 안에 리허설할 시간이 없다. **그래서 위 additive-only 규칙이 설계 제약이 된다** — 컬럼을 지우지 않으면 **구버전 코드가 신버전 스키마 위에서 그대로 동작**하므로 코드만 되돌려도 시스템이 정합하다. 롤백 불가능한 시스템은 다르게 설계해야 한다는 원칙의 구체적 적용이다. <br>**확장 롤백**: 이전 커밋에서 `npm run build:ext` 후 다시 로드(수 분). 발표에 확장이 필요한 장면이 있으면 **8/20까지 빌드 산출물을 별도 보관**한다 |
| Health check / smoke test | **`GET /api/health`** — 인증 불필요, 반환값 `{ ok, db: 'up'\|'down', openaiKeyPresent: boolean, commit: <sha>, ts }`. 🔴 **키 값을 반환하지 않는다 — 존재 여부 boolean만.** <br>**배포 후 스모크(T35·T36에서 수행, 3분)**: ① `/api/health` 가 `db:'up'`, `openaiKeyPresent:true` ② 로그인 → UX-004 진입 → 대본 원문 1건 중재 실행 → 역번역까지 표시(AC-026의 "전체 데모 플로우") ③ 응답의 `source` 가 `live` 또는 `cache` 인지 확인(`fallback` 이면 크레딧·키 문제) ④ 다른 계정으로 로그인해 앞 계정 데이터가 **보이지 않음** 확인(AC-039). 네 항목 결과를 실행 출력으로 기록한다 |

### 무료 티어 한도 (전부 measured — 2026-08-04 오케스트레이터가 해당 페이지를 직접 열람)

게이트 항목 ②④의 사용자 조건("무료로 가능하면")이 충족되는지의 근거다. **아래 수치는 확인된 값이며 추정이 아니다.**

| 플랫폼 | 항목 | 한도 | 우리 사용량 대비 판정 |
|---|---|---|---|
| **Vercel Hobby**<br>(vercel.com/docs/plans/hobby) | 요금 | **$0, 청구 주기 없음** | ✅ 조건 충족 |
| | 🔴 **사용 범위** | **비상업·개인 사용 전용**(*"the Hobby plan restricts users to non-commercial, personal use only"*) | ✅ **MVP 기간(~2026-08-21) 차단 아님** — 해커톤 제출·시연은 비상업. ⚠️ 상용화 시 Pro 필요(Risks 표 참조) |
| | Function Invocations | 첫 100만 | ✅ NFR Scale(동시 10명)에서 무의미한 여유 |
| | Edge Requests | 최대 100만 | ✅ |
| | 배포 | **100회/일** | ✅ `main` 자동 배포 빈도로 도달 불가 |
| | 프로젝트 | 200개 | ✅ 1개 사용 |
| | 함수 최대 실행 시간 | **300초** | ✅ NFR "체감 5초"의 60배 여유. LLM 타임아웃을 우리가 훨씬 짧게 잡는다 |
| | 🔴 **Runtime Logs 보존** | **1시간** | ⚠️ **부족하다** — 그래서 `llm_call_log` 테이블을 둔다(Observability 절 / DECISIONS #26) |
| | 한도 초과 시 | 대체로 30일 대기 | ⚠️ 초과하면 발표 전 복구가 불가능하다 — 배포 횟수만 유의 |
| **Supabase Free**<br>(supabase.com/pricing) | 요금 | **$0/month** | ✅ 조건 충족 |
| | DB 크기 | **500MB** (Shared CPU · 500MB RAM) | ✅ NFR Scale "누적 diff 히스토리 수천 건 미만". ⚠️ `llm_cache.response`(jsonb)가 가장 큰 소비처 — T35 리허설에서 실사용량을 1회 확인할 것 |
| | Auth MAU | **50,000** | ✅ 심사위원+팀 규모에서 무의미한 여유 |
| | Egress | **5GB** + cached egress 5GB | ✅ |
| | **파일 저장** | **1GB** | **해당 없음** — 이 스키마에 **파일 업로드가 없다.** Supabase Storage를 사용하지 않으며 PRD에도 파일 첨부 기능이 없다(AC 전체에 업로드 요구 0건) |
| | 🔴 **활성 프로젝트** | **최대 2개** | ⚠️ **DECISIONS #28(로컬·프로덕션이 프로젝트 1개 공유)의 직접 근거다.** 2개 제한 안에서 환경을 나누면 여유분이 0이 되어 사고 시 복구용 프로젝트를 만들 수 없다 |
| | 🔴 **일시정지** | **1주 미사용 시** | ⚠️ 8/4~8/21 매일 개발 트래픽이 있어 현실적 위험은 낮다. **T36 배포 동결 점검에 "Supabase 프로젝트 active 확인" 1줄을 넣는다** |

---

## Conventions

implementer가 지켜야 할 아키텍처 규칙. 위반은 reviewer의 Major 이상(AGENTS.md Severity Scale "architecture/layer violation").

1. **`packages/core` 는 프레임워크를 모른다.** `next`/`react`/`@supabase/*`/`openai` import 금지. LLM·저장소는 **인터페이스를 인자로 받는다**(`LLMClient`). ESLint `no-restricted-imports` 로 강제하며 위반 시 빌드가 실패한다.
2. **HTTP 경계 밖으로 예외가 새지 않는다.** 모든 Route Handler는 `withApi()` 로 감싼다. `try/catch` 를 라우트 본문에 직접 쓰지 않는다.
3. **저장소 클라이언트는 `apps/web/lib/supabase/` 에서만 생성한다.** 컴포넌트·라우트 본문에서 `createClient()` 를 직접 부르지 않는다. `createServiceClient()`(RLS 우회)는 `llm_cache`·`llm_call_log` 접근 외에 쓰지 않는다.
4. **화면은 API를 HTTP로만 부른다.** `components/` 가 `app/api/**` 의 함수를 직접 import 하지 않는다 — 확장이 같은 화면 로직을 재사용할 수 있어야 하기 때문이다.
5. **층 1은 층 2를 모른다.** `layer1/` 이 `layer2/` 를 import 하면 컷 안전성이 무너진다. 주입은 진입점(`content.ts`)에서 1회.
6. **임계값·상수는 `packages/core/src/constants.ts` 한 곳에.** AC-077/AC-082가 요구하는 **4개 상수**(`{활동시간대, 스타일제안} × {수동, GitHub}`)와 침묵 감지 임계값(업무일 2일, Planning Decision #60)이 여기 산다. 다른 파일에 숫자 리터럴로 쓰지 않는다.
7. **국가·국민성 서술을 코드·데이터·프롬프트·UI 문구에 넣지 않는다.** 이모지 데이터에 `country`/`region`/`nationality` 컬럼을 만들지 않는다(AC-056①, Planning Decision #6/#71). grep으로 검증 가능해야 한다.
8. **자동 발송·자동 클릭 코드 경로를 만들지 않는다.** "없음"이 검증 대상이므로(AC-010/AC-040), 나중에 쓸 생각으로도 만들지 않는다.
9. **없는 값을 지어내지 않는다.** `미정`/`불명`/`미등록`/빈 배열이 정상 반환값이다(AC-020/043②/047②/050①/065⑤). 기본값으로 채우는 코드가 곧 AC 위반이다.
10. **프롬프트는 `packages/core/src/prompts/` 에 두고 `PROMPT_VERSION` 을 함께 올린다.** 캐시 키에 들어가므로, 올리지 않으면 프롬프트를 고쳐도 옛 응답이 반환된다.
11. **DB 조회물은 core 밖에서 조회해 `deps.data` 로 넘긴다.** core 안에 조회 함수·조회 인터페이스를 만들지 않는다(조회 *결과*만 받는다 — F1-b). 새 조회물이 생기면 F1-b의 판정표에 행을 추가한 뒤 반영하고, 임의로 `MediationInput` 에 필드를 늘리지 않는다. 위반 판정: `packages/core` 안에 `Promise` 를 반환하는 저장소성 인자가 새로 생긴 diff(예외: `LLMClient`).
12. **네이밍/디렉터리/스타일 세부 규칙은 `docs/CodingRules.md`(User 소유)** — architect는 편집하지 않는다. <br>🔴 **2026-08-04 정정**: 이 항목은 *"Naming/Directory/Style 표가 비어 있어 DoD Gate 'Lint passes'가 실행 불가"* 라고 적고 있었다. **결론(당시 실행 불가)은 맞았지만 원인이 틀렸다.** `docs/CodingRules.md` 는 **이미 채워져 있다**(measured — architect가 2026-08-04 전문 열람, 126줄. Naming 12행 / Directory Rules 11행 / Style 6항목 / Error Handling 7행 / Tests 표 6행 + "채우지 않은 칸" 5행이 모두 값과 판정 방법을 갖고 있다. DECISIONS #34로 architect가 초안을 작성했다). 진짜 원인은 **설정 파일이 T2 산출물이었다는 것**이며, 그 사실은 `docs/CodingRules.md:7`·:81 이 이미 조건부로 명시하고 있었다. <br>✅ **그 조건도 해소됐다** — T2가 `eslint.config.js` · `.prettierrc` · `vitest.config.ts` · `.github/workflows/ci.yml` 을 생성했다(measured — 2026-08-04 리포에 파일 존재 확인). **"Lint passes"는 이제 실행 가능하며 사용자 승인 skip이 필요하지 않다.**
13. 🔴 **불변식은 주석이 아니라 타입으로 쓴다(F1-c).** `TicketOption` · `TicketResult`(`decisionAuthority`) · `DecisionItem`(`authorityStatus`)의 짝은 **판별 유니온**이며, 값을 만들 때는 `rules/ticket-gate.ts` 의 `ticketOptionFrom()` 과 `rules/decision-authority.ts` 의 `resolveAuthority()` **만** 쓴다. <br>**위반 판정**: ① 이 세 타입을 `boolean`/평 enum + 별도 필드로 되돌리는 diff ② 짝을 객체 리터럴로 손수 조립하는 diff(생성자 우회) ③ 이 타입들을 `z.object({...})` 로 표현한 zod 스키마(불법 조합을 되살린다 — `z.discriminatedUnion` 을 쓴다) ④ `contract.test.ts` 의 `@ts-expect-error` 를 지우거나 `@ts-ignore` 로 바꾸는 diff(`@ts-ignore` 는 조합이 합법이 돼도 조용히 통과한다).
14. 🔴 **존댓말 레벨은 Data Flow 1-a 판정표대로만 결정한다.** 프로필이 비면 **레벨을 지정하지 않고 일관성만 지시**하며(행 3), 쌍방 규약은 존댓말 레벨에 관여하지 않는다(행 4). <br>**위반 판정**: ① `DEFAULT_HONORIFIC_LEVEL` 류의 기본 레벨 상수를 두거나 `?? '해요체'` 로 채우는 diff ② `pair_protocols`/`PairProtocol`/`PUT /api/protocol` 에 5번째 축(존댓말 등)을 추가하는 diff ③ `address_form` 에 종결어미 레벨을 실어 보내는 diff ④ "규약에 존댓말 축이 추가되면"을 전제로 하는 코드·주석(금지된 경로를 후속 지시로 남기는 것 — DECISIONS #39).
15. 🔴 **`packages/core` 는 시계를 읽지 않는다(F1-d).** 기준일이 필요하면 **`deps.referenceDate`**(ISO `YYYY-MM-DD`)를 받아 쓰고, 그 값을 만드는 곳은 Route Handler 한 곳이다. <br>**위반 판정**: ① `packages/core` 안에 `new Date()`·`Date.now()` 가 나타나는 diff ② `deps.referenceDate` 대신 스텝마다 각자 기준일을 만들어 넣는 diff(같은 요청에서 값이 갈릴 수 있다) ③ `referenceDate` 를 `MediationInput` 에 옮기는 diff(4필드 불변 — F1-b). <br>**검증 수단**: `packages/core` 대상 grep 1회(`new Date\(|Date\.now\(`) → 히트 0건.
16. 🔴 **화면 URL 경로의 단일 출처는 `docs/UX.md` Information Architecture(:890)다**(DECISIONS #43). Folder Structure의 트리는 그것을 옮겨 적은 것이며, 둘이 어긋나면 **UX.md가 이긴다**(AGENTS.md Document Priority). <br>**위반 판정**: ① UX.md에 없는 이름으로 인증 화면 라우트를 새로 만드는 diff ② `/api/*` 리소스명과 맞추려고 화면 경로를 바꾸는 diff(둘은 일부러 다르다). <br>**예외**: UX.md가 명시적으로 architect/implementer에게 넘긴 경로(UX-018의 모달 라우팅 방식 — UX.md:890 단서).

---

## Error Handling

Global strategy, not per-feature notes. Every row gets a decision or an explicit "N/A — reason"; never blank.

| Item | Decision |
|---|---|
| Where exceptions are caught | **`apps/web/lib/http.ts` 의 `withApi()` 단 한 곳.** core와 lib는 **던지기만** 한다(`CoreError` 계열: `ValidationError`, `LLMUnavailableError`, `QuotaExceededError`, `NotFoundError`, `ConflictError`). `withApi()` 가 잡아 HTTP 상태 + 에러 봉투로 변환하고 `llm_call_log`/구조화 로그에 기록한다. **Route Handler 본문에 `try/catch` 를 쓰지 않는다** — 잡는 곳이 여러 개면 같은 실패가 세 가지 응답으로 나간다. 프론트에서는 **에러 바운더리를 만들지 않는다**(예외로 렌더를 중단시키지 않고, `fetch` 응답의 `error.code` 를 상태로 다룬다). 확장은 `layer1/panel.tsx` 한 곳에서 같은 봉투를 해석한다 |
| How failures surface to the user | **`docs/UX.md` 의 Error/Failure 상태 정의가 계약이다.** 매핑: `VALIDATION_FAILED` → 해당 필드 인라인 오류(UX-001/002/004의 Validation 행) · `AUTH_REQUIRED` → 로그인 화면 리다이렉트(UX-001) · `AUTH_INVALID_CREDENTIALS` → 폼 레벨 배너 "이메일 또는 비밀번호가 올바르지 않습니다"(UX-001 Failure) · `LLM_TIMEOUT`/`LLM_UNAVAILABLE`/`LLM_MALFORMED` → **🔴 사용자에게 오류로 보이기 전에 폴백 경로를 먼저 시도**하고, 폴백도 없으면 배너 "처리에 실패했습니다" + "다시 시도", **작성 중 원문은 절대 지우지 않는다**(AC-029, UX-004 Failure) · `QUOTA_EXCEEDED` → 폴백 응답 + "폴백 응답 사용 중" 배지(AC-041) · `CONFLICT_PROTOCOL_AUTHORED` → UX-018 Stage 4에서 초안 폐기 + 상대 규약 값 표시(AC-074④) · `NOT_FOUND` → 빈 상태(빈 회색 박스 금지 — UX-004의 HolidayConflict 규칙과 같은 원칙) · 그 외 5xx → 재시도 배너. **없는 것을 있는 것처럼 보이는 오류 표시를 만들지 않는다** — 예: 공휴일 데이터가 없는 국가는 오류도 라벨도 렌더하지 않는다(AC-063①) |
| Cross-boundary propagation | **경계마다 형태가 바뀐다.** ① **core 내부** — 예외(`CoreError` 서브클래스)로 던진다. ② **core → HTTP** — `withApi()` 가 `ErrorCode` 문자열 enum + HTTP 상태로 변환. 봉투는 **`{ "error": { "code": string, "message": string, "retryable": boolean } }` 하나로 고정**하며 라우트별로 다른 모양을 만들지 않는다(`docs/API.md` Conventions). ③ **HTTP → 어댑터(웹·확장)** — 클라이언트는 `message`(사람이 읽는 문장, 변경될 수 있음)가 아니라 **`code` 로 분기**한다. `retryable` 이 재시도 버튼 노출 여부를 결정한다. ④ **부분 실패는 오류가 아니다** — 파이프라인 안에서 C6 옵션 산출이 실패하거나 공휴일 조회가 빈 결과여도 **중재 전체를 실패시키지 않는다.** 해당 필드가 빈 배열/`null` 로 나가고 나머지는 정상 반환된다(AC-032의 순서는 지키되 선택 단계가 필수 단계를 막지 않는다) |

---

## Observability

Every row gets a decision or an explicit "N/A — reason"; never blank.

| Item | Decision |
|---|---|
| Logging | **stdout으로 구조화 JSON 1줄/이벤트**(Vercel이 수집). 형태: `{ ts, level, event, requestId, userId, step, outcome, latencyMs, inputChars, errorCode }`. 🔴 **절대 로그에 넣지 않는 것**: 시크릿 값(CLAUDE.md 규칙), **메시지 원문·변환문·역번역문**, **관측 표본 원문**, 이메일 주소. 길이가 필요하면 `inputChars` 숫자만 남긴다 — 업무 메시지와 제3자 발언이 로그에 남는 순간 Security 절의 "원문 미저장" 방어선(AC-081②③)이 로그 쪽으로 뚫린다. `userId` 는 UUID이며 이메일이 아니다. **`event` 이름은 `docs/UX.md` 각 화면의 Events Emitted 를 그대로 쓴다**(`mediation_requested`, `fallback_response_shown`, `overlay_sample_added` 등) — 이름을 새로 만들지 않으면 UX 명세와 로그가 자동으로 정합한다. 로컬은 `pino-pretty` 없이 그냥 `console.log(JSON.stringify(...))` — 의존성을 늘리지 않는다 |
| Error tracking / monitoring | **외부 서비스 없음(Sentry 등 미도입).** ⚠️ **다만 로그만으로는 부족하다는 사실이 measured 로 확인됐다** — Vercel Hobby의 **런타임 로그 보존 기간은 1시간**이다(vercel.com/docs/limits **및** vercel.com/docs/plans/hobby 두 페이지에서 확인, 2026-08-04 직접 열람). 발표 2시간 전의 실패는 로그에서 사라진다. **그래서 로그에 의존하지 않는 최소 장치를 DB에 둔다**: `llm_call_log` 테이블이 모든 LLM 호출의 `outcome`(live/cache/fallback/error)·`latency_ms`·`error_code` 를 **내용 없이** 남긴다. 이것이 발표 중 "왜 폴백이 떴는가"에 답할 수 있는 유일한 증거다. Sentry를 넣지 않는 이유: 계정·프로젝트·DSN·소스맵 업로드까지 반나절이 들고, 17일에서 그 반나절은 T55 스파이크 하나와 같은 값이다 |
| Metrics | **형식 지표 수집 도구 없음.** 대신 `llm_call_log` 한 테이블에서 SQL로 뽑는 3개를 운영 지표로 쓴다: ① **폴백 비율** `count(outcome='fallback')/count(*)` — AC-041이 살아 있는지의 직접 증거 ② **p50/p95 `latency_ms`** — NFR "체감 5초"의 유일한 수치 근거(T35 리허설에서 기록) ③ **일 호출 수** — 크레딧 소진 예측. 가용성·업타임 모니터링은 **N/A — 단일 런치(2026-08-21) 제품이고 상시 운영 대상이 아니다.** 발표 전 확인은 T36의 스모크 4항목이 대신한다 |

---

## Risks & Trade-offs

| Decision | Trade-off | ADR |
|---|---|---|
| Next.js 통합 1리포(FE+BE 한 배포) | 프론트와 백엔드를 **독립적으로 스케일·배포할 수 없다.** 동시 사용자 10명 규모(NFR Scale)에서는 손실이 0이지만, 실사용자 확장(Planning Decision #27) 시점에는 재구성이 필요해질 수 있다. **지금 분리하지 않는 이유**: 분리는 배포 2개·CI 2개·CORS·환경변수 2벌을 만들고, 그 셋업만으로 [FE] 1명의 하루가 사라진다 | [0001](adr/0001-nextjs-integrated-monorepo-with-pure-core.md) |
| `packages/core` 를 **별도 워크스페이스 패키지**로 분리 | 단일 앱 + `src/core/` 디렉터리보다 **초기 셋업이 30분 더 든다**(workspaces, `transpilePackages`, tsconfig paths). **그럼에도 채택한 이유**: AC-028이 "코어가 어댑터에 의존하지 않음을 **import 경로로 확인**"을 요구하고, 확장이 `observation/indicators.ts` 를 **같은 정의로** 써야 하며(AC-080④), 디렉터리 규칙은 리뷰 의견이지만 패키지 경계는 **빌드 실패**다 | [0001](adr/0001-nextjs-integrated-monorepo-with-pure-core.md) |
| Supabase Auth + RLS (자체 인증 미구현) | **인증 방식이 벤더에 묶인다.** 다른 DB로 옮기면 인증도 함께 옮겨야 한다. **그럼에도**: 자체 구현은 [BE-B]의 1~2일이고 T45는 **P1 · 컷 순서 ⑤ "로그인 고도화"** 대상이다 — 잘라낼 수도 있는 기능에 비밀번호 해싱·세션 회전이라는 보안 표면을 우리가 지는 것은 비율이 맞지 않는다 | [0002](adr/0002-supabase-auth-and-rls.md) |
| RLS를 인가의 **주** 수단으로 사용 | 정책 SQL이 틀리면 **디버깅이 애플리케이션 코드보다 어렵다**(0행이 반환되는데 이유가 안 보인다). 완화: 정책은 전 테이블 **동일 형태 1개**(`<소유자 컬럼> = auth.uid()`)이고 `pair_protocols` 만 예외. 🔴 **2026-08-05 정정(DECISIONS #47)**: 소유자 **컬럼 이름**은 통일돼 있지 않다 — `user_id` 4개 · `owner_user_id` 3개(정확한 표는 `docs/Database.md` RLS 절). 이름을 하나로 통일하는 것은 `RENAME` 이라 **#25의 additive-only 규칙과 충돌**하므로 하지 않는다. AC-039 교차 확인(계정 2개)을 T18 완료 조건에 둔다 | [0002](adr/0002-supabase-auth-and-rls.md) |
| 층 2를 **배열 등록형 레지스트리**로 (상속·플러그인 로더 아님) | 사이트별 어댑터가 늘어나면 배열이 길어진다(현재 3개, 로드맵에도 Teams 미추가 — Planning Decision #68). **그럼에도**: Planning Decision #62/#68의 컷 순서를 **파일 삭제 + 한 줄 제거**로 실행 가능하게 만드는 유일한 구조이며, AC-053③("층 2 전부 제거 상태에서 동작")을 실제로 1회 실행해 증명할 수 있다 | [0003](adr/0003-layer1-layer2-adapter-registry.md) |
| LLM 캐시를 **Postgres 테이블**로 | 전용 캐시(Redis/Vercel KV)보다 느리다(수 ms → 수십 ms). **그럼에도**: 체감 5초 예산에서 수십 ms는 무의미하고, 무료 티어를 하나 더 늘리지 않으며, 서버리스에서 인메모리 캐시는 **발표 중 적중하지 않는다** | — |
| ORM 미사용(supabase-js + 생성 타입) | 복잡한 조인·트랜잭션을 손으로 쓴다. **그럼에도**: 테이블 11개, 조인은 2~3곳뿐이며, ORM은 스키마 정의처를 **마이그레이션과 이중화**한다 — F3 동결 지점이 두 개가 되는 것이 17일에서 가장 비싼 실수다 | — |
| 실시간(websocket/Realtime) 미채택 | 나중에 실제 두 사용자 간 규약 알림을 넣으려면 새 레이어가 필요하다. **그럼에도**: Planning Decision #87이 알림을 MVP에서 명시적으로 제외했고, 위 "실시간이 필요 없는 이유" 4행 어디에도 푸시가 필요한 지점이 없다 | — |
| 로컬·프로덕션이 **Supabase 프로젝트 1개**를 공유 | 개발 중 실수가 프로덕션 데이터에 닿는다. 완화 = 계정 단위 분리 + RLS. **그럼에도**: Free 티어 **활성 프로젝트 2개 제한**(measured, supabase.com/pricing)과 17일 안의 2환경 스키마 동기화 비용. **2개를 환경 분리에 다 쓰면 여유분이 0이 되어 사고 시 복구용 프로젝트를 만들 수 없다** — 이 점이 1개 공유를 택한 결정적 이유다 | — |
| Vercel Hobby | 🔴 **비상업·개인 사용 전용 제약이 실재한다 — `추정`이 아니라 `measured`다**(*"the Hobby plan restricts users to non-commercial, personal use only"*, vercel.com/docs/plans/hobby, 2026-08-04 오케스트레이터 직접 열람). **MVP 기간(~2026-08-21)에는 차단 요인이 아니다** — 해커톤 제출·시연은 비상업이다. **걸리는 시점은 상용화다**: Planning Decision #27(실사용자 확장)과 Open Question #6 결정(좌석당 $8~12 구독, Monetization user-approved)이 실행되는 순간 이 제약에 정면으로 걸리며 **Pro($20/user/월)로 전환해야 한다.** 즉 이 무료 선택은 **MVP 한정 유효**이며 수익 모델과 함께 재검토 대상이다. <br>부수 제약(measured): 런타임 로그 보존 1시간 → `llm_call_log` 로 완화(DECISIONS #26). 조직 소유 리포 연결 불가 → **우리 리포는 개인 계정 소유라 해당 없음**(Deployment 절). <br>**그럼에도 채택한 이유**: Planning Decision #28의 무료·기본 서브도메인 조건을 만족하면서 **즉시 롤백**(Promote to Production)이 되는 가장 짧은 경로 | — |
| Supabase Free 프로젝트가 **1주 미사용 시 일시정지**(measured) | 발표 직전 정지되면 시연이 죽는다. **완화**: 8/4~8/21 사이 매일 개발·리허설 트래픽이 있어 현실적 위험은 낮다. **T36 배포 동결 점검에 "Supabase 프로젝트 상태 active 확인" 1줄을 넣는다** | — |
| **C6 게이트 판정을 `{ offered, basis }` 2필드로만 (감정 점수·라벨 미채택)** | 게이트가 왜 안 떴는지 **사용자에게 설명하지 않는다**(`basis` 미렌더). 임계값을 조정하려면 재배포가 필요하다(FE에서 점수를 다시 판정하지 않으므로). **그럼에도**: AC-058이 요구하는 것은 옵션 제시 여부뿐이고, 점수·라벨을 응답에 두는 순간 산출물의 성격이 "옵션 제시"에서 **"사람의 감정 상태에 대한 등급 판정"** 으로 바뀌어 PRD Risks의 EU AI Act 방어 서술과 어긋난다. ⚠️ **리스크가 0이 되는 것은 아니다 — 법률 자문 없음(추정)** | [0005](adr/0005-c6-ticket-gate-field.md) |
| **Next.js 15 → 16 업그레이드**(2026-08-04 사용자 결정) | 🔴 **마감 17일 프로젝트에서 메이저 업그레이드는 그 자체가 위험이다** — 코드 0줄에 가까운 지금이라 표면이 작을 뿐, breaking change가 `apps/web` 스캐폴드·빌드 설정·Vercel 빌드에 걸릴 수 있다(**추정** — 확인 수단: 업그레이드 후 `npm run build` + 첫 Vercel 배포). **그럼에도 채택한 이유**: 대안이 *"high 3건을 안 채로 발표·제출"* 이었고, 이 프로젝트는 심사 제출물이라 의존성 취약점이 그대로 남는 쪽의 비용이 더 크다고 **사용자가 판단**했다. **비용이 최저인 시점에 치른다**는 점도 같은 방향이다(스캐폴드 직후 = 화면·라우트 0개). ⚠️ **업그레이드가 3건을 실제로 0건으로 만드는지는 아직 미확인** — 설치 후 `npm audit --omit=dev` 재실행이 완료 조건이다 | [0001](adr/0001-nextjs-integrated-monorepo-with-pure-core.md) Addendum A |
| **계약 불변식을 판별 유니온으로**(F1-c) | 생성 지점마다 **분기 한 번**을 강제한다(correlated union을 TS가 추론하지 못한다). `TicketResult`·`DecisionItem` 이 `interface` 에서 `type` 이 되어 선언 병합이 불가능해지고, 에디터 hover가 교차형으로 보여 읽기 약간 나빠진다. C6·C7 유니온이 **모양은 같고 이름만 다른 두 벌**로 중복된다. **그럼에도**: 불변식 3개가 전부 "명세는 금지하는데 컴파일은 통과"였고, 그 상태에서는 **소급 테스트가 트리비얼 그린 말고 존재할 수 없다.** 중복 2벌은 AC-064③의 grep 판정을 지키기 위한 **의도된 비용**이다(제네릭으로 묶으면 필드 이름이 타입 파라미터가 되어 grep이 흐려진다) | [0006](adr/0006-contract-invariants-as-discriminated-unions.md) |
| **DB 조회물을 조회 *함수*가 아니라 조회 *결과*로 core에 주입** | `CRITICAL` 로 C3를 건너뛸 때 `learnedItems` 조회 1건이 **버려진다.** Route Handler가 그만큼 두꺼워진다. **그럼에도**: core가 순수 함수로 남아야 T11(회귀 26건)이 저장소 목 없이 "하나의 실행 출력"을 내고, 저장소 실패가 core 안에서 터지지 않아야 *"예외는 `withApi()` 한 곳"* 이라는 Error Handling이 유지된다. 버려지는 조회 1건은 동시 10명(NFR Scale)에서 무의미하다 | [0004](adr/0004-core-pipeline-input-vs-deps.md) |
| **채택하지 않은 더 정교한 대안 — 왜 지금은 아닌가** | **Hexagonal/Clean Architecture 3계층 + DI 컨테이너**: 코어 순수성은 이미 패키지 경계로 얻었고, 추가 계층은 파일 수만 3배로 만든다 — 17일·4명에서는 경계가 아니라 **경계를 지날 때마다 드는 타이핑**이 병목이다. / **이벤트 소싱/아웃박스**: mock-send 제품에 전달 보장이 필요 없다. / **BFF 분리**: 클라이언트가 웹·확장 2개이고 **둘이 같은 계약을 쓰는 것이 AC-028의 요구사항**이라 BFF는 요구를 정면으로 거스른다. / **Feature flag 시스템**: 컷이 "파일 삭제"라서 런타임 플래그가 필요 없다. 플래그를 넣으면 컷된 코드가 리포에 남아 컴파일 대상이 된다 | — |

---

## UX Traceability

`docs/UX.md` v6.0 의 Screen/Flow ID → 구현 위치 매핑. **컴포넌트 경로는 위 Folder Structure, 엔드포인트는 `docs/API.md`, 테이블은 `docs/Database.md` 가 각각 단일 출처다.**

| Screen (Flow) | 컴포넌트 / 라우트 | 엔드포인트 (API.md) | 테이블 (Database.md) | 우선순위·컷 |
|---|---|---|---|---|
| **UX-001** Login (UF-001) | `app/(auth)/login` | Supabase Auth `/auth/v1/token` (우리 라우트 아님) | `auth.users` | P1 · 기본 로그인은 컷 대상 아님 |
| **UX-002** Sign Up (UF-001) | `app/(auth)/signup` | Supabase Auth `/auth/v1/signup` | `auth.users`, `profiles`(빈 행 생성) | P1 |
| **UX-003** Onboarding (UF-002) | `app/(app)/onboarding` | `PUT /api/profile` | `profiles`(`onboarding_state`) | P1 |
| **UX-004** 2패널 중재 워크스페이스 (UF-003·UF-004·UF-018) | `app/(app)/(with-nav)/mediate` (+ 루트 `/` 가 여기로 리다이렉트) | `POST /api/mediate`, `POST /api/messages` | 읽기: `profiles`, `profile_learned_items`, `pair_protocols`, `dictionary_terms`, `recipient_enrichments` / 쓰기: `sent_messages`, `diff_records` | **P0 · 컷 대상 아님** |
| **UX-005** 응답 기한 협상 모달 (UF-003) | `components/deadline/` | `POST /api/deadline/check` | `recipient_enrichments`(근무시간·타임존), 공휴일은 코드 내 정적 데이터 | P2 |
| **UX-006** 예약 발송 모달 (UF-003) | `components/schedule/` | `PATCH /api/messages/{id}` | `sent_messages.scheduled_for` | P2 |
| **UX-007** Vent-to-Ticket (UF-004) | `app/(app)/(with-nav)/ticket` | `POST /api/ticket` | 없음(승인 전 미저장) → 승인 시 `sent_messages` | P1 |
| **UX-008** 결정 요약 · 미확정 감지 (UF-005) | `app/(app)/(with-nav)/decisions` | `POST /api/summary` | 없음(스레드 미저장) | P1(C7) / P2(미확정 감지) |
| **UX-009** 프로필 관리 (UF-006) | `app/(app)/(with-nav)/profile` | `GET/PUT/DELETE /api/profile`, `GET /api/profile/learned` | `profiles`, `profile_learned_items`, `diff_records`(3회 판정 근거) | P1 |
| **UX-010** 용어사전 관리 (UF-007) | `app/(app)/(with-nav)/terminology` | `GET/POST/PUT/DELETE /api/dictionary` | `dictionary_terms` | P1 |
| **UX-011** 쌍방 규약 (UF-008·UF-018·UF-022) | `app/(app)/(with-nav)/pair-protocols` (+ `/[counterpart]`) | `GET/PUT /api/protocol`, `GET /api/protocol/mismatches` | `pair_protocols`(`authorship_state` 포함) | P2 · **작성자 배지는 #34 컷 후에도 생존**, 불일치 배너는 #34와 함께 사라짐 |
| **UX-012** 회의 시간 추천 (UF-009) | `app/(app)/(with-nav)/meeting-times` | `POST /api/meeting-times` | `recipient_enrichments`(있으면) | P2 |
| **UX-013** 응답 피드백 (UF-010) | `app/(app)/(with-nav)/feedback` | `GET /api/feedback` | `sent_messages`(감정 컬럼 **없음** — AC-070②) | P2 |
| **UX-015** 발송 목록 · 리마인드 승인 (UF-013) | `app/(app)/(with-nav)/sent-messages` | `GET /api/messages`, `PATCH /api/messages/{id}`, `POST /api/messages/{id}/reminder` | `sent_messages`, `diff_records`(리마인드 승인 시) | P2 |
| **UX-016** 범용 선택 중재 패널 (UF-011·012·014·015·016·019·020) | `extension/src/layer1/panel.tsx` + `layer2/*`(선택) + `mark/`(선택) | `POST /api/mediate`, `POST /api/samples`(Mark 모드) | `diff_records`, `sent_messages`, `observation_samples`(Mark 모드) | **층 1 P1 · 컷 대상 아님** / 층 2·Mark·후보감지는 컷 가능 |
| **UX-017** 확장 프라이버시 고지 (UF-017) | `extension/src/layer1/notice.ts` | 없음(네트워크 호출 0) | **없음** — `chrome.storage.local` 의 고지 버전 번호뿐(AC-076, Planning Decision #81/#102: T18 의존 없음) | P1 |
| **UX-018** 수신자 보강 · 스타일 추론 4단계 (UF-018) | `app/(app)/(with-nav)/enrichment` | `POST /api/enrichment/fetch`, `POST /api/enrichment/observe`, `POST /api/enrichment/suggest`, `POST /api/protocol/confirm-inference` | `recipient_enrichments`, `observation_samples`(읽기), `pair_protocols`(Stage 4 확정 시에만 쓰기 — **병렬 테이블 금지**, AC-074①) | **P2 · 최후순위 · 폴더 삭제로 컷** |
| **UX-019** 관측 표본 관리 (UF-021) | `app/(app)/(with-nav)/observation-samples` (+ `/[counterpart]`) | `GET /api/samples`, `DELETE /api/samples/{id}` | `observation_samples`(원문 컬럼 없음) | **P2 · #34와 한 덩어리로 컷** |
| **UX-014** (Deprecated) | — | — | — | 폐기 — 층 1(UX-016)이 대체 |

### 컷 시 사라지는 것 (Planning Decision #62/#68 순서대로)

| 컷 단계 | 삭제 대상 | 삭제 후에도 남아야 하는 것 |
|---|---|---|
| ① P2 코드 태스크 전체 | `app/(app)/(with-nav)/{enrichment,observation-samples,meeting-times,feedback,sent-messages}`, `extension/src/mark/`, `components/{deadline,schedule}`, `POST /api/{enrichment,samples,meeting-times,deadline}/*` | UX-004 전체 경로, UX-011 규약 편집 + **작성자 배지**, 층 1 전체 |
| ② 층 2 Slack·Gmail(동순위, 스파이크로 판정) | `extension/src/layer2/{slack,gmail}.ts` + `index.ts` 배열에서 2줄 | 해당 사이트에서 층 1의 **클립보드 복사**(AC-053①③) |
| ③ 층 2 GitHub | `extension/src/layer2/github.ts` + 1줄 | 동일. `layer2/index.ts` 는 **빈 배열**로 남고 빌드된다 |
| ④ 로그인 고도화 | 비밀번호 재설정·계정 관리 화면 | 가입·로그인·로그아웃·세션(T45·T46 기본분) |
| ⑤ 실사용자 확장 여분 | 권한 분리·다중 워크스페이스 (**애초에 만들지 않는다** — 위 Conventions 9와 같은 원칙) | — |

**어느 단계에서 멈춰도 빌드와 배포가 성립한다.** 근거: 삭제 대상이 전부 **말단(leaf)** 이며, 남는 모듈이 삭제 대상을 import 하는 지점이 `layer2/index.ts` 의 배열 한 곳뿐이다. AC-053③이 이 성질을 1회 실행으로 증명하도록 요구한다.
