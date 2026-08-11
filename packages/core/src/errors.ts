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
  | 'CONFLICT_DUPLICATE_ENTRY'
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

/**
 * `docs/API.md` `LLM_UNAVAILABLE`(503) — 폴백조차 없고, **원인이 실제 호출 실패**(네트워크·5xx·
 * 응답이 `LLM_MALFORMED`로 검증 실패)일 때(`LLMClient.complete()` 실패 계약 표 참조).
 * `retryable: true` — 재시도하면 성공할 수도 있다. 🔴 원인이 요청 상한 초과(OpenAI를 아예
 * 호출하지 않음)라면 이 에러가 아니라 `QuotaExceededError`다(2026-08-04 정정 — 아래 참조).
 */
export class LLMUnavailableError extends CoreError {
  readonly code = 'LLM_UNAVAILABLE' as const;
  readonly retryable = true as const;
}

/**
 * `docs/API.md` `QUOTA_EXCEEDED` — 🔴 실제로는 200 + `source:'fallback'`이 우선이며(AC-041),
 * 이 에러는 **요청 상한 초과로 OpenAI를 아예 호출하지 않았고 폴백도 없을 때**의 잔여 경로다
 * (`LLMClient.complete()` 실패 계약 표 참조). `retryable: false` — 상한은 오늘 안에 재시도해도
 * 동일하게 실패한다. 호출 자체가 실패한 경우(네트워크·5xx·응답 검증 실패)는 `LLMUnavailableError`다
 * — 이 구분은 2026-08-04에 정정됐다(이전에는 `client.ts`가 두 원인 모두 `LLMUnavailableError`
 * 하나로 뭉뚱그려 이 JSDoc과 모순됐다).
 */
export class QuotaExceededError extends CoreError {
  readonly code = 'QUOTA_EXCEEDED' as const;
  readonly retryable = false as const;
}

/**
 * `docs/API.md` `LLM_MALFORMED`(502) — LLM 응답이 **step별 스키마 검증**에 실패했을 때.
 * `apps/web/lib/llm/openai.ts`의 step-agnostic 검증(문자열 존재 + JSON 파싱 가능 여부)은
 * 이미 통과했지만, 필드 의미(예: C4가 기대하는 `{ backTranslation: string }` 형태)는 각
 * 스텝이 검증한다(`packages/core/src/llm/client.ts` `LLMClient` JSDoc "step별 응답 스키마…
 * 그 태스크들이 정한다"). 🔴 이 클래스는 T2가 만든 4개(`ValidationError` 등)에 없던 것을
 * 처음 던지는 태스크(T5, C4)가 추가한다 — 파일 상단 주석의 "그 에러를 처음 던지는 태스크가
 * 정한다"가 이 추가의 근거다. `retryable: true` — 같은 입력에도 모델이 다른(정상) 응답을
 * 낼 수 있어 재시도가 의미 있다(`docs/API.md:43`).
 */
export class LLMMalformedResponseError extends CoreError {
  readonly code = 'LLM_MALFORMED' as const;
  readonly retryable = true as const;
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

/**
 * `docs/API.md` "GET / POST /api/dictionary · PUT / DELETE /api/dictionary/{id}" 409(중복
 * `sourceText`) — AC-016, T23이 처음 던진다(파일 상단 주석 "그 에러를 처음 던지는 태스크가
 * 정한다"). `ConflictError`(상대가 규약을 직접 작성함, AC-074④)와는 발생 조건이 전혀 다른
 * 별개의 409라 코드를 공유하지 않는다 — 같은 용어/실명(entryType별 대소문자 무시 비교)을
 * 중복 등록하려 할 때만 던진다.
 */
export class DuplicateEntryError extends CoreError {
  readonly code = 'CONFLICT_DUPLICATE_ENTRY' as const;
  readonly retryable = false as const;
}

/**
 * `docs/API.md` `EXTERNAL_FETCH_FAILED`(502) — T64가 처음 던진다(`POST /api/enrichment/fetch`,
 * AC-065). GitHub 공개 프로필/활동 조회가 네트워크 오류·5xx·rate limit 등으로 실패했을 때.
 * `retryable: true` — 일시적 실패일 수 있어 재시도가 의미 있다(LLM 쪽 `LLMUnavailableError`와
 * 같은 판단 — 외부 서비스 호출 실패는 대체로 재시도 가능하다고 본다).
 */
export class ExternalFetchFailedError extends CoreError {
  readonly code = 'EXTERNAL_FETCH_FAILED' as const;
  readonly retryable = true as const;
}
