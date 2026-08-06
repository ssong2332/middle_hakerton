/**
 * `createGeminiLLMClient` — 로컬 테스트 전용 Gemini `LLMClient` 구현체(파일 헤더 주석 참조,
 * `gemini.ts`). `openai.test.ts`와 같은 구조로 3단 해석(캐시→실호출→폴백) + 요청 상한을
 * 검증한다. 요구된 5개 경로: 캐시 적중(실호출 안 함) / 실호출 성공 / 실호출 실패+폴백 있음 /
 * 실호출 실패+폴백 없음(throw) / 상한 초과(throw).
 *
 * Gemini SDK(`@google/genai`)는 실제로 호출하지 않는다(`docs/CodingRules.md` Tests "모킹 정책").
 */
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// 🔴 T49 — `deps.geminiClient`는 실제 `new GoogleGenAI(...)` 생성자를 완전히 우회하므로(기존
// 5개 경로 테스트는 전부 이 주입을 쓴다), 그 경로로는 실제 생성자에 어떤 `httpOptions`가
// 전달되는지 검증할 수 없다. `apps/web/lib/supabase/server.test.ts`가 `@supabase/ssr`의
// `createServerClient`를 모킹해 생성자 호출 인자를 검사하는 것과 동일한 패턴으로, 여기서는
// `@google/genai`의 `GoogleGenAI`만 스파이로 교체하고 `ApiError` 등 나머지는 실제 모듈을 그대로
// 쓴다(다른 테스트들이 `ApiError`로 실패를 흉내 내므로 실제 클래스가 필요하다).
vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>();
  return {
    ...actual,
    GoogleGenAI: vi.fn().mockImplementation(function FakeGoogleGenAI() {
      return { models: { generateContent: vi.fn() } };
    }),
  };
});

import { ApiError, GoogleGenAI } from '@google/genai';
import {
  LLMUnavailableError,
  QuotaExceededError,
  type FallbackResponseEntry,
  type LLMStep,
} from '@cross-border/core';
import { createGeminiLLMClient, REQUEST_TIMEOUT_MS, type GeminiLLMClientDeps } from './gemini';

type FakeGeminiClient = NonNullable<GeminiLLMClientDeps['geminiClient']>;

process.env.GEMINI_MODEL = 'gemini-2.5-flash';
process.env.MAX_LLM_CALLS_PER_USER_PER_DAY = '5';
process.env.MAX_LLM_CALLS_GLOBAL_PER_DAY = '50';

interface FakeSupabaseOptions {
  cacheRow?: { response: unknown; hit_count: number } | null;
  userLiveCount?: number;
  globalLiveCount?: number;
}

interface FakeSupabaseHandle {
  client: SupabaseClient;
  upserts: unknown[];
  updates: unknown[];
  inserts: unknown[];
}

