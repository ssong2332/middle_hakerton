/**
 * T61 — 데모 시드 DB I/O 테스트. Supabase는 실제로 호출하지 않고 최소 체이닝만 흉내내는
 * 페이크로 검증한다(`apps/web/lib/messages/pattern-learning.test.ts`와 같은 모킹 정책).
 */
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  applyJihoonLearningHistory,
  applyReflectedLearning,
  resetJihoonToPreLearningState,
  seedDemoData,
  seedDictionaryTerms,
  seedDiffHistory,
  seedPairProtocols,
  seedProfiles,
  type DemoSeedInput,
} from './seed';

interface FakeCalls {
  upserts: Record<string, unknown[]>;
  inserts: Record<string, unknown[]>;
  deletes: Record<string, string[]>; // table -> deleted user_ids
}

function createFakeSupabase(): { client: SupabaseClient; calls: FakeCalls } {
  const calls: FakeCalls = { upserts: {}, inserts: {}, deletes: {} };

  const client = {
    from(table: string) {
      return {
        upsert: (rows: unknown[]) => {
          calls.upserts[table] = [...(calls.upserts[table] ?? []), ...rows];
          return Promise.resolve({ error: null });
        },
        insert: (rows: unknown[]) => {
          calls.inserts[table] = [...(calls.inserts[table] ?? []), ...rows];
          return Promise.resolve({ error: null });
        },
        delete: () => ({
          eq: (_column: string, value: string) => {
            calls.deletes[table] = [...(calls.deletes[table] ?? []), value];
            return Promise.resolve({ error: null });
          },
        }),
      };
    },
  } as unknown as SupabaseClient;

  return { client, calls };
}

const DEMO_INPUT: DemoSeedInput = {
  userIds: { jihoon: 'u-jihoon', tanaka: 'u-tanaka', michael: 'u-michael', sarah: 'u-sarah' },
};

describe('seedProfiles', () => {
  it('4개 프로필을 profiles에 upsert하고 전부 onboarding_state=completed다(AC-059⑦)', async () => {
    const { client, calls } = createFakeSupabase();
    await seedProfiles(client, DEMO_INPUT);

    const rows = calls.upserts.profiles as Array<{ user_id: string; onboarding_state: string }>;
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.user_id).sort()).toEqual(['u-jihoon', 'u-michael', 'u-sarah', 'u-tanaka']);
    for (const row of rows) {
      expect(row.onboarding_state).toBe('completed');
    }
  });

  it('박지훈·Sarah 자기신고 값이 TestCases.md "(v1.7) 스키마 값 확정" 표와 일치한다(QA F-1 회귀 방지)', async () => {
    const { client, calls } = createFakeSupabase();
    await seedProfiles(client, DEMO_INPUT);

    const rows = calls.upserts.profiles as Array<{
      user_id: string;
      directness: string;
      emoji_preference: string;
      formality: string;
      honorific_level: string | null;
    }>;
    const jihoon = rows.find((r) => r.user_id === 'u-jihoon');
    const sarah = rows.find((r) => r.user_id === 'u-sarah');

    expect(jihoon).toMatchObject({
      directness: 'direct',
      emoji_preference: 'neutral',
      formality: 'medium',
      honorific_level: 'hapsyo',
    });
    expect(sarah).toMatchObject({
      directness: 'direct',
      emoji_preference: 'neutral',
      formality: 'low',
      honorific_level: null,
    });
  });
});

describe('seedDictionaryTerms', () => {
  it('박지훈 소유로 22개를 dictionary_terms에 upsert한다', async () => {
    const { client, calls } = createFakeSupabase();
    await seedDictionaryTerms(client, 'u-jihoon');

    const rows = calls.upserts.dictionary_terms as Array<{ owner_user_id: string }>;
    expect(rows).toHaveLength(22);
    expect(rows.every((r) => r.owner_user_id === 'u-jihoon')).toBe(true);
  });
});

describe('seedPairProtocols', () => {
  it('타나카·Michael 2건을 pair_protocols에 upsert한다', async () => {
    const { client, calls } = createFakeSupabase();
    await seedPairProtocols(client);

    expect(calls.upserts.pair_protocols).toHaveLength(2);
  });
});

describe('seedDiffHistory', () => {
  it('10건을 diff_records에 insert하고 message_id는 전부 null이다', async () => {
    const { client, calls } = createFakeSupabase();
    await seedDiffHistory(client, 'u-jihoon');

    const rows = calls.inserts.diff_records as Array<{ user_id: string; message_id: null }>;
    expect(rows).toHaveLength(10);
    expect(rows.every((r) => r.user_id === 'u-jihoon' && r.message_id === null)).toBe(true);
  });
});

describe('applyReflectedLearning', () => {
  it('cushion_insert(3회)만 profile_learned_items에 upsert하고 emoji_removed(1회)는 쓰지 않는다(AC-013)', async () => {
    const { client, calls } = createFakeSupabase();
    await applyReflectedLearning(client, 'u-jihoon');

    const rows = calls.upserts.profile_learned_items as Array<{ pattern_key: string; observed_count: number }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ pattern_key: 'cushion_insert', observed_count: 3, value: 'indirect' });
  });
});

describe('resetJihoonToPreLearningState — 학습 전 스냅샷', () => {
  it('diff_records·profile_learned_items를 지우고 profiles는 건드리지 않는다', async () => {
    const { client, calls } = createFakeSupabase();
    await resetJihoonToPreLearningState(client, 'u-jihoon');

    expect(calls.deletes.diff_records).toEqual(['u-jihoon']);
    expect(calls.deletes.profile_learned_items).toEqual(['u-jihoon']);
    expect(calls.upserts.profiles).toBeUndefined();
  });
});

describe('applyJihoonLearningHistory — 학습 후 스냅샷', () => {
  it('diff 10건 + 반영 항목 1건을 채운다', async () => {
    const { client, calls } = createFakeSupabase();
    await applyJihoonLearningHistory(client, 'u-jihoon');

    expect(calls.inserts.diff_records).toHaveLength(10);
    expect(calls.upserts.profile_learned_items).toHaveLength(1);
  });
});

describe('seedDemoData — 전체 진입점', () => {
  it('profiles·dictionary_terms·pair_protocols·diff_records·profile_learned_items를 전부 채운다', async () => {
    const { client, calls } = createFakeSupabase();
    await seedDemoData(client, DEMO_INPUT);

    expect(calls.upserts.profiles).toHaveLength(4);
    expect(calls.upserts.dictionary_terms).toHaveLength(22);
    expect(calls.upserts.pair_protocols).toHaveLength(2);
    expect(calls.inserts.diff_records).toHaveLength(10);
    expect(calls.upserts.profile_learned_items).toHaveLength(1);
  });
});
