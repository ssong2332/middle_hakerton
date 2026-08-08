# 크로스보더 협업 중재 서비스 (Cross-Border Collaboration Mediator)

> "번역기가 아니라, 국경 위에서 무너지는 신뢰를 잡아주는 중재자."
> AI는 감정과 긴급성을 지우지 않는다. 형태만 바꿔서 상대가 알아볼 수 있게 만든다.

시차·언어·문화·조직이라는 국경(border)을 넘는 업무 메시지에서 **감정과 긴급성을 지우지 않고 형태만 바꿔 전달**해, 협업 중 무너지는 신뢰를 붙잡아 주는 human-in-the-loop 중재 서비스입니다. 단순 번역이 아니라, 사람이 최종 확인·승인한 뒤에만 메시지가 나가는 것을 원칙으로 합니다.

## 개발 진행 상태 (반드시 먼저 읽어주세요)

🟡 **모노리포 스캐폴드와 코어 I/O 계약은 존재하지만, 제품 기능(로그인·C1~C7 등)은 대부분 아직 구현 전(`todo`)입니다.** `apps/web`(Next.js) · `apps/extension`(Chrome 확장) · `packages/core`(엔진)에 실제 소스가 있으나, 화면은 대부분 빈 스캐폴드이며 백엔드 API·인증·LLM 연동은 아직 붙지 않았습니다.

| 항목 | 상태 |
|---|---|
| PRD (docs/PRD.md) | 완료 (v3.2) |
| UX 설계 (docs/UX.md) | 완료 (v6.0) |
| Architecture (docs/Architecture.md) | 완료 — 기술 기반 6항목 사용자 승인 완료(2026-08-04), 상세는 문서 참조 |
| 구현 태스크 (docs/Tasks.md) | 총 72건 — **`done` 2건**(T1 코어 I/O 계약 동결, T2 Next.js/Vite 모노리포 스캐폴드) · **`todo` 70건**(2026-08-04 기준 실측, `docs/Tasks.md` Status 열) |
| 목표 제출일 | 2026-08-21 |

따라서 아래 "핵심 기능"은 **PRD·UX에 명세된 예정 기능**이며, T1·T2를 제외하면 현재 동작하지 않습니다. 이 문서의 어떤 문장도 "핵심 기능(C1~C7 등)이 이미 동작한다"는 뜻으로 읽혀서는 안 됩니다.

## 해커톤 맥락

- 트랙: **Borderless Teamwork with AI**
- 주제: AI 기술로 국경을 넘는 협업을 가능하게 한다
- 목표 제출일: **2026-08-21**

## 해결하려는 문제 (Border 01~04)

기존 협업 도구는 톤을 "다듬는(polish)" 데 그치지만, 이 제품은 마감일·수치·필수 액션처럼 **잃으면 안 되는 정보를 먼저 지키는 것(preserve)**을 목표로 합니다.

| Border | 문제 | 대응 기능 |
|---|---|---|
| Border 01 — 시차 | "지금 당장"인 요청이 상대의 새벽/퇴근 후에 도착해 신뢰가 깎인다 | C1 긴급도 3단계 분류(근거+override) |
| Border 02 — 언어 | 비모국어로 쓴 메시지가 의도와 다르게 읽히고, 발신자는 확인할 방법이 없다 | C4 백트랜슬레이션 미리보기 + C5 용어 사전 |
| Border 03 — 문화 | 같은 문장이 한쪽에서는 명확함, 다른 쪽에서는 무례함으로 읽힌다 | C2 톤 변환 + C3 자기신고 프로필(diff 학습) |
| Border 04 — 조직 | 하소연이 조직의 트래커에 들어가지 못하고 감정으로만 소비된다 | C6 하소연→태스크 티켓 변환 + C7 결정사항 자동 요약 |

**부작용 방어 (PS-005 — 중재 자체가 만드는 부작용, 긴급성 희석)**: 톤을 부드럽게 만드는 과정에서 "내일까지 반드시"가 "가능하시면 확인 부탁드립니다"로 희석될 수 있습니다. 이를 막기 위해 마감일·수치·필수 액션 같은 보존 대상을 **먼저 추출해 고정한 뒤 톤만 변환**하고, 사람의 명시적 승인 없이는 아무것도 발송되지 않습니다(human-in-the-loop).

## 핵심 기능 (P0/P1 중심, 예정 — 구현 전)

