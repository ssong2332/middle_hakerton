/**
 * T66 — `fetchCounterparts()` (AC-067①). 페이크 Supabase 체이닝으로 검증한다
 * (`apps/web/lib/dictionary/storage.test.ts`와 같은 모킹 정책).
 */
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchCounterparts } from './storage';

function createFakeSupabase(
  options: { rows?: unknown[]; error?: { message: string } | null } = {},
): { client: SupabaseClient; selectCalls: string[] } {
  const selectCalls: string[] = [];

  const client = {
    from(table: string) {
      if (table !== 'pair_protocols') throw new Error(`unexpected table: ${table}`);
      return {
        select: (columns: string) => {
          selectCalls.push(columns);
          return Promise.resolve({
            data: options.error ? null : (options.rows ?? []),
            error: options.error ?? null,
          });
        },
      };
    },
  } as unknown as SupabaseClient;

  return { client, selectCalls };
}

describe('fetchCounterparts', () => {
  it('RLS가 이미 스코프한 행에서 party_a/party_b 컬럼만 읽는다(추가 .eq() 없음)', async () => {
    const { client, selectCalls } = createFakeSupabase({ rows: [] });

    await fetchCounterparts(client, 'me@example.com');

    expect(selectCalls).toEqual(['party_a, party_b']);
  });

  it('내 이메일이 party_a면 party_b를, party_b면 party_a를 상대방으로 반환한다', async () => {
    const { client } = createFakeSupabase({
      rows: [
        { party_a: 'me@example.com', party_b: 'tanaka@sakuradigital.example' },
        { party_a: 'michael@vertexlabs.example', party_b: 'me@example.com' },
      ],
    });

    const result = await fetchCounterparts(client, 'me@example.com');

    expect(result).toEqual(['tanaka@sakuradigital.example', 'michael@vertexlabs.example']);
  });

  it('규약이 없으면 빈 배열을 반환한다(AC-067④ — 이 경로가 없어도 미지정 경로는 그대로 동작)', async () => {
    const { client } = createFakeSupabase({ rows: [] });

    const result = await fetchCounterparts(client, 'me@example.com');

    expect(result).toEqual([]);
  });

  it('조회 에러는 삼키지 않고 던진다', async () => {
    const { client } = createFakeSupabase({ error: { message: 'boom' } });

    await expect(fetchCounterparts(client, 'me@example.com')).rejects.toMatchObject({
      message: 'boom',
    });
  });
});
