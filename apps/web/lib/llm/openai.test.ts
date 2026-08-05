/**
 * `createOpenAiLLMClient` — AC-041(캐싱+요청 상한) · AC-030(키는 서버에만)의 핵심 구현체.
 * 근거: `docs/Architecture.md` Data Flow "2) LLM 호출 3단 해석", `packages/core/src/llm/client.ts`
 * "실패 계약" 표(캐시 적중 → cache 반환 / 실호출 성공 → live 반환 / 실패+폴백 있음 → fallback 반환
 * / 폴백도 없음 → LLMUnavailableError). 4개 경로(캐시 히트/미스/폴백/상한초과)를 검증한다.
 *
 * OpenAI SDK·Supabase는 실제로 호출하지 않는다(`docs/CodingRules.md` Tests "모킹 정책" — LLM은 모킹).
 */
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import {
  LLMUnavailableError,
  QuotaExceededError,
  type FallbackResponseEntry,
  type LLMStep,
} from '@cross-border/core';
import { createOpenAiLLMClient, type OpenAiLLMClientDeps } from './openai';

/** 테스트 전용 페이크의 타입 우회 — `Pick<OpenAI, 'chat'>` 형태만 흉내내면 되므로 실 SDK 타입은 쓰지 않는다. */
type FakeOpenAiClient = NonNullable<OpenAiLLMClientDeps['openaiClient']>;

process.env.OPENAI_MODEL = 'gpt-4o-mini';
process.env.MAX_LLM_CALLS_PER_USER_PER_DAY = '5';
process.env.MAX_LLM_CALLS_GLOBAL_PER_DAY = '50';

interface FakeSupabaseOptions {
  cacheRow?: { response: unknown; hit_count: number } | null;
  userLiveCount?: number;
  globalLiveCount?: number;
  /** `lookupCache`(llm_cache 조회)가 실패하도록 만든다 — Major 2 회귀 테스트용. */
  cacheSelectError?: { message: string } | null;
  /** `recordCacheHit`(llm_cache hit_count 갱신)가 실패하도록 만든다 — Major 2 회귀 테스트용. */
  cacheUpdateError?: { message: string } | null;
  /** `saveCacheEntry`(llm_cache upsert)가 실패하도록 만든다 — Major 3 회귀 테스트용. */
  cacheUpsertError?: { message: string } | null;
  /** `recordCallLog`(llm_call_log insert)가 실패하도록 만든다 — Major 2 회귀 테스트용. */
  callLogInsertError?: { message: string } | null;
  /**
   * `countLiveCallsSince`(요청 상한 조회, `checkRequestLimit`이 호출)가 실패하도록 만든다 —
   * reviewer 2차 Major M-1 회귀 테스트용. `PostgrestError`는 `Error` 인스턴스가 아니므로
   * plain object로 주입한다(실제 supabase-js 오류 형태를 흉내낸다).
   */
  rateLimitCountError?: { message: string } | null;
}

interface FakeSupabaseHandle {
  client: SupabaseClient;
  upserts: unknown[];
  updates: unknown[];
  inserts: unknown[];
}

/** 최소 체이닝만 흉내내는 페이크 — 실제 supabase-js 쿼리 빌더를 그대로 모킹하지 않는다. */
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
                data: options.cacheSelectError ? null : (options.cacheRow ?? null),
                error: options.cacheSelectError ?? null,
              }),
            }),
          }),
          update: (values: unknown) => ({
            eq: async () => {
              updates.push(values);
              return { data: null, error: options.cacheUpdateError ?? null };
            },
          }),
          upsert: async (values: unknown) => {
            upserts.push(values);
            return { data: null, error: options.cacheUpsertError ?? null };
          },
        };
      }
      if (table === 'llm_call_log') {
        return {
          insert: async (values: unknown) => {
            inserts.push(values);
            return { data: null, error: options.callLogInsertError ?? null };
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
                resolve: (value: {
                  data: null;
                  error: { message: string } | null;
                  count: number | null;
                }) => void,
              ) {
                if (options.rateLimitCountError) {
                  resolve({ data: null, error: options.rateLimitCountError, count: null });
                  return;
                }
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

function fakeOpenAiClient(content: string): FakeOpenAiClient {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({ choices: [{ message: { content } }] }),
      },
    },
  } as unknown as FakeOpenAiClient;
}

function failingOpenAiClient(error: unknown): FakeOpenAiClient {
  return {
    chat: {
      completions: {
        create: vi.fn().mockRejectedValue(error),
      },
    },
  } as unknown as FakeOpenAiClient;
}

