/**
 * 🔴 **로컬 테스트 전용 도구 — 정식 아키텍처 결정이 아니다.**
 *
 * `LLMClient`(`packages/core/src/llm/client.ts`) 인터페이스의 **두 번째 구현체**다.
 * `docs/Architecture.md`가 정한 프로덕션 경로는 여전히 `apps/web/lib/llm/openai.ts`
 * (OpenAI) 하나뿐이며, Vercel 프로덕션 배포에는 이 파일을 활성화하는 환경변수
 * (`LLM_PROVIDER=gemini`)를 설정하지 않는다 — 즉 프로덕션은 항상 OpenAI로 간다
 * (스위치는 `apps/web/lib/llm/create-client.ts`).
 *
 * 팀 OpenAI API 키를 아직 쓸 수 없는 동안 **개발자 로컬 환경에서만** 파이프라인을 실행해
 * 보기 위한 임시 어댑터다. `docs/DECISIONS.md`에 정식 항목으로 기록되지 않았다 — architect가
 * 이 파일을 아키텍처 결정으로 승격할지 여부를 별도로 판단해야 한다.
 *
 * 캐시(`llm_cache`) → 실호출(Gemini) → 폴백(`fallback-responses.ts`) 3단 해석과 요청 상한(AC-041)은
 * `openai.ts`와 **동일한 계약**을 따른다(`packages/core/src/llm/client.ts` `LLMClient` JSDoc
 * "실패 계약" 표). 캐시 조회/저장(`storage.ts`), 요청 상한 판정(`rate-limit.ts`), 캐시 키 계산
 * (`cache-key.ts`)은 provider-agnostic하게 이미 분리돼 있으므로 그대로 재사용하고 여기서
 * 다시 구현하지 않는다 — 이 파일이 새로 구현하는 것은 **Gemini SDK(`@google/genai`) 실호출과
 * 그 응답의 최소 검증뿐**이다.
 *
 * 🔴 **의존성**: `@google/genai`(공식 Google Gen AI SDK, 신버전 — 구버전
 * `@google/generative-ai`는 쓰지 않는다). `apps/web/package.json`에 추가했다. 로컬 테스트
 * 전용이라는 성격상 이 의존성이 정식 기술 스택 결정(`docs/DECISIONS.md`)에 해당하는지는
 * architect 판단이 필요하다 — implementer가 임의로 DECISIONS.md에 기록하지 않는다.
 *
 * AC-030과 동일한 원칙(키는 서버에만) — `GEMINI_API_KEY`는 이 서버 전용 모듈에서만 읽는다.
 * `NEXT_PUBLIC_` 접두사가 없어 클라이언트 번들에 실리지 않는다.
 */
import { ApiError, GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  LLMUnavailableError,
  QuotaExceededError,
  findFallbackResponse,
  type FallbackResponseEntry,
  type LLMClient,
  type LLMResponse,
  type LLMStep,
} from '@cross-border/core';
import { createServiceClient } from '../supabase/server';
import { buildCacheKey } from './cache-key';
import { checkRequestLimit, readRateLimitThresholds, type RateLimitResult } from './rate-limit';
import {
  lookupCache,
  recordCacheHit,
  saveCacheEntry,
  recordCallLog,
  type CallOutcome,
} from './storage';

/**
 * 🔴 `openai.ts`의 `REQUEST_TIMEOUT_MS`(3000ms, PRD NFR "체감 5초" 근거)와 **다른 값이어야
 * 한다** — 이 파일(`gemini.ts`)에 그 값을 그대로 옮겨 쓰면 안 된다.
 *
 * 과거 이 주석은 `httpOptions.timeout`이 "알려진 이슈(googleapis/js-genai#1277)로 항상
 * 보장되지는 않는다"며 3000ms를 "소프트 타깃, best-effort"로 취급했다 — **이는 설치된 SDK
 * 버전(`@google/genai@2.15.0`)에서는 틀렸다.** 실제로는 두 겹으로 엄격하게 강제된다:
 *
 * 1. **클라이언트 SDK가 강제한다.** `node_modules/@google/genai/dist/node/index.cjs` 약
 *    13882번째 줄에서 `setTimeout(() => abortController.abort(), httpOptions.timeout)`로
 *    `AbortController`에 연결해 정확히 그 시간에 요청을 중단시킨다.
 * 2. **Gemini API 서버 자신이 하한을 강제한다(실측, 2026-08-06 진단 세션).** `timeout`을
 *    10000ms 미만으로 설정해 실제 API를 호출하면, 생성이 시작되기도 전에 매번
 *    `HTTP 400 INVALID_ARGUMENT`로 즉시 거부된다 — 에러 메시지 원문:
 *    `"Manually set deadline 3s is too short. Minimum allowed deadline is 10s."`
 *    이전 값(3000ms)에서는 T11 라이브 회귀(`npm run test:regression-c2`, 53건) 중
 *    Gemini로 나간 73번의 `llm.complete('c2', ...)` 호출 **전부**가 이 오류로
 *    `outcome:'fallback'`이 됐다(관측 지연시간 404–2514ms — 실제 3초 타임아웃이 발동한 게
 *    아니라 API 쪽에서 즉시 거부된 패턴과 일치). 그 결과가 4/53 통과였다.
 *
 * 그래서 10000ms(문서화된 서버 하한)를 그대로 쓴다 — 그 이상으로 여유를 더 주지 않는 이유는,
 * 이 값이 어차피 로컬 테스트 전용 어댑터(파일 헤더 주석)의 상한일 뿐 PRD NFR과 무관하고,
 * 하한보다 큰 임의의 여유값을 추가하면 그 값 자체가 왜 그 숫자인지 근거 없는 매직넘버가
 * 되기 때문이다. 10_000 미만으로 낮추면 `gemini.test.ts`의 상수 가드 테스트가 즉시 실패한다.
 */
