/**
 * `LLMClient` 구현체 — `packages/core/src/llm/client.ts`의 인터페이스를 구현한다(AC-028).
 * core는 이 파일을 모른다 — 주입은 Route Handler가 한다(T5+ 범위).
 *
 * 캐시(`llm_cache`) → 실호출(OpenAI) → 폴백(`fallback-responses.ts`) 3단 해석과 요청 상한(AC-041)을
 * 여기서 구현한다. 근거: `docs/Architecture.md` Data Flow "2) LLM 호출 3단 해석",
 * `packages/core/src/llm/client.ts` `LLMClient` JSDoc "실패 계약" 표.
 *
 * 🔴 **범위 경계**: 실제 프롬프트 구성(시스템 프롬프트·few-shot 등)은
 * `packages/core/src/prompts/`가 아직 비어 있다(각 스텝 태스크 T5/T7/T10의 범위). 이 파일은
 * `payload`를 OpenAI Chat Completions API의 단일 user 메시지로 그대로 전달하는 **범용 메커니즘만**
 * 구현한다 — step별 프롬프트 조립 방식(payload에 시스템 지시문을 어떻게 담을지)은 그 태스크들이
 * 정한다.
 *
 * 🔴 **응답 검증 범위(2026-08-04 reviewer REJECTED → 수정)**: `docs/Architecture.md:625`
 * Security "Input validation boundaries" ②·`docs/CodingRules.md` Style(*"외부 응답은 반드시
 * zod로 파싱"*)에 따라 OpenAI 응답을 신뢰하지 않는다. 다만 `packages/core/src/prompts/`가 아직
 * 비어 있어 **step별 응답 스키마(예: `urgency`가 열거값 중 하나인지)는 지금 확정할 수 없다** —
 * 그 필드 단위 검증은 각 스텝 태스크(T5/T7/T10)가 프롬프트를 확정하며 추가한다. 지금 구현하는
 * 것은 **step-agnostic한 최소 검증뿐**이다: (a) 우리가 의존하는 응답 형태
 * (`choices[0].message.content: string`)인지, (b) `content`가 유효한 JSON으로 파싱되는지.
 * 둘 중 하나라도 실패하면 `LLM_MALFORMED`로 판정해 **캐시에 저장하지 않고** ③ 폴백 경로로
 * 내려간다(`openAiCompletionSchema` 참조).
 *
 * AC-030(키는 서버에만) — `OPENAI_API_KEY`는 이 서버 전용 모듈에서만 읽는다.
 * `NEXT_PUBLIC_` 접두사가 없어 클라이언트 번들에 실리지 않는다(`docs/CodingRules.md` Naming).
 */
import OpenAI from 'openai';
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
 * 타임아웃·재시도 정책 근거: `docs/PRD.md:442` NFR "메시지 1건 중재(분류→변환→역번역)가
 * 시연에서 체감 5초 이내로 끝나야 한다"(3단계 LLM 호출 합산, "목표 체감이며 측정치 아님" —
 * `docs/CodingRules.md` Tests "채우지 않은 칸" 성능 예산 행). 단일 `complete()` 호출 1건의
 * 예산을 3초로 잡아 3단계 합산이 소프트 타깃(5초) 근방에 오도록 하되 네트워크 여유를 남긴다.
 * `maxRetries: 1`은 openai SDK 기본 재시도 대상(연결 오류·408/409/429/5xx)에만 적용되고
 * SDK 기본 backoff를 그대로 쓴다 — **타임아웃 자체는 재시도하지 않는다**(같은 지연이 반복될
 * 가능성이 높아 재시도가 소프트 타깃을 두 배로 깎아먹는다). SDK의 `timeout` 옵션은 타임아웃을
 * 재시도 대상에서 제외한다.
 */
const REQUEST_TIMEOUT_MS = 3000;
const MAX_RETRIES = 1;

export interface OpenAiLLMClientDeps {
  supabase?: SupabaseClient;
  openaiClient?: Pick<OpenAI, 'chat'>;
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
 * 🔴 이 에러는 core로 던져지지 않는다 — `complete()` 내부에서만 쓰이는 제어 흐름 신호다.
 * OpenAI 호출을 감싼 `try`가 `liveError`로 잡아 ③ 폴백 경로로 내려보내고,
 * `errorCodeOf()`가 `name`을 그대로 `llm_call_log.error_code`(`LLM_MALFORMED`)로 남긴다
 * (`docs/API.md:43`). 캐시 저장은 이 에러가 던져진 시점 **이전에 도달하지 않으므로**
 * 오염된 응답이 `llm_cache`에 남지 않는다.
 */
class LlmMalformedResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLM_MALFORMED';
  }
}

/**
 * 🔴 step-agnostic 최소 검증(파일 헤더 주석 참조) — step별 필드 의미 검증이 아니다.
 * (a) `choices[0].message.content`가 문자열로 존재하는지 (b) 그 문자열이 유효한 JSON으로
 * 파싱되는지만 확인한다.
 */
const openAiCompletionSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z
            .string()
            .min(1, { message: 'content가 비어 있습니다' })
            .refine(
              (value) => {
                try {
                  JSON.parse(value);
                  return true;
                } catch {
                  return false;
                }
              },
              { message: 'content가 유효한 JSON이 아닙니다' },
            ),
        }),
      }),
    )
    .min(1, { message: 'choices가 비어 있습니다' }),
});

/**
 * 🔴 reviewer 3차 Major M-A — `APIConnectionTimeoutError`/`APIConnectionError`는 둘 다
 * `APIError`의 서브클래스이면서 생성자가 `status`를 항상 `undefined`로 만든다
 * (`node_modules/openai/core/error.js:78-92`). 일반 `APIError` 분기보다 **먼저** 검사해야
 * 타임아웃·연결실패가 `'UNKNOWN'`으로 뭉개지지 않고 `docs/API.md:34-46`의 UPPER_SNAKE
 * 어휘(`LLM_TIMEOUT`/`LLM_UNAVAILABLE`)로 남는다.
 */
function errorCodeOf(error: unknown): string {
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return 'LLM_TIMEOUT';
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return 'LLM_UNAVAILABLE';
  }
  if (error instanceof OpenAI.APIError) {
    return error.status === undefined ? 'UNKNOWN' : `HTTP_${error.status}`;
  }
  if (error instanceof Error) {
    return error.name === 'Error' ? 'UNKNOWN' : error.name;
  }
  return 'UNKNOWN';
}

/**
 * 🔴 reviewer 3차 Major M-B — PostgREST 에러 객체를 `console.error`에 통째로 넘기지 않는다.
 * `details`/`hint`/`response` 등 필드는 제약 위반 시 행 전체(변환문 원문 포함)를 담을 수 있어
 * `docs/CodingRules.md` "로그 금지 항목"(메시지 원문 금지) 위반 소지가 있다. `code`·`message`만
 * 뽑아 남긴다.
 */
function logStorageError(context: string, error: unknown): void {
  const code = (error as { code?: unknown } | null)?.code;
  const message = (error as { message?: unknown } | null)?.message ?? String(error);
  console.error(context, { code, message });
}

/**
 * 요청 상한 초과(`error_code`)를 사용자·전역 스코프로 분리해 기록한다 — 사후에
 * `llm_call_log.error_code`만 보고 어느 상한이 걸렸는지 구분할 수 있게 한다.
 */
function quotaErrorCode(scope: RateLimitResult['scope']): string {
  return scope === 'user' ? 'QUOTA_EXCEEDED_USER' : 'QUOTA_EXCEEDED_GLOBAL';
}

/**
 * 🔴 설정 누락을 빈 문자열로 조용히 삼키지 않는다(Major 1) — `rate-limit.ts`의
 * `parseThreshold()`와 같은 fail-fast 방식. 모델명이 비면 캐시 키·OpenAI 호출 모두 잘못된
 * 값으로 나가는데, 그 오류가 "폴백"으로 위장되어 눈에 띄지 않게 된다.
 */
function readModel(env: Record<string, string | undefined> = process.env): string {
  const value = env.OPENAI_MODEL;
  if (!value) {
    throw new Error(
      `OPENAI_MODEL must be set to a non-empty string (got: ${value ?? 'undefined'})`,
    );
  }
  return value;
}

/**
 * `apps/web/lib/llm/openai.ts`의 `LLMClient` 생성자.
 *
 * @param userId 요청자 사용자 UUID. 미인증 경로(확장 등)에서는 생략 가능 — 이 경우
 *   사용자·일 상한 판정은 건너뛰고 전역·일 상한만 적용된다(`docs/Architecture.md` 요청 상한 표).
 *   🔴 `LLMClient.complete()` 시그니처(F1)는 userId를 받지 않으므로, 요청마다 이 팩토리를
 *   호출해 요청 스코프의 `LLMClient` 인스턴스를 만드는 것을 전제로 한다(호출부는 T5+ 범위).
 * @param deps 테스트 주입용 의존성. 프로덕션에서는 전부 기본값을 쓴다.
 */