const noFallback = () => undefined as FallbackResponseEntry | undefined;
const step: LLMStep = 'c1';

describe('createOpenAiLLMClient — 캐시 히트', () => {
  it('llm_cache에 행이 있으면 OpenAI를 호출하지 않고 source:"cache"를 반환하고 hit_count를 올린다', async () => {
    const {
      client: supabase,
      updates,
      inserts,
    } = createFakeSupabase({
      cacheRow: { response: '{"urgency":"NORMAL"}', hit_count: 3 },
    });
    const openaiClient = fakeOpenAiClient('should-not-be-used');
    const llm = createOpenAiLLMClient(undefined, {
      supabase,
      openaiClient,
      fallbackLookup: noFallback,
    });

    const result = await llm.complete(step, 'v1', { text: 'hello' });

    expect(result).toEqual({ content: '{"urgency":"NORMAL"}', source: 'cache' });
    expect(openaiClient.chat.completions.create).not.toHaveBeenCalled();
    expect(updates).toEqual([{ hit_count: 4 }]);
    expect(inserts).toHaveLength(1);
    expect((inserts[0] as { outcome: string }).outcome).toBe('cache');
  });
});

describe('createOpenAiLLMClient — 캐시 미스 + 실호출 성공', () => {
  it('캐시가 없고 상한 이내면 OpenAI를 호출해 source:"live"를 반환하고 llm_cache에 저장한다', async () => {
    const {
      client: supabase,
      upserts,
      inserts,
    } = createFakeSupabase({
      cacheRow: null,
      userLiveCount: 0,
      globalLiveCount: 0,
    });
    const openaiClient = fakeOpenAiClient('{"urgency":"CRITICAL"}');
    const llm = createOpenAiLLMClient('user-1', {
      supabase,
      openaiClient,
      fallbackLookup: noFallback,
    });

    const result = await llm.complete(step, 'v1', { text: 'urgent!' });

    expect(result).toEqual({ content: '{"urgency":"CRITICAL"}', source: 'live' });
    expect(openaiClient.chat.completions.create).toHaveBeenCalledTimes(1);
    expect(upserts).toHaveLength(1);
    expect((upserts[0] as { hit_count: number }).hit_count).toBe(0);
    expect((inserts[0] as { outcome: string }).outcome).toBe('live');
  });
});