export const REQUEST_TIMEOUT_MS = 10_000;

/**
 * 🔴 T49 — 무료 티어 API 키의 **분당** 요청 상한(HTTP 429)에 재시도/백오프를 붙인다(실측,
 * 2026-08-07 진단 세션). 위 `REQUEST_TIMEOUT_MS` 수정 이후 T11 라이브 회귀
 * (`npm run test:regression-c2`, `LLM_PROVIDER=gemini`)를 재실행하자 처음 ~8건은
 * `outcome:'live'`로 실제 모델 응답(지연시간 6.5–9.9초)을 받았지만, call #154부터는 거의
 * 전부 `outcome:'fallback', error_code:'HTTP_429'`로 떨어졌다 — Supabase `llm_call_log`
 * 직접 조회로 확인. 그 지연시간이 ~420–470ms로 **균일**했다는 점이 중요하다: 지수 백오프가
 * 조금이라도 있었다면 재시도마다 지연시간이 늘어나는 패턴이 보였어야 하는데, 그런 패턴이
 * 전혀 없었다 — 즉시 거부만 반복됐다.
 *
 * 원인을 `node_modules/@google/genai/dist/node/index.cjs`에서 직접 읽어 확인했다(추측이 아님):
 * - 14022–14025행 `async apiCall(url, requestInit, retryOptions) { if (!retryOptions) {
 *   return fetch(url, requestInit); } ...}` — **`httpOptions.retryOptions` 키 자체가
 *   없으면(undefined) 재시도 로직을 아예 타지 않고 평범한 `fetch` 한 번으로 끝난다.**
 *   `HttpRetryOptions`의 "기본값"(5회, 1초~60초 지수 백오프 등, .d.ts:7103-7118 문서화)은
 *   이 객체가 **존재할 때** 그 내부 필드들에 대한 기본값일 뿐, 객체 자체를 자동으로 만들어
 *   주지 않는다. 즉 opt-in은 필드 값이 아니라 **키의 존재 여부**로 결정된다 — 이전까지
 *   `new GoogleGenAI({ apiKey, httpOptions: { timeout } })`처럼 `retryOptions`를 아예 주지
 *   않았으므로 재시도가 전혀 동작하지 않았다. 관측된 균일 지연시간(즉시 거부, 백오프 없음)과
 *   정확히 일치한다.
 * - 13802–13823행 `request(request)`가 `this.clientOptions.httpOptions`(=생성자에 넘긴
 *   `opts.httpOptions`가 `patchHttpOptions`로 병합된 값)의 `.retryOptions`를 그대로
 *   `unaryApiCall`에 전달한다 — 즉 여기 생성자에서 준 값이 실제로 매 요청까지 흘러간다
 *   (13632–13685행 생성자가 `initHttpOptions`에 `retryOptions`를 채우지 않으므로, 우리가
 *   명시하지 않으면 계속 `undefined`로 남는다).
 * - 13612–13624행 SDK 기본값: `DEFAULT_RETRY_ATTEMPTS=5`(초회 포함), `initialDelay=1.0초`,
 *   `maxDelay=60.0초`, `expBase=2`, `jitter=1`, 재시도 대상 상태코드
 *   `[408,429,500,502,503,504]`(429 포함, 우리 사례와 일치).
 *
 * 아래 값은 그 SDK 기본값을 그대로 베끼지 않고 이 파일의 실제 쓰임(로컬 개발자가 53건짜리
 * `test:regression-c2`를 돌리는 것, 프로덕션 트래픽이 아님)에 맞춰 고른 것이다:
 * - `attempts: 4`(초회 1 + 재시도 3) — SDK 기본 5회보다 적다. 429가 뜬 호출마다 최대
 *   3번씩 재시도가 붙으면, 53건 중 다수가 429였던 이번 실측 사례처럼 대량으로 걸릴 때
 *   전체 실행 시간이 과도하게 늘어난다. 반면 1회조차 재시도하지 않으면(현재 상태) 백오프가
 *   전혀 없어 분당 상한이 절대 안 풀린다 — 3번의 재시도가 "전혀 안 함"과 "SDK 기본 5회"
 *   사이의 절충.
 * - `initialDelay: 3`(초), `maxDelay: 20`(초) — 재시도 간격이 대략 3초 → 6초(2번째,
 *   `expBase` 기본값 2 적용) → 12초(3번째, 20초 상한 미도달)로 커진다. 실패 1건당 최대
 *   추가 지연은 약 21초. Gemini 무료 티어 분당 상한은 일반적으로 60초 창에서 리셋되므로,
 *   한 번의 재시도열만으로 창을 완전히 비우진 못할 수 있지만(21초 < 60초), 회귀 스위트가
 *   순차적으로 여러 케이스를 도는 동안 그 사이 시간이 누적되어 분당 창이 자연스럽게 갱신될
 *   가능성을 높인다 — 완전한 보장이 아니라 부분적 완화라는 점을 명시한다.
 * - `expBase`, `jitter`, 재시도 대상 상태코드는 SDK 기본값(2 / jitter>0 / 429 포함 목록)을
 *   그대로 쓴다 — 굳이 다르게 정할 근거가 없다.
 *
 * 🔴 **프로덕션과 무관** — 프로덕션은 항상 `openai.ts`(`create-client.ts`)로 가고, 그 SDK는
 * 이미 자체 재시도(`maxRetries: 1`, `openai.ts:56-58` 주석 참조 — 이 코드베이스에서 이미 확립된
 * "SDK 기본 재시도 대상에 맡긴다" 선례)를 갖고 있다. 이 파일(`gemini.ts`)은 파일 헤더 주석대로
 * 로컬 테스트 전용이므로, 이 값들도 그 범위를 벗어나지 않는다.
 */