/** `openai.test.ts`의 `createFakeSupabase`와 같은 최소 체이닝 페이크. */
function createFakeSupabase(options: FakeSupabaseOptions = {}): FakeSupabaseHandle {
  const upserts: unknown[] = [];
  const updates: unknown[] = [];
  const inserts: unknown[] = [];

  const client = {
    from(table: string) {
      if (table === 'llm_cache') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: options.cacheRow ?? null,
                error: null,
              }),
            }),
          }),
          update: (values: unknown) => ({
            eq: async () => {
              updates.push(values);
              return { data: null, error: null };
            },
          }),
          upsert: async (values: unknown) => {
            upserts.push(values);
            return { data: null, error: null };
          },
        };
      }
      if (table === 'llm_call_log') {
        return {
          insert: async (values: unknown) => {
            inserts.push(values);
            return { data: null, error: null };
          },
          select: () => {
            let userFiltered = false;
            const builder = {
              eq(column: string) {
                if (column === 'user_id') userFiltered = true;
                return builder;
              },
              gt() {
                return builder;
              },
              then(
                resolve: (value: { data: null; error: null; count: number | null }) => void,
              ) {
                const count = userFiltered
                  ? (options.userLiveCount ?? 0)
                  : (options.globalLiveCount ?? 0);
                resolve({ data: null, error: null, count });
              },
            };
            return builder;
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as SupabaseClient;

  return { client, upserts, updates, inserts };
}

function fakeGeminiClient(text: string): FakeGeminiClient {
  return {
    models: {
      generateContent: vi.fn().mockResolvedValue({ text }),
    },
  } as unknown as FakeGeminiClient;
}

function failingGeminiClient(error: unknown): FakeGeminiClient {
  return {
    models: {
      generateContent: vi.fn().mockRejectedValue(error),
    },
  } as unknown as FakeGeminiClient;
}

const noFallback = () => undefined as FallbackResponseEntry | undefined;
const step: LLMStep = 'c1';

describe('createGeminiLLMClient — 캐시 적중', () => {
  it('llm_cache에 행이 있으면 Gemini를 호출하지 않고 source:"cache"를 반환한다', async () => {
    const { client: supabase, inserts } = createFakeSupabase({
      cacheRow: { response: '{"urgency":"NORMAL"}', hit_count: 3 },
    });
    const geminiClient = fakeGeminiClient('should-not-be-used');
    const llm = createGeminiLLMClient(undefined, {
      supabase,
      geminiClient,
      fallbackLookup: noFallback,
    });

    const result = await llm.complete(step, 'v1', { text: 'hello' });

    expect(result).toEqual({ content: '{"urgency":"NORMAL"}', source: 'cache' });
    expect(geminiClient.models.generateContent).not.toHaveBeenCalled();
    expect((inserts[0] as { outcome: string }).outcome).toBe('cache');
  });
});

describe('createGeminiLLMClient — 캐시 미스 + 실호출 성공', () => {
  it('캐시가 없고 상한 이내면 Gemini를 호출해 source:"live"를 반환하고 llm_cache에 저장한다', async () => {
    const {
      client: supabase,
      upserts,
      inserts,
    } = createFakeSupabase({ cacheRow: null, userLiveCount: 0, globalLiveCount: 0 });
    const geminiClient = fakeGeminiClient('{"urgency":"CRITICAL"}');
    const llm = createGeminiLLMClient('user-1', {
      supabase,
      geminiClient,
      fallbackLookup: noFallback,
    });

    const result = await llm.complete(step, 'v1', { text: 'urgent!' });

    expect(result).toEqual({ content: '{"urgency":"CRITICAL"}', source: 'live' });
    expect(geminiClient.models.generateContent).toHaveBeenCalledTimes(1);
    expect(upserts).toHaveLength(1);
    expect((inserts[0] as { outcome: string }).outcome).toBe('live');
    // 🔴 M-5(reviewer 라운드) — 순수 JSON 응답을 강제하지 않으면 Gemini가 산문/```json 펜스로
    // 응답해 zod 검증(JSON.parse)이 계속 실패할 수 있다(`gemini.ts` 해당 호출부 주석 참조).
    expect(geminiClient.models.generateContent).toHaveBeenCalledWith(
      expect.objectContaining({ config: { responseMimeType: 'application/json' } }),
    );
  });
});

describe('createGeminiLLMClient — 폴백 경로', () => {
  it('실호출이 실패해도 폴백 응답이 있으면 던지지 않고 source:"fallback"을 반환한다', async () => {
    const { client: supabase, inserts } = createFakeSupabase({
      cacheRow: null,
      userLiveCount: 0,
      globalLiveCount: 0,
    });
    const geminiClient = failingGeminiClient(new Error('network down'));
    const fallbackEntry: FallbackResponseEntry = { step, content: '{"urgency":"NORMAL"}' };
    const llm = createGeminiLLMClient(undefined, {
      supabase,
      geminiClient,
      fallbackLookup: () => fallbackEntry,
    });

    const result = await llm.complete(step, 'v1', { text: 'hello' });

    expect(result).toEqual({ content: '{"urgency":"NORMAL"}', source: 'fallback' });
    expect((inserts[0] as { outcome: string }).outcome).toBe('fallback');
  });

  it('폴백조차 없으면 LLMUnavailableError를 던진다(core는 이 예외를 잡지 않는다)', async () => {
    const { client: supabase, inserts } = createFakeSupabase({
      cacheRow: null,
      userLiveCount: 0,
      globalLiveCount: 0,
    });
    const geminiClient = failingGeminiClient(new Error('network down'));
    const llm = createGeminiLLMClient(undefined, {
      supabase,
      geminiClient,
      fallbackLookup: noFallback,
    });

    await expect(llm.complete(step, 'v1', { text: 'hello' })).rejects.toBeInstanceOf(
      LLMUnavailableError,
    );
    expect((inserts[0] as { outcome: string }).outcome).toBe('error');
  });

  it('ApiError(HTTP 상태 포함)로 실패하면 error_code가 HTTP_상태코드로 기록된다', async () => {
    const { client: supabase, inserts } = createFakeSupabase({
      cacheRow: null,
      userLiveCount: 0,
      globalLiveCount: 0,
    });
    const geminiClient = failingGeminiClient(new ApiError({ message: 'rate limited', status: 429 }));
    const llm = createGeminiLLMClient(undefined, {
      supabase,
      geminiClient,
      fallbackLookup: noFallback,
    });

    await expect(llm.complete(step, 'v1', { text: 'hello' })).rejects.toBeInstanceOf(
      LLMUnavailableError,
    );
    expect((inserts[0] as { error_code: string }).error_code).toBe('HTTP_429');
  });
});

describe('createGeminiLLMClient — 세션당(사용자·일) 요청 상한 초과', () => {
  it('사용자 상한을 초과하고 폴백도 없으면 Gemini를 호출하지 않고 QuotaExceededError를 던진다(retryable=false)', async () => {
    const { client: supabase, inserts } = createFakeSupabase({
      cacheRow: null,
      userLiveCount: 5, // MAX_LLM_CALLS_PER_USER_PER_DAY=5 도달
      globalLiveCount: 0,
    });
    const geminiClient = fakeGeminiClient('should-not-be-called');
    const llm = createGeminiLLMClient('user-1', {
      supabase,
      geminiClient,
      fallbackLookup: noFallback,
    });

    await expect(llm.complete(step, 'v1', { text: 'hello' })).rejects.toBeInstanceOf(
      QuotaExceededError,
    );
    expect(geminiClient.models.generateContent).not.toHaveBeenCalled();
    expect((inserts[0] as { error_code: string }).error_code).toBe('QUOTA_EXCEEDED_USER');
  });

  it('전역 상한을 초과했지만 폴백이 있으면 Gemini를 호출하지 않고 곧바로 폴백으로 간다', async () => {
    const { client: supabase } = createFakeSupabase({
      cacheRow: null,
      userLiveCount: 0,
      globalLiveCount: 50, // MAX_LLM_CALLS_GLOBAL_PER_DAY=50 도달
    });
    const geminiClient = fakeGeminiClient('should-not-be-called');
    const fallbackEntry: FallbackResponseEntry = { step, content: '{"urgency":"NORMAL"}' };
    const llm = createGeminiLLMClient(undefined, {
      supabase,
      geminiClient,
      fallbackLookup: () => fallbackEntry,
    });

    const result = await llm.complete(step, 'v1', { text: 'hello' });

    expect(result).toEqual({ content: '{"urgency":"NORMAL"}', source: 'fallback' });
    expect(geminiClient.models.generateContent).not.toHaveBeenCalled();
  });
});

describe('createGeminiLLMClient — 응답 검증(LLM_MALFORMED)', () => {
  it('text가 유효한 JSON이 아니면 캐시에 저장하지 않고 폴백으로 내려간다', async () => {
    const {
      client: supabase,
      upserts,
      inserts,
    } = createFakeSupabase({ cacheRow: null, userLiveCount: 0, globalLiveCount: 0 });
    const geminiClient = fakeGeminiClient('이것은 JSON이 아닙니다{{{');
    const fallbackEntry: FallbackResponseEntry = { step, content: '{"urgency":"NORMAL"}' };
    const llm = createGeminiLLMClient(undefined, {
      supabase,
      geminiClient,
      fallbackLookup: () => fallbackEntry,
    });

    const result = await llm.complete(step, 'v1', { text: 'hello' });

    expect(result).toEqual({ content: '{"urgency":"NORMAL"}', source: 'fallback' });
    expect(upserts).toHaveLength(0);
    expect((inserts[0] as { error_code: string }).error_code).toBe('LLM_MALFORMED');
  });

  it('text가 undefined(SDK 타입상 가능)면 LLM_MALFORMED로 판정되고 폴백도 없으면 던진다', async () => {
    const { client: supabase } = createFakeSupabase({
      cacheRow: null,
      userLiveCount: 0,
      globalLiveCount: 0,
    });
    const geminiClient = {
      models: { generateContent: vi.fn().mockResolvedValue({ text: undefined }) },
    } as unknown as FakeGeminiClient;
    const llm = createGeminiLLMClient(undefined, {
      supabase,
      geminiClient,
      fallbackLookup: noFallback,
    });

    await expect(llm.complete(step, 'v1', { text: 'hello' })).rejects.toBeInstanceOf(
      LLMUnavailableError,
    );
  });
});

describe('REQUEST_TIMEOUT_MS — Gemini API 서버측 하한 가드(T49)', () => {
  it('10000ms(Gemini API가 서버측에서 강제하는 "manually set deadline" 최소 허용값) 미만이면 안 된다', () => {
    // 2026-08-06 진단(T11 라이브 회귀, LLM_PROVIDER=gemini): 이 값이 3000ms였을 때
    // 73번의 llm.complete('c2', ...) Gemini 실호출 전부가 HTTP 400 INVALID_ARGUMENT
    // ("Manually set deadline 3s is too short. Minimum allowed deadline is 10s.")로
    // 즉시 거부되어 outcome:'fallback'이 됐다 — 그 결과가 53건 중 4건 통과였다.
    // 이 값을 10000 미만으로 다시 낮추면 이 테스트가 즉시 실패해 재발을 막는다.
    expect(REQUEST_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000);
  });
});

describe('createGeminiLLMClient — 실제 GoogleGenAI 생성자에 전달되는 retryOptions(T49)', () => {
  it(
    'deps.geminiClient를 주입하지 않으면(실제 로컬 실행 경로) GoogleGenAI 생성자에 ' +
      'retryOptions를 명시적으로 전달한다 — 429(Gemini 무료 티어 분당 상한)를 재시도 없이 ' +
      '즉시 폴백으로 흘려보내지 않기 위함(2026-08-07 진단: T11 라이브 회귀 53건 중 call #154부터 ' +
      '대부분이 HTTP_429로 지연시간 420~470ms의 즉시 거부 — 백오프가 전혀 관측되지 않았다)',
    () => {
      const { client: supabase } = createFakeSupabase({ cacheRow: null });

      createGeminiLLMClient('user-1', { supabase, fallbackLookup: noFallback });

      expect(GoogleGenAI).toHaveBeenCalledTimes(1);
      const ctorArgs = vi.mocked(GoogleGenAI).mock.calls[0][0] as {
        httpOptions?: { timeout?: number; retryOptions?: Record<string, unknown> };
      };
      expect(ctorArgs.httpOptions?.timeout).toBe(REQUEST_TIMEOUT_MS);
      // `node_modules/@google/genai/dist/node/index.cjs:14022-14025` —
      // `if (!retryOptions) { return fetch(url, requestInit); }`: retryOptions 키 자체가
      // 없으면(undefined) 재시도가 전혀 실행되지 않는다. 키가 "존재"하는지가 관건이므로
      // 빈 객체({})만 있어도 이 단언은 통과하지만, 아래에서 구체적 값까지 확인한다.
      expect(ctorArgs.httpOptions?.retryOptions).toBeDefined();
      expect(ctorArgs.httpOptions?.retryOptions).toMatchObject({
        attempts: 4,
        initialDelay: 3,
        maxDelay: 20,
      });
    },
  );
});

describe('createGeminiLLMClient — GEMINI_MODEL 미설정', () => {
  it('GEMINI_MODEL이 비어있으면 폴백으로 조용히 내려가지 않고 던진다', async () => {
    const previous = process.env.GEMINI_MODEL;
    delete process.env.GEMINI_MODEL;
    try {
      const { client: supabase } = createFakeSupabase({ cacheRow: null });
      const geminiClient = fakeGeminiClient('should-not-be-called');
      const llm = createGeminiLLMClient(undefined, {
        supabase,
        geminiClient,
        fallbackLookup: noFallback,
      });

      await expect(llm.complete(step, 'v1', { text: 'hello' })).rejects.toThrow(/GEMINI_MODEL/);
      expect(geminiClient.models.generateContent).not.toHaveBeenCalled();
    } finally {
      process.env.GEMINI_MODEL = previous;
    }
  });
});