| 기능 | 설명 | 해결하는 Border | 우선순위 |
|---|---|---|---|
| C1 긴급도 분류 | CRITICAL/NORMAL/LOW 판정 근거 표시 + 사용자 override | Border 01 | P0 |
| C2 톤 변환 + 긴급도 보존 필터 | 톤만 바꾸고 마감·수치·액션은 보존, 오해 사전 경고 제공 | Border 03, PS-005 | P0 |
| C4 백트랜슬레이션 미리보기 | 변환문을 원어로 되돌려 발신자가 스스로 검증(1차 안전장치, 완전한 검증은 아님) | Border 02 | P0 |
| 2패널 비교 + 승인 후 전송 | 원문/변환문/변환 이유를 나란히 표시, 명시적 승인 없이는 미발송 | Border 01~04 전체 | P0 |
| C3 자기신고 프로필 + diff 학습 | 국적이 아니라 본인 신고와 3회 이상 관찰된 수정 패턴만 근거로 개인화 | Border 03 | P1 |
| C5 프로젝트 용어 사전 | 등록 용어·호칭은 의역·추측 없이 원문 유지 | Border 02 | P1 |
| C6 하소연→태스크 티켓 변환 | [문제 정의]/[영향·리스크]/[요청 사항]/[우려 수준] 4섹션, 감정은 삭제하지 않고 보존 | Border 04 | P1 |
| C7 결정사항 자동 요약 | 결정사항/담당자/기한 표, 근거 없는 항목은 "미정" | Border 04 | P1 |

전체 기능 목록과 수용 기준(Acceptance Criteria)은 `docs/PRD.md`의 MVP Scope를 참고하세요.

## 차별점

이 제품은 "세상에 없는 아이디어"가 아닙니다. Tonero, checktone.app, Slack AI, Superhuman "Instant Reply" 등 유사한 목적의 제품이 이미 존재합니다(`docs/PRD.md` Differentiation & Market Reality 섹션에 실명 비교표가 있습니다). 모델·프롬프트 자체는 해자가 아니며, 차별점은 제품화 층위에 있습니다.

- **KEY 1 — "톤 교정"이 아니라 "번역 손실 방지"**: 경쟁 제품 대부분은 다듬기(polish)를 팝니다. 이 제품은 무엇이 사라지면 안 되는지를 먼저 고정한 뒤 톤을 바꿉니다(preserve).
- **KEY 2 — "추론으로 시작하고, 합의로 확정한다"**: 상대의 성향을 추론하되, 그 근거를 보여주고 사용자가 확정한 것만 규칙으로 저장합니다. 조용히 적용하지 않습니다.
- **KEY 3 — 개인 간이 아니라 "조직 간" 마찰**: 감정으로 소비되는 하소연을 조직이 다룰 수 있는 티켓으로 바꾸는 데 초점을 둡니다.

## 문서

| 문서 | 내용 |
|---|---|
| [docs/PRD.md](docs/PRD.md) | 요구사항, 문제 정의, 경쟁 비교, MVP 범위, 수익 모델 |
| [docs/UX.md](docs/UX.md) | 사용자 플로우, 화면 명세 |
| [docs/Tasks.md](docs/Tasks.md) | 구현 태스크 목록과 진행 상태 |
| [docs/TestCases.md](docs/TestCases.md) | 테스트 케이스 |
| [docs/DemoScript.md](docs/DemoScript.md) | 발표 데모 대본 |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | 릴리스 이력 |

## 설정

이 프로젝트는 로컬 비밀값 관리를 위해 `.env` 파일을 사용합니다. `.env`는 git에 커밋되지 않으며, `.env.example`만 저장소에 포함됩니다.

`.env.example`에 정의된 항목(플레이스홀더 이름만 표기, 실제 값 없음 — 근거: `.env.example`):

