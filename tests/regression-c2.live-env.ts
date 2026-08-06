/**
 * `tests/regression-c2.live.test.ts`(T11 라이브 실행 진입점)가 필요로 하는 환경 변수 판정 로직 —
 * 순수 함수로 분리해 `.env`·실제 LLM 호출 없이 단위 테스트로 검증할 수 있게 한다.
 *
 * 🔴 reviewer 후속 Major B(`docs/Tasks.md` T11) — 이전에는 필요한 환경 변수가 없으면 `describe.skipIf`가
 * 조용히 skip만 하고 어떤 변수가 빠졌는지 알려주지 않았다. `getMissingLiveEnvKeys`가 누락된 키를
 * 명시적으로 반환하고, `describeLiveEnvSkipReason`이 그 목록을 사람이 읽는 문자열로 만든다 — 호출부가
 * 이 문자열을 테스트 제목에 넣어 vitest 실행 요약(skip된 테스트도 제목이 보인다)에서 바로 보이게 한다.
 *
 * 🔴 T11 후속 fix(2026-08-07) — `tests/regression-c2.live.test.ts`가 `createOpenAiLLMClient()`를
 * 직접 호출하던 것을 provider-switching 팩토리 `createLLMClient()`(`apps/web/lib/llm/create-client.ts`)를
 * 쓰도록 고치면서, 여기 필요 환경 변수 목록도 provider-aware하게 맞춘다 — `LLM_PROVIDER`를
 * `create-client.ts`와 동일한 방식으로 읽는다(`=== 'gemini'`일 때만 Gemini, 그 외/미설정은 OpenAI가
 * 기본값). OpenAI는 여전히 프로덕션 기본 경로다 — 이 분기는 로컬 테스트 편의일 뿐 아키텍처 변경이
 * 아니다(`create-client.ts` 파일 헤더 주석과 같은 성격).
 */

/** 두 provider 모두 공통으로 요구하는 환경 변수(Supabase·요청 상한). */
const SHARED_LIVE_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'MAX_LLM_CALLS_PER_USER_PER_DAY',
  'MAX_LLM_CALLS_GLOBAL_PER_DAY',
] as const;

/** `createOpenAiLLMClient()`가 요구하는 provider-specific 환경 변수. */
const OPENAI_LIVE_ENV = ['OPENAI_API_KEY', 'OPENAI_MODEL'] as const;

/** `createGeminiLLMClient()`가 요구하는 provider-specific 환경 변수(`.env.example:37-43`). */
const GEMINI_LIVE_ENV = ['GEMINI_API_KEY', 'GEMINI_MODEL'] as const;

/** `createOpenAiLLMClient()`(userId 생략 — 요청 상한은 전역만 적용, T4 JSDoc 참조)가 요구하는
 * 최소 환경 변수. `LLM_PROVIDER`가 설정되지 않았거나 `'gemini'`가 아닐 때(기본값, OpenAI)의
 * 목록이다 — 하위 호환을 위해 이 이름으로 계속 내보낸다. Gemini일 때 실제로 필요한 목록은
 * `getRequiredLiveEnvKeys()`를 통해 얻는다. */
export const REQUIRED_LIVE_ENV = [...OPENAI_LIVE_ENV, ...SHARED_LIVE_ENV] as const;

/** `env.LLM_PROVIDER`에 따라 실제로 필요한 환경 변수 목록을 고른다 — `create-client.ts`의
 * `if (process.env.LLM_PROVIDER === 'gemini')` 분기와 동일한 판정 기준. */
export function getRequiredLiveEnvKeys(
  env: Record<string, string | undefined>,
): readonly string[] {
  return env.LLM_PROVIDER === 'gemini'
    ? [...GEMINI_LIVE_ENV, ...SHARED_LIVE_ENV]
    : [...OPENAI_LIVE_ENV, ...SHARED_LIVE_ENV];
}

/** `env`에서 `required`(기본값: `env.LLM_PROVIDER`로 판정한 provider-aware 목록) 중 없거나 빈
 * 문자열인 키만 목록으로 반환한다. */
export function getMissingLiveEnvKeys(
  env: Record<string, string | undefined>,
  required: readonly string[] = getRequiredLiveEnvKeys(env),
): string[] {
  return required.filter((key) => !env[key]);
}

/** `missing`이 비어 있으면 `''`(스킵 사유 없음 = 라이브 실행 조건 충족). 그렇지 않으면 누락된
 * 키 이름을 그대로 나열한 사람이 읽는 문자열을 반환한다. */
export function describeLiveEnvSkipReason(missing: string[]): string {
  if (missing.length === 0) return '';
  return `SKIPPED — 누락된 환경변수: ${missing.join(', ')} (.env에 채운 뒤 다시 실행)`;
}
