/**
 * T64 — `recipient_enrichments` upsert. Supabase는 실제로 호출하지 않고 최소 체이닝만
 * 흉내내는 페이크로 검증한다(`apps/web/lib/messages/storage.test.ts`와 같은 모킹 정책).
 */
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { upsertEnrichment, type UpsertEnrichmentInput } from './storage';

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