| 변수 | 용도 |
|---|---|
| `OPENAI_API_KEY` | OpenAI API 키. 서버 전용 — `NEXT_PUBLIC_` 접두사를 붙이지 않는다(붙이면 클라이언트 번들에 노출됨) |
| `OPENAI_MODEL` | 사용할 OpenAI 모델명. 코드에 하드코딩하지 않고 이 값으로 등급 조정 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL. 클라이언트에서 쓰이므로 `NEXT_PUBLIC_` 접두사 필요 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key. 클라이언트 노출 전제(RLS가 인가를 강제) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key. 서버 전용, RLS 우회 — `apps/web/lib/supabase/server.ts`의 `createServiceClient()` 한 곳에서만 사용 |
| `MAX_LLM_CALLS_PER_USER_PER_DAY` | 사용자당 일일 LLM 호출 상한 |
| `MAX_LLM_CALLS_GLOBAL_PER_DAY` | 전역 일일 LLM 호출 상한 |
| `LLM_PROVIDER` | 🔴 선택·로컬 테스트 전용(정식 아키텍처 결정 아님). `'gemini'`로 설정하면 `apps/web/lib/llm/gemini.ts` 구현체를 쓴다. 그 외/미설정이면 항상 OpenAI. **Vercel 프로덕션에는 설정하지 않는다** |
| `GEMINI_API_KEY` | 🔴 선택·로컬 테스트 전용. `LLM_PROVIDER=gemini`일 때만 쓰이는 서버 전용 키. **Vercel 프로덕션에는 설정하지 않는다** |
| `GEMINI_MODEL` | 🔴 선택·로컬 테스트 전용. 사용할 Gemini 모델명(예: `gemini-2.5-flash`). `LLM_PROVIDER=gemini`일 때만 쓰인다. **Vercel 프로덕션에는 설정하지 않는다** |
| `VITE_APP_ORIGIN` | Chrome 확장(T56)이 읽는 우리 앱 자신의 origin(예: `http://localhost:3000`). `apps/extension`의 Vite 빌드가 `POST /api/mediate` 절대 URL과 `manifest.json`의 `externally_connectable.matches`/`host_permissions`를 채우는 데 쓴다 |
| `NEXT_PUBLIC_EXTENSION_ID` | Chrome 확장(T56)의 ID. `apps/web/app/extension/connect/page.tsx`가 `chrome.runtime.sendMessage(EXTENSION_ID, ...)`로 로그인 토큰을 확장에 넘길 때 대상으로 쓴다. `chrome://extensions`에서 개발자 모드로 로드한 뒤 복사해 채운다 |

Supabase URL/키, OpenAI 키 등 실제 값은 이 저장소에 없습니다 — 팀 내부에서 직접 전달받아 로컬 `.env`에 채워 넣으세요.

## 설치 및 실행

Node.js 22(이상 권장 — CI가 22를 사용, `.github/workflows/ci.yml`) 및 npm workspaces 기반 모노리포입니다.

```bash
# 의존성 설치 (루트에서 한 번, 모든 workspace 포함)
npm install

# .env 준비
cp .env.example .env   # 값은 위 표를 참고해 직접 채워 넣기

# 웹앱 개발 서버 (apps/web, Next.js)
npm run dev --workspace apps/web

# 브라우저 확장 빌드 (apps/extension, Vite → dist)
npm run build:ext

# 코어/전체 검증
npm run lint
npm run typecheck
npm test
npm run build          # apps/web 프로덕션 빌드
```

⚠️ 위 명령은 `package.json`의 scripts와 일치하도록 확인했습니다(devDependency 실행이나 기능 완결을 보장하지 않습니다). 현재 대부분의 화면·API는 스캐폴드 단계이므로 `npm run dev`로 서버는 뜨지만 로그인·C1~C7 등 실제 기능은 아직 동작하지 않습니다(위 "개발 진행 상태" 참고).

## 기술 스택

`docs/Architecture.md`에서 기술 기반 6항목이 2026-08-04 사용자 승인으로 확정되었습니다. 상세 근거·대안 비교는 `docs/Architecture.md` Tech Stack 및 `docs/adr/`를 참고하세요.

- 언어: TypeScript(strict)
- 웹앱: Next.js 16(App Router) — 프론트 + Route Handler 백엔드 통합
- 모노리포: npm workspaces (`apps/web`, `apps/extension`, `packages/core`)
- 코어 엔진: `packages/core` — 프레임워크·DB·HTTP 클라이언트 의존성 0
- DB 엔진/호스팅: PostgreSQL 15+ / Supabase 관리형 Postgres(Free)
- 인증: Supabase Auth(이메일+비밀번호) + RLS
- AI 모델 호출: OpenAI API(백엔드 Route Handler 경유, 키 비노출)
- 브라우저 확장: Chrome Manifest V3, Vite(라이브러리 모드)
- 테스트: Vitest + `@testing-library/react`
- 린트/포맷: ESLint(flat config) + Prettier
- CI: GitHub Actions(lint → typecheck → test → build)
- 배포: Vercel Hobby (`*.vercel.app` 기본 서브도메인)