const RETRY_OPTIONS: NonNullable<
  ConstructorParameters<typeof GoogleGenAI>[0]['httpOptions']
>['retryOptions'] = {
  attempts: 4,
  initialDelay: 3,
  maxDelay: 20,
};

export interface GeminiLLMClientDeps {
  supabase?: SupabaseClient;
  geminiClient?: Pick<GoogleGenAI, 'models'>;
  fallbackLookup?: (step: LLMStep, cacheKey: string) => FallbackResponseEntry | undefined;
  /** 지연시간 측정용 시계 — 테스트에서 결정적으로 주입한다. */
  now?: () => number;
}

function inputCharsOf(payload: unknown): number {
  try {
    return JSON.stringify(payload)?.length ?? 0;
  } catch {
    return 0;
  }
}

/**
 * 🔴 `openai.ts`의 `LlmMalformedResponseError`와 같은 역할 — `complete()` 내부에서만 쓰이는
 * 제어 흐름 신호다. Gemini 호출을 감싼 `try`가 잡아 ③ 폴백 경로로 내려보낸다.
 */
class LlmMalformedResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLM_MALFORMED';
  }
}

/**
 * 🔴 step-agnostic 최소 검증 — `openai.ts`의 `openAiCompletionSchema`와 같은 엄격도.
 * Gemini 응답에서 우리가 실제로 의존하는 필드는 `GenerateContentResponse.text`
 * (`@google/genai`의 편의 getter) 하나뿐이다: (a) 문자열로 존재하는지 — 타입 선언상
 * `string | undefined`이므로 없을 수 있다 — (b) 그 문자열이 유효한 JSON으로 파싱되는지.
 * 실패하면 OpenAI 경로와 동일하게 `LLM_MALFORMED`로 판정해 캐시에 저장하지 않고 폴백으로 간다.
 */
const geminiResponseSchema = z.object({
  text: z
    .string()
    .min(1, { message: 'text가 비어 있습니다' })
    .refine(
      (value) => {
        try {
          JSON.parse(value);
          return true;
        } catch {
          return false;
        }
      },
      { message: 'text가 유효한 JSON이 아닙니다' },
    ),
});

