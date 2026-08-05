/**
 * `tests/regression-c2.live.test.ts`(T11 라이브 실행 진입점)가 필요로 하는 환경 변수 판정 로직 —
 * 순수 함수로 분리해 `.env`·실제 LLM 호출 없이 단위 테스트로 검증할 수 있게 한다.
 *
 * 🔴 reviewer 후속 Major B(`docs/Tasks.md` T11) — 이전에는 필요한 환경 변수가 없으면 `describe.skipIf`가
 * 조용히 skip만 하고 어떤 변수가 빠졌는지 알려주지 않았다. `getMissingLiveEnvKeys`가 누락된 키를
 * 명시적으로 반환하고, `describeLiveEnvSkipReason`이 그 목록을 사람이 읽는 문자열로 만든다 — 호출부가
 * 이 문자열을 테스트 제목에 넣어 vitest 실행 요약(skip된 테스트도 제목이 보인다)에서 바로 보이게 한다.
 */

/** `createOpenAiLLMClient()`(userId 생략 — 요청 상한은 전역만 적용, T4 JSDoc 참조)가 요구하는
 * 최소 환경 변수. 하나라도 없으면 라이브 실행을 시도하지 않는다(`.env.example` 참조). */
export const REQUIRED_LIVE_ENV = [
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'MAX_LLM_CALLS_PER_USER_PER_DAY',
  'MAX_LLM_CALLS_GLOBAL_PER_DAY',
] as const;

/** `env`에서 `required`(기본값 `REQUIRED_LIVE_ENV`) 중 없거나 빈 문자열인 키만 목록으로 반환한다. */
export function getMissingLiveEnvKeys(
  env: Record<string, string | undefined>,
  required: readonly string[] = REQUIRED_LIVE_ENV,
): string[] {
  return required.filter((key) => !env[key]);
}

/** `missing`이 비어 있으면 `''`(스킵 사유 없음 = 라이브 실행 조건 충족). 그렇지 않으면 누락된
 * 키 이름을 그대로 나열한 사람이 읽는 문자열을 반환한다. */
export function describeLiveEnvSkipReason(missing: string[]): string {
  if (missing.length === 0) return '';
  return `SKIPPED — 누락된 환경변수: ${missing.join(', ')} (.env에 채운 뒤 다시 실행)`;
}
