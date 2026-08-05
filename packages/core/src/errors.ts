/**
 * `CoreError` 계열 + `ErrorCode` — `docs/Architecture.md:127` 폴더 구조가 지정한 자리.
 *
 * 🔴 **T2 스캐폴드의 범위는 형태(클래스 shape)까지다.** `packages/core`와 `apps/web/lib`는
 * **던지기만** 하고 잡는 곳은 `apps/web/lib/http.ts`의 `withApi()` 한 곳뿐이다
 * (`docs/Architecture.md` Error Handling · `docs/CodingRules.md` Error Handling "던지는 쪽 / 잡는 쪽").
 * 각 에러를 **언제 던지는지**(판정 로직)는 그 에러를 처음 던지는 태스크(T4·T5·T7·T10·T18…)가 정한다 —
 * 여기서는 어떤 발생 조건도 지어내지 않는다.
 *
 * `code`/`retryable` 값의 어휘는 `docs/API.md` "Error codes" 표와 1:1로 대응한다.
 */

/** `docs/API.md` "Error codes" 표의 `code` 열과 1:1로 대응한다. */
export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID_CREDENTIALS'
  | 'NOT_FOUND'
  | 'CONFLICT_PROTOCOL_AUTHORED'
  | 'LLM_TIMEOUT'
  | 'LLM_UNAVAILABLE'
  | 'LLM_MALFORMED'
  | 'QUOTA_EXCEEDED'
  | 'EXTERNAL_FETCH_FAILED'
  | 'INTERNAL';

/**
 * 공통 베이스. `apps/web/lib/http.ts`의 `withApi()`가 이 타입으로 잡아
 * `{ error: { code, message, retryable } }` 봉투로 변환한다(`docs/API.md` Conventions).
 */
export abstract class CoreError extends Error {
  abstract readonly code: ErrorCode;
  abstract readonly retryable: boolean;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** `docs/API.md` `VALIDATION_FAILED`(400) — zod 파싱 실패. HTTP 경계 소유(`withApi()`)라 core는 던지기만 한다. */
export class ValidationError extends CoreError {
  readonly code = 'VALIDATION_FAILED' as const;
  readonly retryable = false as const;
}

/** `docs/API.md` `LLM_UNAVAILABLE`(503) — 폴백조차 없을 때(`LLMClient.complete()` 실패 계약 표 참조). */
export class LLMUnavailableError extends CoreError {
  readonly code = 'LLM_UNAVAILABLE' as const;
  readonly retryable = true as const;
}

/** `docs/API.md` `QUOTA_EXCEEDED` — 🔴 실제로는 200 + `source:'fallback'`이 우선이며(AC-041), 이 에러는 폴백조차 없을 때의 잔여 경로다. */
export class QuotaExceededError extends CoreError {
  readonly code = 'QUOTA_EXCEEDED' as const;
  readonly retryable = false as const;
}

/** `docs/API.md` `NOT_FOUND`(404) — 대상 없음(타인 소유 포함, RLS 결과). */
export class NotFoundError extends CoreError {
  readonly code = 'NOT_FOUND' as const;
  readonly retryable = false as const;
}

/** `docs/API.md` `CONFLICT_PROTOCOL_AUTHORED`(409) — AC-074④, 상대가 규약을 직접 작성함. */
export class ConflictError extends CoreError {
  readonly code = 'CONFLICT_PROTOCOL_AUTHORED' as const;
  readonly retryable = false as const;
}
