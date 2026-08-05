# Changelog

Owner: docs agent (see AGENTS.md). Format: [Keep a Changelog](https://keepachangelog.com/), newest first.
Version bumps (semantic): **major** = a change that breaks existing users (removed/incompatible behavior, migration required); **minor** = a new user-visible feature or capability; **patch** = a fix or documentation-only change. The docs agent picks the bump by this rule when opening a release section — never ad hoc.

## [Unreleased]
### Added
- 코어 I/O 계약(Freeze Point F1) 확정 — `packages/core/src/contract.ts`에 파이프라인 입출력 스키마(`urgency`, `reason`, `transformed`, `preserved[]`, `backTranslation`, `warnings[]`, `misreadRisks[]` 등) 및 판별 유니온을 문서화·동결 (T1, AC-027/AC-043/AC-064)
- Next.js 16 + npm workspaces 모노리포 스캐폴드 — `apps/web`(App Router), `apps/extension`(Manifest V3 + Vite), `packages/core`(프레임워크 의존성 0인 엔진 패키지) 3-workspace 구조 (T2, AC-028)
- Supabase 프로젝트 연동 확정, `.env.example`을 실제 7개 환경변수로 갱신 — `OPENAI_API_KEY`, `OPENAI_MODEL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `MAX_LLM_CALLS_PER_USER_PER_DAY`, `MAX_LLM_CALLS_GLOBAL_PER_DAY` (T3, AC-031)
- GitHub Actions CI 파이프라인 — lint → typecheck → test → build(web) → build(extension) (`.github/workflows/ci.yml`)

### Changed
- README.md 환경변수 설정 표를 위 7개 항목으로 동기화, "실행 가능한 소스코드 없음" 서술을 현재 스캐폴드 상태로 갱신

## [0.1.0] - {{YYYY-MM-DD}}
### Added
- Initial release.