/** `openai.ts`의 `errorCodeOf`와 동일한 목적 — Gemini SDK는 `ApiError` 하나로 HTTP 오류를 감싼다. */
function errorCodeOf(error: unknown): string {
  if (error instanceof ApiError) {
    return typeof error.status === 'number' ? `HTTP_${error.status}` : 'UNKNOWN';
  }
  if (error instanceof Error) {
    if (error.name === 'AbortError') return 'LLM_TIMEOUT';
    return error.name === 'Error' ? 'UNKNOWN' : error.name;
  }
  return 'UNKNOWN';
}

/** `openai.ts`의 `logStorageError`와 동일 — PostgREST 에러 객체를 통째로 로그에 남기지 않는다. */
function logStorageError(context: string, error: unknown): void {
  const code = (error as { code?: unknown } | null)?.code;
  const message = (error as { message?: unknown } | null)?.message ?? String(error);
  console.error(context, { code, message });
}

/** `openai.ts`의 `quotaErrorCode`와 동일 — 요청 상한 초과를 사용자·전역 스코프로 분리해 기록한다. */
function quotaErrorCode(scope: RateLimitResult['scope']): string {
  return scope === 'user' ? 'QUOTA_EXCEEDED_USER' : 'QUOTA_EXCEEDED_GLOBAL';
}

/**
 * 🔴 설정 누락을 조용히 삼키지 않는다(`openai.ts`의 `readModel()`과 동일 패턴) — 모델명이
 * 비면 캐시 키·Gemini 호출 모두 잘못된 값으로 나가는데, 그 오류가 "폴백"으로 위장되어 눈에
 * 띄지 않게 된다.
 */
function readModel(env: Record<string, string | undefined> = process.env): string {
  const value = env.GEMINI_MODEL;
  if (!value) {
    throw new Error(`GEMINI_MODEL must be set to a non-empty string (got: ${value ?? 'undefined'})`);
  }
  return value;
}

/**
 * `apps/web/lib/llm/gemini.ts`의 `LLMClient` 생성자 — `openai.ts`의 `createOpenAiLLMClient`와
 * 같은 형태다. **로컬 테스트 전용**(파일 헤더 주석 참조).
 *
 * @param userId 요청자 사용자 UUID. `createOpenAiLLMClient`와 동일하게 요청마다 이 팩토리를
 *   호출해 요청 스코프의 `LLMClient` 인스턴스를 만드는 것을 전제로 한다.
 * @param deps 테스트 주입용 의존성. 프로덕션(이 경우 "로컬 실행")에서는 전부 기본값을 쓴다.
 */
