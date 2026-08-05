# Coding Rules — 크로스보더 협업 중재 서비스

Owner: User (architect may draft on request). All agents read-only.

> 📝 **Naming / Directory Rules / Style / Error Handling / Tests 절은 architect가 2026-08-04 사용자 지시로 작성한 초안이다** — AGENTS.md의 `User (or architect **on request**)` 조건이 충족되었다(`docs/DECISIONS.md` #34). 스택이 확정된 뒤에야 채울 수 있던 칸들이며, 확정값의 단일 출처는 `docs/Architecture.md` Tech Stack 이다.
> **이 문서의 모든 규칙은 "무엇이 위반인가"가 판정 가능해야 한다.** 판정 방법이 없는 규칙은 넣지 않았다 — 각 표의 **판정** 열이 그 방법이다.
> 설정 파일 자체(`eslint.config.js`, `.prettierrc`, `vitest.config.ts`)는 **T2에서 implementer가 만든다.** architect는 규칙 문서만 쓴다.

## Prohibitions
- No new dependencies without an entry in DECISIONS.md.
- No commented-out code in commits.
- No `any`/untyped escapes where the language supports types.

## Naming

| Target | Convention | Example | 판정 (무엇이 위반인가) |
|---|---|---|---|
| Files (일반 모듈) | kebab-case | `misread-risk.ts`, `business-days.ts` | 파일명에 대문자 또는 `_` 가 있으면 위반 |
| Files (React 컴포넌트) | PascalCase | `MediationPanel.tsx`, `UrgencyBadge.tsx` | 컴포넌트를 export 하는 `.tsx` 인데 파일명이 PascalCase가 아니면 위반 |
| Files (Next.js 라우트) | **프레임워크 고정 — 우리가 정하지 않는다** | `page.tsx`, `route.ts`, `layout.tsx` | 규칙 대상 아님 |
| Files (테스트) | 대상 파일명 + `.test.ts(x)`, 소스 옆 | `business-days.test.ts` | `__tests__/` 디렉터리나 `.spec.` 을 쓰면 위반 |
| Functions | camelCase | `runPipeline`, `buildCacheKey` | — |
| Classes/Types | PascalCase, **`I` 접두사 금지** | `MediationResult`, `Layer2Adapter`, `CoreError` | `IMediationResult` 처럼 `I` + PascalCase면 위반 |
| Constants | UPPER_SNAKE (모듈 레벨). 함수 안 지역 `const` 는 camelCase | `PROMPT_VERSION`, `SILENCE_THRESHOLD_BUSINESS_DAYS` | 모듈 레벨 상수가 camelCase면 위반 |
| 환경변수 | UPPER_SNAKE. **클라이언트 노출용만 `NEXT_PUBLIC_` 접두사** | `OPENAI_API_KEY`(서버) / `NEXT_PUBLIC_SUPABASE_URL`(클라이언트) | 🔴 **시크릿에 `NEXT_PUBLIC_` 이 붙으면 Critical 위반** — 클라이언트 번들에 실려 AC-030을 깬다 |
| DB 테이블 / 컬럼 | snake_case, 테이블은 복수형 | `sent_messages`, `owner_user_id` | `docs/Database.md` 와 이름이 다르면 위반 (Database.md가 단일 출처) |
| API 에러 코드 | UPPER_SNAKE | `QUOTA_EXCEEDED`, `CONFLICT_PROTOCOL_AUTHORED` | `docs/API.md` Error codes 표에 없는 코드를 반환하면 위반 |
| 로그 이벤트명 | **`docs/UX.md` 의 Events Emitted 를 그대로 쓴다** | `mediation_requested`, `overlay_sample_added` | UX.md에 없는 이벤트명을 새로 만들면 위반 (DECISIONS #27) |

## Directory Rules

| Path | Contains | Must not contain | 판정 |
|---|---|---|---|
| `packages/core/src` | C1~C7 파이프라인, 변환 규칙, 정적 데이터(공휴일·이모지), 지표 정의, 계약 타입 | 🔴 `next` · `react` · `@supabase/*` · `openai` · `apps/*` 의 **모든 import** | **ESLint `no-restricted-imports` 가 빌드를 실패시킨다**(아래 설정 형태). AC-028의 판정 수단 |
| `packages/core/src/contract.ts` | 코어 I/O 타입 (Freeze Point F1) | 구현 코드, 함수 본문 | 타입·interface·enum 외의 export가 있으면 위반 |
| `packages/core/src/constants.ts` | 임계값 상수 (표본 4개, 침묵 감지 업무일, 요청 상한) | 로직 | 🔴 **같은 숫자가 다른 파일에 리터럴로 나타나면 위반** (AC-077① / AC-082① "각 상수는 코드 1곳에 격리") |
| `apps/web/app/api/**` | Route Handler. 인증·검증·에러 매핑은 `withApi()` 담당 | `apps/web/components/**` · `apps/extension/**` import / 라우트 본문의 직접 `try/catch` | import 경로 검사 + 라우트 본문 `try` 검사 |
| `apps/web/components` | 화면 컴포넌트 | `apps/web/app/api/**` 의 내부 함수 import (HTTP로만 호출) | import 경로 검사 |
| `apps/web/lib/supabase` | Supabase 클라이언트 **생성처 (여기 한 곳뿐)** | — | 다른 파일에서 `createClient(` 을 호출하면 위반. `createServiceClient()` 사용처는 `llm_cache`·`llm_call_log` **2곳만** |
| `apps/extension/src/layer1` | 선택 감지·패널·클립보드·레지스트리 계약·고지 | 🔴 `layer2/**` import, 사이트 식별 분기(`host === 'github.com'` 등) | import 검사 + AC-052③("대상 사이트 식별 코드 없이 동작") |
| `apps/extension/src/layer2/{github,slack,gmail}.ts` | `Layer2Adapter` 구현 (선택자 + 삽입 함수) | 🔴 **서로의 import**, `layer1` 구현부 import, `.click()` 호출 | import 검사 + `.click(` grep. **`.click(` 은 AC-040 위반 = Critical** |
| `supabase/migrations` | SQL 마이그레이션 파일 | — | 대시보드 직접 DDL은 파일이 남지 않으므로 곧 위반 |
| `apps/web/lib/db.types.ts` | `supabase gen types` 생성 결과 | 🔴 **손으로 쓴 수정** | 파일 상단 생성 주석이 사라졌으면 위반 |

### `no-restricted-imports` 설정 형태 (T2가 그대로 옮겨 쓸 것)

`eslint.config.js`(flat config)에서 **`packages/core/**` 에만** 적용한다:

```js
{
  files: ['packages/core/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['next', 'next/*'],       message: 'core는 프레임워크에 의존하지 않는다 (AC-028)' },
        { group: ['react', 'react-dom'],   message: 'core는 프레임워크에 의존하지 않는다 (AC-028)' },
        { group: ['@supabase/*'],          message: '저장소 접근은 어댑터가 주입한다 (AC-028)' },
        { group: ['openai'],               message: 'LLM 호출은 LLMClient 인터페이스로 주입받는다 (AC-028)' },
        { group: ['**/apps/**', '../../apps/*'],
                                           message: 'core는 어댑터를 import 하지 않는다 (AC-028)' },
      ],
    }],
  },
}
```

🔴 **T2 완료 조건**: 이 규칙이 **실제로 빌드를 실패시키는지** 위반 코드 1줄(core 파일에 `import { NextResponse } from 'next/server'` 임시 추가)로 **1회 확인하고 실패 출력을 첨부**한다. *규칙은 있는데 안 걸리는 상태*가 가장 나쁘다 — AC-028의 판정이 통째로 무효가 된다.

## Style

- Formatter: **Prettier** — 설정 `.prettierrc` (리포 루트) + `.prettierignore`. 옵션: 기본값 + `printWidth: 100`, `singleQuote: true`, `semi: true`.
- Linter: **ESLint (flat config)** — 설정 `eslint.config.js` (리포 루트). 베이스: `@eslint/js` 권장 + `typescript-eslint` 권장 + `eslint-plugin-react-hooks`.
- TypeScript: **`strict: true`**. 루트 `tsconfig.json` 을 각 워크스페이스가 `extends`.
- `any` 금지(Prohibitions). 불가피하면 `unknown` + 타입 가드를 쓰고, **외부 응답(OpenAI·GitHub)은 반드시 zod로 파싱**한다.
- Max function length: **50 lines** (guideline, not hard rule) — 초과 시 리뷰에서 분리를 *제안*하되 그것만으로 반려하지 않는다.
- **Import 순서는 강제하지 않는다** — 자동 정렬 플러그인이 17일 안에 주는 이득이 설정·머지 충돌 비용보다 작다고 판단했다. 위반 개념이 없다.

> 📌 **이전 판(스택 미확정 시점)의 경고가 해소된 경위 — 지우지 않고 남긴다.**
> 원문: *"while Formatter/Linter are unconfigured, the DoD Gate's 'Lint passes' item cannot be executed, and every release will need an explicit user-approved skip. Configure these early — ideally right after the architect pass fixes the stack."*
> **그 조건이 충족되었다**: 2026-08-04 architect 패스가 스택을 확정했고(`docs/DECISIONS.md` #1·#14·#31) Formatter/Linter가 위와 같이 지정되었다.
> ⚠️ **다만 아직 완전히 해소된 것은 아니다** — 규칙은 정해졌으나 **설정 파일은 T2에서 생성된다.** `docs/DefinitionOfDone.md` Gate의 "Lint passes"는 **T2 완료 시점부터** 실행 가능하며, **그 전의 릴리스는 여전히 사용자 승인 skip이 필요하다.** 경고를 삭제하지 않고 조건부로 남기는 이유가 이것이다.

## Error Handling

전체 전략의 단일 출처는 `docs/Architecture.md` "Error Handling" 절이다. 여기에는 **코드를 쓸 때 지킬 규칙만** 적는다.

| 규칙 | 내용 | 판정 |
|---|---|---|
| 던지는 쪽 / 잡는 쪽 | `packages/core` 와 `apps/web/lib` 는 **던지기만** 한다(`CoreError` 계열: `ValidationError`·`LLMUnavailableError`·`QuotaExceededError`·`NotFoundError`·`ConflictError`). **잡는 곳은 `apps/web/lib/http.ts` 의 `withApi()` 한 곳뿐** | Route Handler 본문에 `try` 가 있으면 위반 |
| Result 타입 미사용 | 예외로 통일한다. `Result<T,E>` / `neverthrow` 류를 도입하지 않는다 | 두 방식이 섞이면 호출부마다 처리가 갈린다. 새 Result 타입 정의가 보이면 위반 |
| 에러 삼키기 금지 | `catch {}` 빈 블록, `catch { return null }` 금지 | 빈 catch 블록 grep. **로그도 없이 삼키면 Critical** |
| 봉투 고정 | HTTP 에러 응답은 `{ error: { code, message, retryable } }` 하나뿐 | 다른 모양을 반환하는 라우트가 있으면 위반(`docs/API.md` Conventions) |
| 코드로 분기 | 클라이언트는 `error.message` 문자열이 아니라 **`error.code`** 로 분기한다 | `message ===` 또는 `message.includes(` 로 분기하면 위반 |
| 부분 실패는 실패가 아니다 | 공휴일 조회·이모지 판정·C6 옵션 산출이 실패해도 **중재 전체를 실패시키지 않는다** — 해당 필드가 빈 배열/`null` 로 나간다 | 선택 단계의 실패가 5xx를 만들면 위반 |
| 🔴 없는 값을 지어내지 않는다 | `미정`·`불명`·`미등록`·빈 배열이 **정상 반환값**이다 | 기본값·추측값으로 채우는 코드는 곧 AC 위반(AC-020 / AC-043② / AC-047② / AC-050① / AC-059② / AC-065⑤) |
| 🔴 로그 금지 항목 | 시크릿, **메시지 원문·변환문·역번역문**, **관측 표본 원문**, 이메일 주소. 길이는 `inputChars` 숫자로만 | 로그 인자에 텍스트 본문이 들어가면 위반(DECISIONS #27) |

## Tests

- Location: **소스 옆 co-located** (예: `packages/core/src/rules/business-days.test.ts`)
- Naming: `*.test.ts` / `*.test.tsx`
- Runner: **Vitest** (설정 `vitest.config.ts`, 리포 루트). 웹앱·확장·코어가 **한 러너**를 쓴다 — T11이 26건을 "하나의 실행 출력"으로 보고할 것을 요구하기 때문이다. 컴포넌트 테스트는 `@testing-library/react`.
- Minimum: every P0 feature has at least one happy-path and one failure-path test.
- A test must be able to fail. Write it before the code that satisfies it and keep the failing run — see docs/DefinitionOfDone.md's test-first Gate item.
- Structural assertions and semantic assertions are different claims and must be labelled as such. Asserting that a response is non-empty, matches a schema, or contains an expected substring is a *structural* check; it is never evidence that the content is correct. Where output is generated rather than fixed (model responses, templated copy, translations), a structural check alone leaves the actual requirement untested — the suite goes green while the product can still say something false.

### 이 프로젝트에서의 적용

| 대상 | 무엇을 어떻게 | 왜 |
|---|---|---|
| `packages/core` 의 **결정적 로직** (업무일 계산, 공휴일 조회, 이모지 위험도 판정, 캐시 키 생성, 결정 권한 enum) | **단위 테스트로 전부.** LLM을 부르지 않으므로 빠르고 결정적 | 회귀가 실제로 잡히는 곳이다 |
| **LLM 산출물** (C1·C2·C4·C6·C7) | `docs/TestCases.md` 케이스를 **T11 러너**로 실행. 🔴 **구조 검사만으로 통과 처리하지 않는다** — AC-006(보존 10/10) · AC-043(위험 6/6 + **빈 배열 4/4**) · AC-045 · AC-046 · AC-049 는 전부 **의미 판정**이며 통과 수치를 표로 남긴다 | 위 structural vs semantic 규칙의 직접 적용 대상 |
| **부재 검증** (AC-010 자동 발송 없음 / AC-040 자동 클릭 없음 / AC-044⑤ 자동 감지 없음 / AC-070② 감정 분류 없음 / AC-065② 크롤링 없음 / AC-081① 자동 스캔 없음) | **코드 검색(grep) 결과를 근거로 첨부.** 단위 테스트로 "없음"을 증명할 수 없다 | AC 원문이 "코드 경로가 존재하지 않는다"를 판정 조건으로 쓴다 |
| **AC-039 계정 격리** | 계정 2개로 교차 조회해 **0행**을 확인하는 통합 테스트 1건 | RLS가 틀리면 단위 테스트가 전부 통과해도 유출된다 |
| **컷 안전성 (AC-053③)** | `registerAdapters([])` 상태에서 층 1 전 경로가 동작하는 테스트 1건 | 컷을 실행하기 전에 컷 가능성이 증명되어야 한다 |
| **모킹 정책** | LLM은 모킹한다. 🔴 **DB는 모킹하지 않는다** — RLS·CHECK 제약·조건부 UPDATE(AC-074④)는 실제 Postgres에서만 검증된다 | 모킹된 DB는 RLS를 아예 실행하지 않아 AC-039 판정이 무의미해진다 |

### 채우지 않은 칸 — 빈칸이 아니라 "두지 않기로 한 결정"

| 항목 | 상태 | 이유 |
|---|---|---|
| 커버리지 임계값 | **설정하지 않는다** | `docs/DefinitionOfDone.md` Gate가 커버리지를 요구하지 않고("Tests exist for the change and pass"), 코드 0줄 상태에서 기준선 없이 숫자를 정하면 **테스트를 위한 테스트**를 유발한다. 필요해지면 별도 결정으로 추가 |
| 커밋 메시지 규약 | **이 문서의 범위 밖** | `docs/GitWorkflow.md`(User 소유)가 관장한다. 여기 쓰면 두 문서가 충돌한다 |
| E2E 도구(Playwright 등) | **도입하지 않는다** | 층 1(AC-052)·확장 삽입(AC-040)의 검증 방법을 PRD가 이미 **"실행 화면 기록"** 으로 지정했다. E2E 하네스 셋업 반나절은 T55 스파이크 하나와 같은 값이다 |
| 성능 예산 자동 검증 | **설정하지 않는다** | NFR "체감 5초"는 PRD 원문이 **"목표 체감이며 측정치 아님"** 이라 명시한다. 대신 `llm_call_log.latency_ms` 의 p50/p95를 T35 리허설에서 **기록**한다 |
| Import 순서 규칙 | **강제하지 않는다** | 위 Style 절 참조 — 위반 개념이 없다 |
