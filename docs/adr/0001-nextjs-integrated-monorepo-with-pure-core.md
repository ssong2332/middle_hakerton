# ADR-0001: Next.js 통합 리포 + 순수 코어 패키지 분리

- Status: **accepted** — 사용자 결정 2026-08-04 (게이트 항목 ①. architect 권고안 그대로 승인, 수정 없음)
- Date: 2026-08-04 (제안) · **2026-08-04 (승인)**
- Owner: architect
- DECISIONS.md entry: #1, #2, **#31(승인 기록)**

## Context

- 마감 **2026-08-21**, 기준일 **2026-08-04** → **17일**. 팀 **4명**(`[FE]` 1 · `[BE-A]` 1 · `[BE-B]` 1 · `[DS]` 1).
- **코드 0줄, 태스크 72건 전부 `todo`**(measured — `docs/Tasks.md` Status 열 grep, 2026-08-04). 지금부터 전부 새로 쓴다.
- 클라이언트가 **2개**다: 웹앱(데모 기본 경로, Planning Decision #3)과 Chrome 확장(2계층, Planning Decision #61).
- **AC-028**이 "코어 엔진이 특정 어댑터에 의존하지 않으며 **동일 인터페이스로 두 어댑터에서 호출**"을 요구하고, **T15**의 판정 방법은 *"코어가 어댑터 코드에 의존하지 않음을 **import 경로로 확인**"* 이다.
- **AC-080④**는 관측 지표 정의가 **경로별로 갈리지 않을 것**을 요구한다 — 같은 정의를 서버(GitHub 경로)와 확장 콘텐츠 스크립트(수동 표시 경로, AC-081③ 브라우저 로컬 처리)가 함께 써야 한다.
- PRD Constraints: *"기술 스택 팀 선호: Next.js(TypeScript) 통합 — **최종 결정은 architect 몫**."*
- Risks 표에 *"백엔드 A/B의 I/O 스키마 불일치 → 통합 단계에서 재작업"* 이 이미 등재돼 있고, 완화가 **"스키마 합의를 첫 태스크(T1)로 고정"** 이다.

즉 이 결정이 풀어야 할 것은 두 가지다 — **(a) 4명이 서로를 기다리지 않을 것**, **(b) AC-028/AC-080④가 검증 가능할 것**.

## Decision

**Next.js 15(App Router) + TypeScript 통합 1리포로 하되, 코어 엔진만 npm workspaces 별도 패키지(`packages/core`)로 분리한다.**

```
apps/web         (Next.js — 화면 + Route Handler 백엔드)
apps/extension   (Chrome MV3)
packages/core    (순수 TypeScript — next/react/@supabase/openai import 금지)
```

`packages/core` 의 순수성은 ESLint `no-restricted-imports` 로 강제하며, 위반은 리뷰 의견이 아니라 **빌드 실패**다.

| Option | Pros | Cons |
|---|---|---|
| **Next.js 통합 + core 별도 패키지** ✅ | 배포 1개·CI 1개·CORS 0. AC-028을 **패키지 경계**로 강제 → import 경로 검증이 자동. 확장이 core를 그대로 번들해 AC-080④가 추가 설정 없이 성립. `[BE-A]`/`[BE-B]` 가 `packages/core/src/steps/` 안에서 파일 단위로 겹치지 않게 분업 가능 | workspaces·`transpilePackages`·tsconfig paths 셋업 **약 30분**. Vercel 모노리포 빌드 설정 1회 필요(**추정** — 확인 수단: T2 스캐폴드 직후 첫 배포) |
| 단일 Next.js 앱 + `src/core/` 디렉터리 | 셋업 0분. 가장 단순 | AC-028의 "import 경로로 확인"이 **컨벤션**일 뿐 강제되지 않는다 — 누군가 `src/core` 안에서 `next/headers` 를 import 해도 빌드가 통과한다. 확장이 웹앱 `src` 안으로 손을 뻗어야 해 경로 별칭이 지저분해진다 |
| FE(Next) / BE(FastAPI 또는 Express) 분리 | 백엔드를 독립 배포·스케일. 백엔드 2명이 프론트 빌드와 무관하게 작업 | **배포 2개·CI 2개·CORS·환경변수 2벌.** 셋업만으로 하루가 사라진다. 코어를 파이썬으로 쓰면 **확장이 AC-081③(브라우저 로컬 지표 계산)을 위해 같은 지표 로직을 TypeScript로 다시 구현**해야 하고, 그 순간 AC-080④("정의가 경로별로 갈리지 않음")가 구조적으로 불가능해진다 |
| Turborepo / Nx 도입 | 캐시된 빌드, 태스크 그래프 | 패키지 3개 규모에서 이득이 없고 학습·설정 비용만 든다 |

## Consequences

- **Positive**
  - **Freeze Point F1**(`packages/core/src/contract.ts`, T1)이 머지되는 순간 4명이 병렬로 갈라진다: `[FE]`는 계약만 보고 목 데이터로 전 화면을, `[BE-A]`는 `steps/{c1,c2}`, `[BE-B]`는 `steps/{c4,c6,c7}` 를 동시에.
  - AC-028의 판정이 **자동화**된다(`npm run lint` / `npm ls`).
  - AC-080④가 **파일 1개 공유**로 성립한다 — `packages/core/src/observation/indicators.ts`.
  - 배포 단위가 1개라 롤백도 1개다(ADR-0002·Deployment 절과 맞물린다).
- **Negative / 수용한 대가**
  - 프론트와 백엔드를 **독립적으로 스케일·배포할 수 없다.** NFR Scale(동시 10명)에서 손실은 0이지만, Planning Decision #27(실사용자 확장)이 실제로 진행되면 재구성이 필요해질 수 있다.
  - 초기 셋업 30분. Vercel 모노리포 빌드가 첫 배포에서 한 번 걸릴 수 있다.
  - `packages/core` 가 순수하려면 LLM·저장소를 **인자로 주입**받아야 해서 함수 시그니처가 조금 길어진다.
- **Follow-ups required**
  1. **T2**: workspaces 스캐폴드 + `transpilePackages` + ESLint `no-restricted-imports` 규칙을 `packages/core` 에 적용. **규칙이 실제로 빌드를 실패시키는지 위반 코드 1줄로 1회 확인**하고 출력을 첨부한다(규칙은 있는데 안 걸리는 상태가 최악이다).
  2. **T2 직후**: Vercel 모노리포 빌드 1회 성공을 확인한다(추정 항목의 해소).
  3. **T1**: `contract.ts` 를 M0(08-04~06) 안에 머지한다. 이것이 늦으면 4명 전원이 멈춘다.
  4. **T15**: `import` 경로 검증 출력을 AC-028 근거로 첨부한다.

---

## Addendum A — 대상 버전을 Next.js 15 → **16** 으로 올린다 (2026-08-04, 사용자 결정)

> ADR 본문은 **immutable** 이므로 위 Decision 절의 *"Next.js 15(App Router)"* 문구를 고치지 않고 여기에 덧붙인다. **결정의 구조는 그대로다** — 통합 1리포 · `packages/core` 분리 · ESLint 강제 · Option 비교 전부 유효하며, **바뀐 것은 프레임워크의 메이저 버전뿐**이다. 이 문서를 읽을 때는 본문의 "15"를 **"16"** 으로 읽는다.

- **DECISIONS.md entry**: **#37** (#1·#31의 본문은 append-only 규칙에 따라 미수정)
- **왜**: T2 스캐폴드 직후 `npm audit --omit=dev` 에서 **high severity 3건** — next 15가 번들한 **`postcss`·`sharp`** (measured, 오케스트레이터가 2026-08-04 직접 실행·재현). 해소 경로가 **`next@16` breaking 업그레이드뿐**이었고, *"15 유지 + 위험 수용"* vs *"16 업그레이드"* 중 **사용자가 16을 명시적으로 선택**했다.
- **대상 버전**: `next@16` — 2026-08-04 기준 `latest` 는 **16.3.0**(measured, architect가 `registry.npmjs.org/next/latest` 직접 조회).
- **현재 상태**: 🔴 **문서만 갱신됐다.** `apps/web/package.json:15` 는 여전히 `"next": "^15.5.22"`(measured). 설치·breaking change 대응은 **implementer**가 수행한다.
- **미확인(추정)**: ① 업그레이드가 3건을 실제로 **0건**으로 만드는지 ② breaking change가 스캐폴드·Vercel 빌드에 걸리는지. **확인 수단**: 설치 후 `npm audit --omit=dev` 재실행 + `npm run build` + 첫 Vercel 배포 출력 첨부.
- **추가 Follow-up**: Follow-up 2(*"Vercel 모노리포 빌드 1회 성공 확인"*)는 **16 기준으로 다시** 확인한다 — 15에서 통과했더라도 근거가 되지 않는다.