export function createGeminiLLMClient(userId?: string, deps: GeminiLLMClientDeps = {}): LLMClient {
  const supabase = deps.supabase ?? createServiceClient();
  const fallbackLookup = deps.fallbackLookup ?? findFallbackResponse;
  const now = deps.now ?? Date.now;
  const geminiClient: Pick<GoogleGenAI, 'models'> =
    deps.geminiClient ??
    new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: { timeout: REQUEST_TIMEOUT_MS, retryOptions: RETRY_OPTIONS },
    });

  /** `openai.ts`의 `log()`와 동일 — 관측 로깅은 부수 효과일 뿐이다. 실패해도 응답 반환을 막지 않는다. */
  async function log(
    step: LLMStep,
    model: string,
    outcome: CallOutcome,
    startedAt: number,
    inputChars: number,
    errorCode: string | null,
  ): Promise<void> {
    try {
      await recordCallLog(supabase, {
        userId: userId ?? null,
        step,
        model,
        outcome,
        latencyMs: now() - startedAt,
        inputChars,
        errorCode,
      });
    } catch (error) {
      logStorageError('[llm] recordCallLog failed', error);
    }
  }

  return {
    async complete(step: LLMStep, promptVersion: string, payload: unknown): Promise<LLMResponse> {
      const model = readModel();
      const cacheKey = buildCacheKey(model, promptVersion, step, payload);
      const inputChars = inputCharsOf(payload);
      const startedAt = now();

      // ① llm_cache 적중 — 조회(읽기) 실패는 치명적 실패가 아니라 캐시 미스로 강등한다.
      let cacheHit: Awaited<ReturnType<typeof lookupCache>> = null;
      try {
        cacheHit = await lookupCache(supabase, cacheKey);
      } catch (error) {
        logStorageError('[llm] lookupCache failed — treating as cache miss', error);
      }

      if (cacheHit) {
        try {
          await recordCacheHit(supabase, cacheKey, cacheHit.hitCount);
        } catch (error) {
          logStorageError('[llm] recordCacheHit failed', error);
        }
        await log(step, model, 'cache', startedAt, inputChars, null);
        return { content: cacheHit.response, source: 'cache' };
      }

      // ② 미적중 → 상한 확인 후 Gemini 호출. 설정 오류(`readRateLimitThresholds`)는 이 try
      // **밖에서** 먼저 호출해 fail-closed로 위장되지 않게 한다(`openai.ts`와 동일한 근거).
      const thresholds = readRateLimitThresholds();

      let rateLimit: RateLimitResult;
      let rateLimitCheckFailed = false;
      try {
        rateLimit = await checkRequestLimit(supabase, userId, thresholds);
      } catch (error) {
        logStorageError(
          '[llm] checkRequestLimit failed — fail-closed (treating as not allowed)',
          error,
        );
        rateLimitCheckFailed = true;
        rateLimit = { allowed: false, scope: 'global' };
      }
      let liveError: unknown = null;
      let liveContent: string | null = null;

      if (rateLimit.allowed) {
        try {
          const response = await geminiClient.models.generateContent({
            model,
            contents: JSON.stringify(payload),
            // 🔴 M-5(reviewer 라운드) — Gemini 기본 동작은 JSON을 요구해도 산문이나 ```json
            // 펜스로 감싸 응답하는 경우가 있어 아래 zod 검증(JSON.parse)이 실패하고 계속
            // LLM_MALFORMED → 폴백만 나올 수 있다. `@google/genai` 공식 옵션으로 순수 JSON
            // 응답을 요청한다.
            config: { responseMimeType: 'application/json' },
          });
          // 🔴 외부 응답은 신뢰하지 않는다 — zod 검증 실패 = LLM_MALFORMED.
          const parsed = geminiResponseSchema.safeParse(response);
          if (!parsed.success) {
            throw new LlmMalformedResponseError(
              `Gemini 응답이 검증에 실패했습니다: ${parsed.error.message}`,
            );
          }
          liveContent = parsed.data.text;
        } catch (error) {
          liveError = error;
        }
      }

      if (liveContent !== null) {
        // 🔴 캐시 저장은 Gemini 호출 try 밖에서 별도 처리한다 — 저장 실패가 이미 성공한
        // 실호출을 outcome:'fallback'으로 오기록하면 안 된다.
        try {
          await saveCacheEntry(supabase, {
            cacheKey,
            step,
            model,
            promptVersion,
            response: liveContent,
          });
        } catch (error) {
          logStorageError(
            '[llm] saveCacheEntry failed — responding with live content regardless',
            error,
          );
        }
        await log(step, model, 'live', startedAt, inputChars, null);
        return { content: liveContent, source: 'live' };
      }

      // ③ 실패 / 상한 초과 / 응답 검증 실패 / 상한 조회 실패 → fallback-responses.ts 조회
      const fallback = fallbackLookup(step, cacheKey);
      if (fallback) {
        const errorCode = liveError
          ? errorCodeOf(liveError)
          : rateLimitCheckFailed
            ? 'QUOTA_CHECK_FAILED'
            : quotaErrorCode(rateLimit.scope);
        await log(step, model, 'fallback', startedAt, inputChars, errorCode);
        return { content: fallback.content, source: 'fallback' };
      }

      // 🔴 실패 계약(`packages/core/src/llm/client.ts` `LLMClient` JSDoc 표)과 동일하게 두 원인을
      // 구분해 던진다: 실제 호출이 실패했다면 재시도하면 성공할 수도 있으므로
      // LLMUnavailableError(retryable=true). 요청 상한 초과(Gemini를 아예 호출하지 않음)라면
      // 오늘 안에 재시도해도 동일하게 실패하므로 QuotaExceededError(retryable=false).
      if (liveError) {
        const errorCode = errorCodeOf(liveError);
        await log(step, model, 'error', startedAt, inputChars, errorCode);
        throw new LLMUnavailableError(
          liveError instanceof Error
            ? `Gemini 호출과 폴백 응답 모두 사용할 수 없습니다: ${liveError.message}`
            : 'Gemini 호출과 폴백 응답 모두 사용할 수 없습니다',
        );
      }

      if (rateLimitCheckFailed) {
        await log(step, model, 'error', startedAt, inputChars, 'QUOTA_CHECK_FAILED');
        throw new LLMUnavailableError('요청 상한 확인에 실패했고 폴백 응답도 없습니다');
      }

      const errorCode = quotaErrorCode(rateLimit.scope);
      await log(step, model, 'error', startedAt, inputChars, errorCode);
      throw new QuotaExceededError('요청 상한을 초과했고 폴백 응답도 없습니다');
    },
  };
}
