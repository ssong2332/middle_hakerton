/**
 * T71 — `observation_samples` insert. Supabase는 실제로 호출하지 않고 최소 체이닝만 흉내내는
 * 페이크로 검증한다(`apps/web/lib/enrichment/storage.test.ts`와 같은 모킹 정책).
 */
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { IndicatorDeltas } from '@cross-border/core';
import { insertSample, type InsertSampleInput } from './storage';

interface FakeHandle {
  client: SupabaseClient;
  insertCalls: Array<{ values: unknown }>;
}

function createFakeSupabase(
  options: {
    row?: { id: string; counterpart_identifier: string; source: 'manual' | 'github'; collected_at: string };
    error?: { message: string } | null;
  } = {},
): FakeHandle {
  const insertCalls: Array<{ values: unknown }> = [];
  const client = {
    from(table: string) {
      if (table !== 'observation_samples') throw new Error(`unexpected table: ${table}`);
      return {
        insert: (values: unknown) => {
          insertCalls.push({ values });
          return {
            select: () => ({
              single: async () => ({
                data: options.error
                  ? null
                  : (options.row ?? {
                      id: 'sample-1',
                      counterpart_identifier: 'boss@example.com',
                      source: 'manual',
                      collected_at: '2026-08-11T00:00:00Z',
                    }),
                error: options.error ?? null,
              }),
            }),
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, insertCalls };
}

const SAMPLE_DELTAS: IndicatorDeltas = {
  sentenceCount: 2,
  emojiCount: 0,
  charCount: 20,
  hedgeCount: 1,
  addressFormKind: null,
  deadlineMentionKind: null,
};

const baseInput: InsertSampleInput = {
  userId: 'user-1',
  counterpartIdentifier: 'boss@example.com',
  source: 'manual',
  indicatorDeltas: SAMPLE_DELTAS,
};

describe('insertSample', () => {
  it('입력을 snake_case 컬럼으로 매핑해 insert한다(원문 필드 없음)', async () => {
    const { client, insertCalls } = createFakeSupabase();

    await insertSample(client, baseInput);

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].values).toEqual({
      owner_user_id: 'user-1',
      counterpart_identifier: 'boss@example.com',
      source: 'manual',
      indicator_deltas: SAMPLE_DELTAS,
    });
  });

  it('원문 텍스트를 실을 자리가 타입에 없다(G1) — payload 키에 raw_text류가 없음을 확인', async () => {
    const { client, insertCalls } = createFakeSupabase();

    await insertSample(client, baseInput);

    const keys = Object.keys(insertCalls[0].values as object);
    expect(keys.some((k) => /raw|text|excerpt|quote/i.test(k))).toBe(false);
  });

  it('결과를 camelCase로 변환해 반환한다', async () => {
    const { client } = createFakeSupabase({
      row: { id: 'sample-2', counterpart_identifier: 'tanaka@example.com', source: 'manual', collected_at: '2026-08-11T05:00:00Z' },
    });

    const result = await insertSample(client, baseInput);

    expect(result).toEqual({
      id: 'sample-2',
      counterpartIdentifier: 'tanaka@example.com',
      source: 'manual',
      collectedAt: '2026-08-11T05:00:00Z',
    });
  });

  it('insert가 실패하면 에러를 던진다(삼키지 않는다)', async () => {
    const { client } = createFakeSupabase({ error: { message: 'insert failed' } });

    await expect(insertSample(client, baseInput)).rejects.toBeTruthy();
  });

  it('collectedAt이 제공되면 payload에 실어 보낸다', async () => {
    const { client, insertCalls } = createFakeSupabase();

    await insertSample(client, { ...baseInput, collectedAt: '2026-08-11T09:00:00Z' });

    expect(insertCalls[0].values).toMatchObject({ collected_at: '2026-08-11T09:00:00Z' });
  });

  it('collectedAt이 없으면 payload에 싣지 않는다(DB 기본값 default now()에 맡긴다)', async () => {
    const { client, insertCalls } = createFakeSupabase();

    await insertSample(client, baseInput);

    expect(insertCalls[0].values).not.toHaveProperty('collected_at');
  });
});
