/**
 * T22 — C5 용어사전 조회 (`dictionary_terms`). Supabase는 실제로 호출하지 않고 최소 체이닝만
 * 흉내내는 페이크로 검증한다(`apps/web/lib/messages/pattern-learning.test.ts`와 같은 모킹 정책).
 */
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchDictionaryEntries } from './storage';

interface FakeHandle {
  client: SupabaseClient;
  eqCalls: Array<[string, unknown]>;
  selectCalls: string[];
}

function createFakeSupabase(
  options: { rows?: unknown[]; error?: { message: string } | null } = {},
): FakeHandle {
  const eqCalls: Array<[string, unknown]> = [];
  const selectCalls: string[] = [];

  const client = {
    from(table: string) {
      if (table !== 'dictionary_terms') throw new Error(`unexpected table: ${table}`);
      return {
        select: (columns: string) => {
          selectCalls.push(columns);
          return {
            eq: (column: string, value: unknown) => {
              eqCalls.push([column, value]);
              return Promise.resolve({
                data: options.error ? null : (options.rows ?? []),
                error: options.error ?? null,
              });
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;

  return { client, eqCalls, selectCalls };
}

describe('fetchDictionaryEntries', () => {
  it('owner_user_id로 스코프해 조회한다(AC-016 — 사용자 스코프, docs/Database.md dictionary_terms)', async () => {
    const { client, eqCalls } = createFakeSupabase({ rows: [] });

    await fetchDictionaryEntries(client, 'user-1');

    expect(eqCalls).toEqual([['owner_user_id', 'user-1']]);
  });

  it('비어 있으면 []를 반환한다(AC-015 위반 없음 — 사전 미등록도 정상 상태)', async () => {
    const { client } = createFakeSupabase({ rows: [] });

    const result = await fetchDictionaryEntries(client, 'user-1');

    expect(result).toEqual([]);
  });

  it('term 엔트리를 core의 DictionaryEntry(camelCase)로 변환한다(AC-015)', async () => {
    const { client } = createFakeSupabase({
      rows: [
        {
          entry_type: 'term',
          source_text: 'SLA',
          target_text: 'SLA',
          ko_honorific: null,
          en_honorific: null,
        },
      ],
    });

    const result = await fetchDictionaryEntries(client, 'user-1');

    expect(result).toEqual([
      {
        entryType: 'term',
        sourceText: 'SLA',
        targetText: 'SLA',
        koHonorific: null,
        enHonorific: null,
      },
    ]);
  });

  it('person 엔트리(실명/한국어 호칭/영어 호칭)를 그대로 변환한다(AC-047①)', async () => {
    const { client } = createFakeSupabase({
      rows: [
        {
          entry_type: 'person',
          source_text: '김수진',
          target_text: null,
          ko_honorific: '김 대리님',
          en_honorific: 'Sujin Kim',
        },
      ],
    });

    const result = await fetchDictionaryEntries(client, 'user-1');

    expect(result).toEqual([
      {
        entryType: 'person',
        sourceText: '김수진',
        targetText: null,
        koHonorific: '김 대리님',
        enHonorific: 'Sujin Kim',
      },
    ]);
  });

  it('en_honorific이 null인 person 엔트리는 null을 그대로 보존한다(AC-047②③ — 추측 생성 금지의 전제)', async () => {
    const { client } = createFakeSupabase({
      rows: [
        {
          entry_type: 'person',
          source_text: '이민호',
          target_text: null,
          ko_honorific: '이 팀장님',
          en_honorific: null,
        },
      ],
    });

    const result = await fetchDictionaryEntries(client, 'user-1');

    expect(result[0].enHonorific).toBeNull();
  });

  it('조회 실패 시 에러를 던진다(에러 삼키기 금지)', async () => {
    const { client } = createFakeSupabase({ error: { message: 'connection failed' } });

    await expect(fetchDictionaryEntries(client, 'user-1')).rejects.toEqual({
      message: 'connection failed',
    });
  });
});
