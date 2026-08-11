/**
 * T64 — `recipient_enrichments` upsert. Supabase는 실제로 호출하지 않고 최소 체이닝만
 * 흉내내는 페이크로 검증한다(`apps/web/lib/messages/storage.test.ts`와 같은 모킹 정책).
 */
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  deleteEnrichment,
  getEnrichment,
  updateEnrichment,
  upsertEnrichment,
  type UpdateEnrichmentInput,
  type UpsertEnrichmentInput,
} from './storage';

interface FakeHandle {
  client: SupabaseClient;
  upsertCalls: Array<{ values: unknown; options: unknown }>;
}

function createFakeSupabase(
  options: {
    row?: {
      location: string | null;
      company: string | null;
      activity_hour_histogram: number[] | null;
      activity_sample_count: number;
      fetched_at: string;
      source_url: string;
    };
    error?: { message: string } | null;
  } = {},
): FakeHandle {
  const upsertCalls: Array<{ values: unknown; options: unknown }> = [];
  const client = {
    from(table: string) {
      if (table !== 'recipient_enrichments') throw new Error(`unexpected table: ${table}`);
      return {
        upsert: (values: unknown, upsertOptions: unknown) => {
          upsertCalls.push({ values, options: upsertOptions });
          return {
            select: () => ({
              single: async () => ({
                data: options.error
                  ? null
                  : (options.row ?? {
                      location: 'Seoul',
                      company: '@example',
                      activity_hour_histogram: null,
                      activity_sample_count: 5,
                      fetched_at: '2026-08-11T00:00:00Z',
                      source_url: 'https://github.com/octocat',
                    }),
                error: options.error ?? null,
              }),
            }),
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, upsertCalls };
}

const baseInput: UpsertEnrichmentInput = {
  userId: 'user-1',
  recipientIdentifier: 'boss@example.com',
  sourceUrl: 'https://github.com/octocat',
  location: 'Seoul',
  company: '@example',
  activityHourHistogram: null,
  activitySampleCount: 5,
};

describe('upsertEnrichment', () => {
  it('입력을 snake_case 컬럼으로 매핑해 upsert하고 owner_user_id,recipient_identifier로 충돌 처리한다', async () => {
    const { client, upsertCalls } = createFakeSupabase();

    await upsertEnrichment(client, baseInput);

    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].values).toMatchObject({
      owner_user_id: 'user-1',
      recipient_identifier: 'boss@example.com',
      source_url: 'https://github.com/octocat',
      location: 'Seoul',
      company: '@example',
      activity_hour_histogram: null,
      activity_sample_count: 5,
    });
    expect(upsertCalls[0].options).toEqual({ onConflict: 'owner_user_id,recipient_identifier' });
  });

  it('결과를 camelCase로 변환해 반환한다', async () => {
    const { client } = createFakeSupabase({
      row: {
        location: 'Tokyo',
        company: null,
        activity_hour_histogram: [1, 2],
        activity_sample_count: 30,
        fetched_at: '2026-08-11T05:00:00Z',
        source_url: 'https://github.com/gaearon',
      },
    });

    const result = await upsertEnrichment(client, baseInput);

    expect(result).toEqual({
      location: 'Tokyo',
      company: null,
      activityHourHistogram: [1, 2],
      activitySampleCount: 30,
      fetchedAt: '2026-08-11T05:00:00Z',
      sourceUrl: 'https://github.com/gaearon',
    });
  });

  it('upsert가 실패하면 에러를 던진다(삼키지 않는다)', async () => {
    const { client } = createFakeSupabase({ error: { message: 'upsert failed' } });

    await expect(upsertEnrichment(client, baseInput)).rejects.toBeTruthy();
  });

  it('activity_timezone_confirmed는 payload에 싣지 않는다(사용자 확정 전까지 건드리지 않는다)', async () => {
    const { client, upsertCalls } = createFakeSupabase();

    await upsertEnrichment(client, baseInput);

    expect(upsertCalls[0].values).not.toHaveProperty('activity_timezone_confirmed');
  });
});

interface FakeSelectHandle {
  client: SupabaseClient;
  eqCalls: string[];
}

function createFakeSelectSupabase(
  options: {
    row?: {
      location: string | null;
      company: string | null;
      activity_hour_histogram: number[] | null;
      activity_sample_count: number;
      activity_timezone_confirmed: string | null;
      fetched_at: string;
      source_url: string;
    } | null;
    error?: { message: string } | null;
  } = {},
): FakeSelectHandle {
  const eqCalls: string[] = [];
  const client = {
    from(table: string) {
      if (table !== 'recipient_enrichments') throw new Error(`unexpected table: ${table}`);
      return {
        select: () => ({
          eq: (column: string, value: string) => {
            eqCalls.push(`${column}=${value}`);
            return {
              eq: (column2: string, value2: string) => {
                eqCalls.push(`${column2}=${value2}`);
                return {
                  maybeSingle: async () => ({
                    data: options.error ? null : (options.row ?? null),
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

describe('getEnrichment', () => {
  it('행이 없으면 null을 반환한다(기본값을 지어내지 않는다)', async () => {
    const { client } = createFakeSelectSupabase({ row: null });

    const result = await getEnrichment(client, 'user-1', 'boss@example.com');

    expect(result).toBeNull();
  });

  it('owner_user_id·recipient_identifier로 필터링하고 camelCase로 변환한다', async () => {
    const { client, eqCalls } = createFakeSelectSupabase({
      row: {
        location: 'Seoul',
        company: null,
        activity_hour_histogram: [1],
        activity_sample_count: 30,
        activity_timezone_confirmed: 'Asia/Seoul',
        fetched_at: '2026-08-11T00:00:00Z',
        source_url: 'https://github.com/octocat',
      },
    });

    const result = await getEnrichment(client, 'user-1', 'boss@example.com');

    expect(eqCalls).toEqual(['owner_user_id=user-1', 'recipient_identifier=boss@example.com']);
    expect(result).toEqual({
      location: 'Seoul',
      company: null,
      activityHourHistogram: [1],
      activitySampleCount: 30,
      activityTimezoneConfirmed: 'Asia/Seoul',
      fetchedAt: '2026-08-11T00:00:00Z',
      sourceUrl: 'https://github.com/octocat',
    });
  });

  it('조회가 실패하면 에러를 던진다', async () => {
    const { client } = createFakeSelectSupabase({ error: { message: 'select failed' } });

    await expect(getEnrichment(client, 'user-1', 'boss@example.com')).rejects.toBeTruthy();
  });
});

const baseUpdateInput: UpdateEnrichmentInput = {
  userId: 'user-1',
  recipientIdentifier: 'boss@example.com',
};

describe('updateEnrichment', () => {
  it('제공된 필드만 payload에 싣는다(부분 업데이트 — 나머지 컬럼은 건드리지 않는다)', async () => {
    const { client, upsertCalls } = createFakeSupabase({
      row: {
        location: null,
        company: null,
        activity_hour_histogram: null,
        activity_sample_count: 0,
        fetched_at: '2026-08-11T00:00:00Z',
        source_url: 'https://github.com/octocat',
      },
    });

    await updateEnrichment(client, { ...baseUpdateInput, activityTimezoneConfirmed: 'Asia/Seoul' });

    expect(upsertCalls[0].values).toEqual({
      owner_user_id: 'user-1',
      recipient_identifier: 'boss@example.com',
      activity_timezone_confirmed: 'Asia/Seoul',
    });
    expect(upsertCalls[0].options).toEqual({ onConflict: 'owner_user_id,recipient_identifier' });
  });

  it('activityTimezoneConfirmed:null(확정 해제)도 명시적으로 실어 보낸다', async () => {
    const { client, upsertCalls } = createFakeSupabase();

    await updateEnrichment(client, { ...baseUpdateInput, activityTimezoneConfirmed: null });

    expect(upsertCalls[0].values).toMatchObject({ activity_timezone_confirmed: null });
  });

  it('업데이트가 실패하면 에러를 던진다', async () => {
    const { client } = createFakeSupabase({ error: { message: 'update failed' } });

    await expect(
      updateEnrichment(client, { ...baseUpdateInput, activityTimezoneConfirmed: 'Asia/Seoul' }),
    ).rejects.toBeTruthy();
  });
});

interface FakeDeleteHandle {
  client: SupabaseClient;
  eqCalls: string[];
}

function createFakeDeleteSupabase(
  options: { error?: { message: string } | null } = {},
): FakeDeleteHandle {
  const eqCalls: string[] = [];
  const client = {
    from(table: string) {
      if (table !== 'recipient_enrichments') throw new Error(`unexpected table: ${table}`);
      return {
        delete: () => ({
          eq: (column: string, value: string) => {
            eqCalls.push(`${column}=${value}`);
            return {
              eq: async (column2: string, value2: string) => {
                eqCalls.push(`${column2}=${value2}`);
                return { error: options.error ?? null };
              },
            };
          },
        }),
      };
    },
  } as unknown as SupabaseClient;
  return { client, eqCalls };
}

describe('deleteEnrichment', () => {
  it('owner_user_id·recipient_identifier로 필터링해 삭제한다', async () => {
    const { client, eqCalls } = createFakeDeleteSupabase();

    await deleteEnrichment(client, 'user-1', 'boss@example.com');

    expect(eqCalls).toEqual(['owner_user_id=user-1', 'recipient_identifier=boss@example.com']);
  });

  it('삭제가 실패하면 에러를 던진다', async () => {
    const { client } = createFakeDeleteSupabase({ error: { message: 'delete failed' } });

    await expect(deleteEnrichment(client, 'user-1', 'boss@example.com')).rejects.toBeTruthy();
  });
});