export function createOpenAiLLMClient(userId?: string, deps: OpenAiLLMClientDeps = {}): LLMClient {
  const supabase = deps.supabase ?? createServiceClient();
  const fallbackLookup = deps.fallbackLookup ?? findFallbackResponse;
  const now = deps.now ?? Date.now;
  const openaiClient: Pick<OpenAI, 'chat'> =
    deps.openaiClient ??
    new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: MAX_RETRIES,
    });

  /**
   * 🔴 관측 로깅은 부수 효과일 뿐이다(Major 2) — 실패해도 이미 확보한 응답 반환을 막지
   * 않는다. 실패는 콘솔에만 남기고 삼킨다(내용 컬럼이 없으므로 payload 원문 노출 위험도 없다).
   */
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

      // ① llm_cache 적중 — 조회(읽기) 실패는 치명적 실패가 아니라 캐시 미스로 강등한다(Major 2).
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
          // hit_count 갱신 실패가 이미 찾은 캐시 응답 반환을 막으면 안 된다(Major 2).
          logStorageError('[llm] recordCacheHit failed', error);
        }
        await log(step, model, 'cache', startedAt, inputChars, null);
        return { content: cacheHit.response, source: 'cache' };
      }

      // ② 미적중 → 상한 확인 후 OpenAI 호출
      // 🔴 QA 2차 F-A — `readRateLimitThresholds()`(설정 오류, fail-fast)는 이 try **밖에서**
      // 먼저 호출한다. `MAX_LLM_CALLS_*` 미설정/비정수/음수는 `OPENAI_MODEL` 미설정(Major 1,
      // `readModel()`)과 동일하게 그대로 propagate되어야 한다 — 아래 try에 걸리면 "설정 오류"가
      // "재시도 가능한 일시 장애"(LLMUnavailableError)로 위장된다.
      const thresholds = readRateLimitThresholds();

      // 🔴 상한 조회(DB) 실패는 무방비로 새지 않는다(reviewer 2차 Major M-1) — `lookupCache`와
      // 같은 강등 패턴이지만, 방향은 반대다: 조회 실패를 "허용"으로 오인하면 상한 없이 OpenAI를
      // 계속 호출하게 되므로 fail-closed(=허용하지 않음, scope:'global')로 강등해 ③ 폴백 경로로
      // 보낸다. `rateLimitCheckFailed` 플래그로 "진짜 상한 도달"과 "상한을 못 셌다"를
      // `error_code`에서 구분한다(`docs/Architecture.md:454` signal_absent vs undetermined 원칙).
      // 이 try에는 `thresholds`를 미리 계산해 넘기므로 `countLiveCallsSince`(DB 조회)가 던지는
      // 예외만 여기서 잡힌다 — 설정 오류는 이미 위에서 던져졌다.
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
          const completion = await openaiClient.chat.completions.create({
            model,
            messages: [{ role: 'user', content: JSON.stringify(payload) }],
          });
          // 🔴 외부 응답은 신뢰하지 않는다 — zod 검증 실패 = LLM_MALFORMED(파일 헤더 주석 참조).
          const parsed = openAiCompletionSchema.safeParse(completion);
          if (!parsed.success) {
            throw new LlmMalformedResponseError(
              `OpenAI 응답이 검증에 실패했습니다: ${parsed.error.message}`,
            );
          }
          liveContent = parsed.data.choices[0].message.content;
        } catch (error) {
          liveError = error;
        }
      }

      if (liveContent !== null) {
        // 🔴 캐시 저장은 OpenAI 호출 try 밖에서 별도 처리한다(Major 3) — 저장 실패가
        // 이미 성공한 실호출을 outcome:'fallback'으로 오기록하면 안 된다. 요청 상한 카운트가
        // outcome='live'에 의존한다(`docs/Database.md` "요청 상한 판정").
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

      // ③ 실패 / 상한 초과 / 크레딧 소진 / 응답 검증 실패 / 상한 조회 실패 → fallback-responses.ts 조회
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

      // 🔴 Major 4 — 두 원인을 구분해 던진다(둘 다 "T1 산출물"이던 실패 계약 표의 모순을 정정):
      // 실제 호출이 실패했다면(네트워크·5xx·LLM_MALFORMED 포함) 재시도하면 성공할 수도 있으므로
      // LLMUnavailableError(retryable=true). OpenAI를 아예 호출하지 않은 요청 상한 초과라면
      // 오늘 안에 재시도해도 동일하게 실패하므로 QuotaExceededError(retryable=false) —
      // `docs/API.md:42,44`의 retryable 값과 일치시킨다.
      if (liveError) {
        const errorCode = errorCodeOf(liveError);
        await log(step, model, 'error', startedAt, inputChars, errorCode);
        throw new LLMUnavailableError(
          liveError instanceof Error
            ? `OpenAI 호출과 폴백 응답 모두 사용할 수 없습니다: ${liveError.message}`
            : 'OpenAI 호출과 폴백 응답 모두 사용할 수 없습니다',
        );
      }

      // 🔴 reviewer 2차 Major M-1 — 상한 조회 실패는 "상한 도달이 확정된 것"이 아니므로
      // QuotaExceededError(retryable=false)로 위장하지 않는다. DB 조회가 일시 장애였을 뿐이라면
      // 재시도로 회복될 수 있으므로 LLMUnavailableError(retryable=true)다 — 실제 호출 실패와
      // 같은 성격("판정 자체를 완료하지 못했다")으로 취급한다.
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
