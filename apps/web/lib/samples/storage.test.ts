/**
 * T71 — `observation_samples` insert. Supabase는 실제로 호출하지 않고 최소 체이닝만 흉내내는
 * 페이크로 검증한다(`apps/web/lib/enrichment/storage.test.ts`와 같은 모킹 정책).
 */
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { IndicatorDeltas } from '@cross-border/core';
import { deleteSample, insertSample, listSamples, type InsertSampleInput } from './storage';

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

interface FakeListHandle {
  client: SupabaseClient;
  eqCalls: string[];
}

function createFakeListSupabase(
  options: {
    rows?: Array<{
      id: string;
      counterpart_identifier: string;
      source: 'manual' | 'github';
      indicator_deltas: IndicatorDeltas;
      collected_at: string;
    }>;
    error?: { message: string } | null;
  } = {},
): FakeListHandle {
  const eqCalls: string[] = [];
  const client = {
    from(table: string) {
      if (table !== 'observation_samples') throw new Error(`unexpected table: ${table}`);
      return {
        select: () => ({
          eq: (column: string, value: string) => {
            eqCalls.push(`${column}=${value}`);
            return {
              order: async () => ({
                data: options.error ? null : (options.rows ?? []),
                error: options.error ?? null,
              }),
            };
          },
        }),
      };
    },
  } as unknown as SupabaseClient;
  return { client, eqCalls };
}

describe('listSamples', () => {
  it('owner_user_id로 필터링해 조회한다', async () => {
    const { client, eqCalls } = createFakeListSupabase({ rows: [] });

    await listSamples(client, 'user-1');

    expect(eqCalls).toEqual(['owner_user_id=user-1']);
  });

  it('행이 없으면 빈 counterparts/samples를 반환한다', async () => {
    const { client } = createFakeListSupabase({ rows: [] });

    const result = await listSamples(client, 'user-1');

    expect(result).toEqual({ counterparts: [], samples: [] });
  });

  it('상대별로 total·bySource를 롤업한다(AC-080⑤)', async () => {
    const { client } = createFakeListSupabase({
      rows: [
        { id: 's1', counterpart_identifier: 'tanaka@example.com', source: 'manual', indicator_deltas: SAMPLE_DELTAS, collected_at: '2026-08-11T00:00:00Z' },
        { id: 's2', counterpart_identifier: 'tanaka@example.com', source: 'manual', indicator_deltas: SAMPLE_DELTAS, collected_at: '2026-08-11T01:00:00Z' },
        { id: 's3', counterpart_identifier: 'tanaka@example.com', source: 'github', indicator_deltas: SAMPLE_DELTAS, collected_at: '2026-08-11T02:00:00Z' },
        { id: 's4', counterpart_identifier: 'michael@example.com', source: 'manual', indicator_deltas: SAMPLE_DELTAS, collected_at: '2026-08-11T03:00:00Z' },
      ],
    });

    const result = await listSamples(client, 'user-1');

    expect(result.counterparts).toEqual([
      { counterpart: 'tanaka@example.com', total: 3, bySource: { manual: 2, github: 1 } },
      { counterpart: 'michael@example.com', total: 1, bySource: { manual: 1, github: 0 } },
    ]);
  });

  it('samples 목록은 원문 없이 id/counterpart/source/collectedAt/indicatorContribution만 담는다(G1)', async () => {
    const { client } = createFakeListSupabase({
      rows: [
        { id: 's1', counterpart_identifier: 'tanaka@example.com', source: 'manual', indicator_deltas: SAMPLE_DELTAS, collected_at: '2026-08-11T00:00:00Z' },
      ],
    });

    const result = await listSamples(client, 'user-1');

    expect(result.samples).toEqual([
      {
        id: 's1',
        counterpart: 'tanaka@example.com',
        source: 'manual',
        collectedAt: '2026-08-11T00:00:00Z',
        indicatorContribution: SAMPLE_DELTAS,
      },
    ]);
    const keys = Object.keys(result.samples[0]);
    expect(keys.some((k) => /raw|excerpt|quote/i.test(k))).toBe(false);
  });

  it('조회가 실패하면 에러를 던진다', async () => {
    const { client } = createFakeListSupabase({ error: { message: 'select failed' } });

    await expect(listSamples(client, 'user-1')).rejects.toBeTruthy();
  });
});

interface FakeDeleteHandle {
  client: SupabaseClient;
  eqCalls: string[];
}

function createFakeDeleteSupabase(
  options: { deletedRows?: Array<{ id: string }>; error?: { message: string } | null } = {},
): FakeDeleteHandle {
  const eqCalls: string[] = [];
  const client = {
    from(table: string) {
      if (table !== 'observation_samples') throw new Error(`unexpected table: ${table}`);
      return {
        delete: () => ({
          eq: (column: string, value: string) => {
            eqCalls.push(`${column}=${value}`);
            return {
              eq: (column2: string, value2: string) => {
                eqCalls.push(`${column2}=${value2}`);
                return {
                  select: async () => ({
                    data: options.error ? null : (options.deletedRows ?? [{ id: 'sample-1' }]),
                    error: options.error ?? null,
                  }),
                };
              },
            };
          },
        }),
      };
    },
  } as unknown as SupabaseClient;
  return { client, eqCalls };
}

describe('deleteSample', () => {
  it('id·owner_user_id 둘 다로 필터링해 삭제한다(타인 소유 방어)', async () => {
    const { client, eqCalls } = createFakeDeleteSupabase();

    await deleteSample(client, 'user-1', 'sample-1');

    expect(eqCalls).toEqual(['id=sample-1', 'owner_user_id=user-1']);
  });

  it('삭제된 행이 없으면(타인 소유이거나 이미 삭제됨) NotFoundError를 던진다(조용히 no-op하지 않는다)', async () => {
    const { client } = createFakeDeleteSupabase({ deletedRows: [] });

    await expect(deleteSample(client, 'user-1', 'sample-1')).rejects.toThrow();
  });

  it('삭제가 실패하면 에러를 던진다', async () => {
    const { client } = createFakeDeleteSupabase({ error: { message: 'delete failed' } });

    await expect(deleteSample(client, 'user-1', 'sample-1')).rejects.toBeTruthy();
  });
});