describe('createOpenAiLLMClient — 폴백 경로', () => {
  it('실호출이 실패해도 폴백 응답이 있으면 던지지 않고 source:"fallback"을 반환한다', async () => {
    const { client: supabase, inserts } = createFakeSupabase({
      cacheRow: null,
      userLiveCount: 0,
      globalLiveCount: 0,
    });
    const openaiClient = failingOpenAiClient(new Error('network down'));
    const fallbackEntry: FallbackResponseEntry = { step, content: '{"urgency":"NORMAL"}' };
    const llm = createOpenAiLLMClient(undefined, {
      supabase,
      openaiClient,
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
    const openaiClient = failingOpenAiClient(new Error('network down'));
    const llm = createOpenAiLLMClient(undefined, {
      supabase,
      openaiClient,
      fallbackLookup: noFallback,
    });

    await expect(llm.complete(step, 'v1', { text: 'hello' })).rejects.toBeInstanceOf(
      LLMUnavailableError,
    );
    expect((inserts[0] as { outcome: string }).outcome).toBe('error');
  });
});

describe('createOpenAiLLMClient — 세션당(사용자·일) 요청 상한 초과', () => {
  it('사용자 상한을 초과하면 OpenAI를 호출하지 않고 곧바로 폴백으로 간다(AC-041)', async () => {
    const { client: supabase } = createFakeSupabase({
      cacheRow: null,
      userLiveCount: 5, // MAX_LLM_CALLS_PER_USER_PER_DAY=5 도달
      globalLiveCount: 0,
    });
    const openaiClient = fakeOpenAiClient('should-not-be-called');
    const fallbackEntry: FallbackResponseEntry = { step, content: '{"urgency":"NORMAL"}' };
    const llm = createOpenAiLLMClient('user-1', {
      supabase,
      openaiClient,
      fallbackLookup: () => fallbackEntry,
    });

    const result = await llm.complete(step, 'v1', { text: 'hello' });

    expect(result).toEqual({ content: '{"urgency":"NORMAL"}', source: 'fallback' });
    expect(openaiClient.chat.completions.create).not.toHaveBeenCalled();
  });

  it('전역 상한을 초과하면 OpenAI를 호출하지 않고 곧바로 폴백으로 간다(AC-041)', async () => {
    const { client: supabase } = createFakeSupabase({
      cacheRow: null,
      userLiveCount: 0,
      globalLiveCount: 50, // MAX_LLM_CALLS_GLOBAL_PER_DAY=50 도달
    });
    const openaiClient = fakeOpenAiClient('should-not-be-called');
    const fallbackEntry: FallbackResponseEntry = { step, content: '{"urgency":"NORMAL"}' };
    const llm = createOpenAiLLMClient(undefined, {
      supabase,
      openaiClient,
      fallbackLookup: () => fallbackEntry,
    });

    const result = await llm.complete(step, 'v1', { text: 'hello' });

    expect(result).toEqual({ content: '{"urgency":"NORMAL"}', source: 'fallback' });
    expect(openaiClient.chat.completions.create).not.toHaveBeenCalled();
  });
});

describe('createOpenAiLLMClient — 로그 금지 항목(원문 미기록)', () => {
  it('llm_call_log insert 인자에 payload 원문이 들어가지 않는다(길이만 기록)', async () => {
    const { client: supabase, inserts } = createFakeSupabase({
      cacheRow: null,
      userLiveCount: 0,
      globalLiveCount: 0,
    });
    const openaiClient = fakeOpenAiClient('{"urgency":"CRITICAL"}');
    const llm = createOpenAiLLMClient('user-1', {
      supabase,
      openaiClient,
      fallbackLookup: noFallback,
    });

    await llm.complete(step, 'v1', { text: 'SUPER_SECRET_MESSAGE_BODY' });

    const logged = JSON.stringify(inserts[0]);
    expect(logged).not.toContain('SUPER_SECRET_MESSAGE_BODY');
    expect((inserts[0] as { input_chars: number }).input_chars).toBeGreaterThan(0);
  });
});

describe('createOpenAiLLMClient — OPENAI_MODEL 미설정(Major 1)', () => {
  it('OPENAI_MODEL이 비어있으면 폴백으로 조용히 내려가지 않고 던진다', async () => {
    const previous = process.env.OPENAI_MODEL;
    delete process.env.OPENAI_MODEL;
    try {
      const { client: supabase } = createFakeSupabase({ cacheRow: null });
      const openaiClient = fakeOpenAiClient('should-not-be-called');
      const llm = createOpenAiLLMClient(undefined, {
        supabase,
        openaiClient,
        fallbackLookup: noFallback,
      });

      await expect(llm.complete(step, 'v1', { text: 'hello' })).rejects.toThrow(/OPENAI_MODEL/);
      expect(openaiClient.chat.completions.create).not.toHaveBeenCalled();
    } finally {
      process.env.OPENAI_MODEL = previous;
    }
  });
});

describe('createOpenAiLLMClient — 응답 검증(Critical, LLM_MALFORMED)', () => {
  it('content가 유효한 JSON이 아니면 캐시에 저장하지 않고 폴백으로 내려간다', async () => {
    const {
      client: supabase,
      upserts,
      inserts,
    } = createFakeSupabase({
      cacheRow: null,
      userLiveCount: 0,
      globalLiveCount: 0,
    });
    const openaiClient = fakeOpenAiClient('이것은 JSON이 아닙니다{{{');
    const fallbackEntry: FallbackResponseEntry = { step, content: '{"urgency":"NORMAL"}' };
    const llm = createOpenAiLLMClient(undefined, {
      supabase,
      openaiClient,
      fallbackLookup: () => fallbackEntry,
    });

    const result = await llm.complete(step, 'v1', { text: 'hello' });

    expect(result).toEqual({ content: '{"urgency":"NORMAL"}', source: 'fallback' });
    expect(upserts).toHaveLength(0);
    expect((inserts[0] as { outcome: string; error_code: string }).outcome).toBe('fallback');
    expect((inserts[0] as { outcome: string; error_code: string }).error_code).toBe(
      'LLM_MALFORMED',
    );
  });

  it('content가 유효한 JSON이 아니고 폴백도 없으면 LLMUnavailableError를 던진다(오염된 응답은 절대 캐시되지 않는다)', async () => {
    const {
      client: supabase,
      upserts,
      inserts,
    } = createFakeSupabase({
      cacheRow: null,
      userLiveCount: 0,
      globalLiveCount: 0,
    });
    const openaiClient = fakeOpenAiClient('이것은 JSON이 아닙니다{{{');
    const llm = createOpenAiLLMClient(undefined, {
      supabase,
      openaiClient,
      fallbackLookup: noFallback,
    });

    await expect(llm.complete(step, 'v1', { text: 'hello' })).rejects.toBeInstanceOf(
      LLMUnavailableError,
    );
    expect(upserts).toHaveLength(0);
    expect((inserts[0] as { error_code: string }).error_code).toBe('LLM_MALFORMED');
  });
});

describe('createOpenAiLLMClient — 캐시/로그 쓰기 실패가 이미 확보한 응답을 죽이지 않는다(Major 2, Major 3)', () => {
  it('llm_cache 조회(lookupCache) 실패는 캐시 미스로 강등되어 실호출로 이어진다', async () => {
    const { client: supabase } = createFakeSupabase({
      cacheSelectError: { message: 'connection reset' },
      userLiveCount: 0,
      globalLiveCount: 0,
    });
    const openaiClient = fakeOpenAiClient('{"urgency":"CRITICAL"}');
    const llm = createOpenAiLLMClient(undefined, {
      supabase,
      openaiClient,
      fallbackLookup: noFallback,
    });

    const result = await llm.complete(step, 'v1', { text: 'hello' });

    expect(result).toEqual({ content: '{"urgency":"CRITICAL"}', source: 'live' });
    expect(openaiClient.chat.completions.create).toHaveBeenCalledTimes(1);
  });

  it('recordCacheHit(hit_count 갱신) 실패는 이미 찾은 캐시 응답 반환을 막지 않는다', async () => {
    const { client: supabase } = createFakeSupabase({
      cacheRow: { response: '{"urgency":"NORMAL"}', hit_count: 3 },
      cacheUpdateError: { message: 'write failed' },
    });
    const openaiClient = fakeOpenAiClient('should-not-be-used');
    const llm = createOpenAiLLMClient(undefined, {
      supabase,
      openaiClient,
      fallbackLookup: noFallback,
    });

    const result = await llm.complete(step, 'v1', { text: 'hello' });

    expect(result).toEqual({ content: '{"urgency":"NORMAL"}', source: 'cache' });
  });

  it('recordCallLog(llm_call_log insert) 실패는 이미 확보한 성공 응답 반환을 막지 않는다', async () => {
    const { client: supabase } = createFakeSupabase({
      cacheRow: { response: '{"urgency":"NORMAL"}', hit_count: 3 },
      callLogInsertError: { message: 'insert failed' },
    });
    const openaiClient = fakeOpenAiClient('should-not-be-used');
    const llm = createOpenAiLLMClient(undefined, {
      supabase,
      openaiClient,
      fallbackLookup: noFallback,
    });

    const result = await llm.complete(step, 'v1', { text: 'hello' });

    expect(result).toEqual({ content: '{"urgency":"NORMAL"}', source: 'cache' });
  });

  it('saveCacheEntry(llm_cache upsert) 실패는 이미 성공한 실호출을 fallback으로 오기록하지 않는다', async () => {
    const { client: supabase, inserts } = createFakeSupabase({
      cacheRow: null,
      cacheUpsertError: { message: 'upsert failed' },
      userLiveCount: 0,
      globalLiveCount: 0,
    });
    const openaiClient = fakeOpenAiClient('{"urgency":"CRITICAL"}');
    const llm = createOpenAiLLMClient('user-1', {
      supabase,
      openaiClient,
      fallbackLookup: noFallback,
    });

    const result = await llm.complete(step, 'v1', { text: 'urgent!' });

    expect(result).toEqual({ content: '{"urgency":"CRITICAL"}', source: 'live' });
    expect((inserts[0] as { outcome: string }).outcome).toBe('live');
  });
});

describe('createOpenAiLLMClient — 상한초과+폴백없음 에러 타입(Major 4)', () => {
  it('요청 상한 초과(OpenAI 미호출) + 폴백 없음 → QuotaExceededError를 던진다(retryable=false)', async () => {
    const { client: supabase, inserts } = createFakeSupabase({
      cacheRow: null,
      userLiveCount: 5, // MAX_LLM_CALLS_PER_USER_PER_DAY=5 도달
      globalLiveCount: 0,
    });
    const openaiClient = fakeOpenAiClient('should-not-be-called');
    const llm = createOpenAiLLMClient('user-1', {
      supabase,
      openaiClient,
      fallbackLookup: noFallback,
    });

    await expect(llm.complete(step, 'v1', { text: 'hello' })).rejects.toBeInstanceOf(
      QuotaExceededError,
    );
    expect(openaiClient.chat.completions.create).not.toHaveBeenCalled();
    expect((inserts[0] as { error_code: string }).error_code).toBe('QUOTA_EXCEEDED_USER');
  });

  it('실제 호출 실패(liveError) + 폴백 없음은 여전히 LLMUnavailableError다(retryable=true)', async () => {
    const { client: supabase } = createFakeSupabase({
      cacheRow: null,
      userLiveCount: 0,
      globalLiveCount: 0,
    });
    const openaiClient = failingOpenAiClient(new Error('network down'));
    const llm = createOpenAiLLMClient(undefined, {
      supabase,
      openaiClient,
      fallbackLookup: noFallback,
    });

    await expect(llm.complete(step, 'v1', { text: 'hello' })).rejects.toBeInstanceOf(
      LLMUnavailableError,
    );
  });

  it('전역 상한 초과 + 폴백 있음 → error_code가 QUOTA_EXCEEDED_GLOBAL로 분리 기록된다', async () => {
    const { client: supabase, inserts } = createFakeSupabase({
      cacheRow: null,
      userLiveCount: 0,
      globalLiveCount: 50, // MAX_LLM_CALLS_GLOBAL_PER_DAY=50 도달
    });
    const openaiClient = fakeOpenAiClient('should-not-be-called');
    const fallbackEntry: FallbackResponseEntry = { step, content: '{"urgency":"NORMAL"}' };
    const llm = createOpenAiLLMClient(undefined, {
      supabase,
      openaiClient,
      fallbackLookup: () => fallbackEntry,
    });

    const result = await llm.complete(step, 'v1', { text: 'hello' });

    expect(result).toEqual({ content: '{"urgency":"NORMAL"}', source: 'fallback' });
    expect((inserts[0] as { error_code: string }).error_code).toBe('QUOTA_EXCEEDED_GLOBAL');
  });
});

describe('createOpenAiLLMClient — MAX_LLM_CALLS_* 설정 오류는 fail-closed로 위장되지 않는다(QA 2차 F-A)', () => {
  it('MAX_LLM_CALLS_GLOBAL_PER_DAY가 비어있으면(설정 오류) LLMUnavailableError로 위장되지 않고 파싱 에러가 그대로 던져진다', async () => {
    const previous = process.env.MAX_LLM_CALLS_GLOBAL_PER_DAY;
    process.env.MAX_LLM_CALLS_GLOBAL_PER_DAY = '';
    try {
      const { client: supabase } = createFakeSupabase({ cacheRow: null });
      const openaiClient = fakeOpenAiClient('should-not-be-called');
      const llm = createOpenAiLLMClient(undefined, {
        supabase,
        openaiClient,
        fallbackLookup: noFallback,
      });

      await expect(llm.complete(step, 'v1', { text: 'hello' })).rejects.toThrow(
        /MAX_LLM_CALLS_GLOBAL_PER_DAY/,
      );
      expect(openaiClient.chat.completions.create).not.toHaveBeenCalled();
    } finally {
      process.env.MAX_LLM_CALLS_GLOBAL_PER_DAY = previous;
    }
  });

  it('MAX_LLM_CALLS_PER_USER_PER_DAY가 정수가 아니면(설정 오류) LLMUnavailableError로 위장되지 않고 파싱 에러가 그대로 던져진다', async () => {
    const previous = process.env.MAX_LLM_CALLS_PER_USER_PER_DAY;
    process.env.MAX_LLM_CALLS_PER_USER_PER_DAY = 'not-a-number';
    try {
      const { client: supabase } = createFakeSupabase({ cacheRow: null });
      const openaiClient = fakeOpenAiClient('should-not-be-called');
      const llm = createOpenAiLLMClient('user-1', {
        supabase,
        openaiClient,
        fallbackLookup: noFallback,
      });

      await expect(llm.complete(step, 'v1', { text: 'hello' })).rejects.toThrow(
        /MAX_LLM_CALLS_PER_USER_PER_DAY/,
      );
      expect(openaiClient.chat.completions.create).not.toHaveBeenCalled();
    } finally {
      process.env.MAX_LLM_CALLS_PER_USER_PER_DAY = previous;
    }
  });
});

describe('createOpenAiLLMClient — 타임아웃/연결실패 error_code 구분(reviewer 3차 Major M-A)', () => {
  it('APIConnectionTimeoutError(타임아웃)는 UNKNOWN이 아니라 LLM_TIMEOUT으로 기록된다', async () => {
    const { client: supabase, inserts } = createFakeSupabase({
      cacheRow: null,
      userLiveCount: 0,
      globalLiveCount: 0,
    });
    const openaiClient = failingOpenAiClient(new OpenAI.APIConnectionTimeoutError());
    const llm = createOpenAiLLMClient(undefined, {
      supabase,
      openaiClient,
      fallbackLookup: noFallback,
    });

    await expect(llm.complete(step, 'v1', { text: 'hello' })).rejects.toBeInstanceOf(
      LLMUnavailableError,
    );
    expect((inserts[0] as { error_code: string }).error_code).toBe('LLM_TIMEOUT');
  });

  it('타임아웃이 아닌 APIConnectionError(연결실패)는 LLM_UNAVAILABLE로 기록된다', async () => {
    const { client: supabase, inserts } = createFakeSupabase({
      cacheRow: null,
      userLiveCount: 0,
      globalLiveCount: 0,
    });
    const openaiClient = failingOpenAiClient(
      new OpenAI.APIConnectionError({ message: 'connect refused' }),
    );
    const llm = createOpenAiLLMClient(undefined, {
      supabase,
      openaiClient,
      fallbackLookup: noFallback,
    });

    await expect(llm.complete(step, 'v1', { text: 'hello' })).rejects.toBeInstanceOf(
      LLMUnavailableError,
    );
    expect((inserts[0] as { error_code: string }).error_code).toBe('LLM_UNAVAILABLE');
  });

  it('숫자 status를 가진 APIError는 HTTP_429처럼 UPPER_SNAKE로 감싸 기록된다', async () => {
    const { client: supabase, inserts } = createFakeSupabase({
      cacheRow: null,
      userLiveCount: 0,
      globalLiveCount: 0,
    });
    const openaiClient = failingOpenAiClient(
      new OpenAI.APIError(429, { message: 'rate limited' }, 'rate limited', undefined),
    );
    const llm = createOpenAiLLMClient(undefined, {
      supabase,
      openaiClient,
      fallbackLookup: noFallback,
    });

    await expect(llm.complete(step, 'v1', { text: 'hello' })).rejects.toBeInstanceOf(
      LLMUnavailableError,
    );
    expect((inserts[0] as { error_code: string }).error_code).toBe('HTTP_429');
  });
});

describe('createOpenAiLLMClient — 요청 상한 조회 자체가 실패한다(reviewer 2차 Major M-1)', () => {
  it('checkRequestLimit이 PostgrestError를 던져도 무방비로 새지 않고 fail-closed로 폴백 경로로 간다', async () => {
    const { client: supabase, inserts } = createFakeSupabase({
      cacheRow: null,
      rateLimitCountError: { message: 'connection reset' },
    });
    const openaiClient = fakeOpenAiClient('should-not-be-called');
    const fallbackEntry: FallbackResponseEntry = { step, content: '{"urgency":"NORMAL"}' };
    const llm = createOpenAiLLMClient('user-1', {
      supabase,
      openaiClient,
      fallbackLookup: () => fallbackEntry,
    });

    const result = await llm.complete(step, 'v1', { text: 'hello' });

    expect(result).toEqual({ content: '{"urgency":"NORMAL"}', source: 'fallback' });
    expect(openaiClient.chat.completions.create).not.toHaveBeenCalled();
    // 진짜 상한 도달(QUOTA_EXCEEDED_*)과 섞이면 안 된다 — 상한을 "못 셌다"는 별도 코드다.
    expect((inserts[0] as { error_code: string }).error_code).toBe('QUOTA_CHECK_FAILED');
  });

  it('checkRequestLimit이 PostgrestError를 던지고 폴백도 없으면 LLMUnavailableError를 던진다(재시도하면 성공할 수도 있다)', async () => {
    const { client: supabase, inserts } = createFakeSupabase({
      cacheRow: null,
      rateLimitCountError: { message: 'connection reset' },
    });
    const openaiClient = fakeOpenAiClient('should-not-be-called');
    const llm = createOpenAiLLMClient('user-1', {
      supabase,
      openaiClient,
      fallbackLookup: noFallback,
    });

    await expect(llm.complete(step, 'v1', { text: 'hello' })).rejects.toBeInstanceOf(
      LLMUnavailableError,
    );
    expect(openaiClient.chat.completions.create).not.toHaveBeenCalled();
    expect((inserts[0] as { error_code: string }).error_code).toBe('QUOTA_CHECK_FAILED');
  });
});
