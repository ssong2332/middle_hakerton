/**
 * T28 — C3 프로필 조회 어댑터. Supabase는 실제로 호출하지 않고 최소 체이닝만 흉내내는 페이크로
 * 검증한다(`apps/web/lib/dictionary/storage.test.ts`와 같은 모킹 정책).
 */
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchLearnedItems, fetchSenderProfile, saveOnboardingProfile } from './storage';

interface FakeProfileHandle {
  client: SupabaseClient;
  eqCalls: Array<[string, unknown]>;
}

function createFakeProfileSupabase(
  options: { row?: unknown | null; error?: { message: string } | null } = {},
): FakeProfileHandle {
  const eqCalls: Array<[string, unknown]> = [];
  const client = {
    from(table: string) {
      if (table !== 'profiles') throw new Error(`unexpected table: ${table}`);
      return {
        select: () => ({
          eq: (column: string, value: unknown) => {
            eqCalls.push([column, value]);
            return {
              maybeSingle: () =>
                Promise.resolve({
                  data: options.error ? null : (options.row ?? null),
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

interface FakeLearnedItemsHandle {
  client: SupabaseClient;
  eqCalls: Array<[string, unknown]>;
}

function createFakeLearnedItemsSupabase(
  options: { rows?: unknown[]; error?: { message: string } | null } = {},
): FakeLearnedItemsHandle {
  const eqCalls: Array<[string, unknown]> = [];
  const client = {
    from(table: string) {
      if (table !== 'profile_learned_items') throw new Error(`unexpected table: ${table}`);
      return {
        select: () => ({
          eq: (column: string, value: unknown) => {
            eqCalls.push([column, value]);
            return Promise.resolve({
              data: options.error ? null : (options.rows ?? []),
              error: options.error ?? null,
            });
          },
        }),
      };
    },
  } as unknown as SupabaseClient;
  return { client, eqCalls };
}

describe('fetchSenderProfile', () => {
  it('user_id로 스코프해 조회한다(profiles PK, T18 스키마)', async () => {
    const { client, eqCalls } = createFakeProfileSupabase({ row: null });

    await fetchSenderProfile(client, 'user-1');

    expect(eqCalls).toEqual([['user_id', 'user-1']]);
  });

  it('행이 없으면(온보딩 전) not_started + 전부 null인 기본 프로필을 반환한다(AC-059 온보딩 스킵 계정도 정상 동작)', async () => {
    const { client } = createFakeProfileSupabase({ row: null });

    const result = await fetchSenderProfile(client, 'user-1');

    expect(result).toEqual({
      onboardingState: 'not_started',
      directness: null,
      emojiPreference: null,
      formality: null,
      honorificLevel: null,
    });
  });

  it('행이 있으면 스네이크→카멜로 변환해 그대로 반환한다', async () => {
    const { client } = createFakeProfileSupabase({
      row: {
        onboarding_state: 'completed',
        directness: 'direct',
        emoji_preference: 'avoids',
        formality: 'high',
        honorific_level: 'hapsyo',
      },
    });

    const result = await fetchSenderProfile(client, 'user-1');

    expect(result).toEqual({
      onboardingState: 'completed',
      directness: 'direct',
      emojiPreference: 'avoids',
      formality: 'high',
      honorificLevel: 'hapsyo',
    });
  });

  it('온보딩을 건너뛴(skipped) 행은 스타일 필드가 null이어도 기본값을 채우지 않는다(AC-059②)', async () => {
    const { client } = createFakeProfileSupabase({
      row: {
        onboarding_state: 'skipped',
        directness: null,
        emoji_preference: null,
        formality: null,
        honorific_level: null,
      },
    });

    const result = await fetchSenderProfile(client, 'user-1');

    expect(result.onboardingState).toBe('skipped');
    expect(result.directness).toBeNull();
    expect(result.honorificLevel).toBeNull();
  });

  it('조회 실패 시 에러를 던진다(에러 삼키기 금지)', async () => {
    const { client } = createFakeProfileSupabase({ error: { message: 'connection failed' } });

    await expect(fetchSenderProfile(client, 'user-1')).rejects.toEqual({
      message: 'connection failed',
    });
  });
});

describe('fetchLearnedItems', () => {
  it('user_id로 스코프해 조회한다(profile_learned_items, T18 스키마)', async () => {
    const { client, eqCalls } = createFakeLearnedItemsSupabase({ rows: [] });

    await fetchLearnedItems(client, 'user-1');

    expect(eqCalls).toEqual([['user_id', 'user-1']]);
  });

  it('비어 있으면 []를 반환한다(AC-059 — 정상 상태)', async () => {
    const { client } = createFakeLearnedItemsSupabase({ rows: [] });

    const result = await fetchLearnedItems(client, 'user-1');

    expect(result).toEqual([]);
  });

  it('행을 core의 LearnedItem(camelCase)으로 변환한다(observed_count는 넣지 않는다 — AC-013)', async () => {
    const { client } = createFakeLearnedItemsSupabase({
      rows: [{ pattern_key: 'emoji_removed', value: 'avoids', observed_count: 3 }],
    });

    const result = await fetchLearnedItems(client, 'user-1');

    expect(result).toEqual([{ patternKey: 'emoji_removed', value: 'avoids' }]);
  });

  it('조회 실패 시 에러를 던진다(에러 삼키기 금지)', async () => {
    const { client } = createFakeLearnedItemsSupabase({ error: { message: 'connection failed' } });

    await expect(fetchLearnedItems(client, 'user-1')).rejects.toEqual({
      message: 'connection failed',
    });
  });
});

// T19 — 온보딩 저장(쓰기 측). AC-011, AC-046②, AC-059.
interface FakeUpsertHandle {
  client: SupabaseClient;
  upsertCalls: Array<[unknown, unknown]>;
}

function createFakeUpsertSupabase(
  options: { error: { message: string } | null } = { error: null },
): FakeUpsertHandle {
  const upsertCalls: Array<[unknown, unknown]> = [];
  const client = {
    from(table: string) {
      if (table !== 'profiles') throw new Error(`unexpected table: ${table}`);
      return {
        upsert: (row: unknown, opts: unknown) => {
          upsertCalls.push([row, opts]);
          return Promise.resolve({ data: options.error ? null : {}, error: options.error });
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, upsertCalls };
}

describe('saveOnboardingProfile — AC-011/AC-046②/AC-059(나란히 스킵·완료 두 경로 모두 검증)', () => {
  it('완료 경로 — 4개 스타일 필드 + onboarding_state=completed를 user_id 기준 upsert한다(AC-011/AC-046②)', async () => {
    const { client, upsertCalls } = createFakeUpsertSupabase();

    const result = await saveOnboardingProfile(client, 'user-1', {
      onboardingState: 'completed',
      directness: 'direct',
      emojiPreference: 'neutral',
      formality: 'medium',
      honorificLevel: 'hapsyo',
    });

    expect(upsertCalls[0][0]).toMatchObject({
      user_id: 'user-1',
      onboarding_state: 'completed',
      directness: 'direct',
      emoji_preference: 'neutral',
      formality: 'medium',
      honorific_level: 'hapsyo',
    });
    expect(upsertCalls[0][1]).toEqual({ onConflict: 'user_id' });
    expect(result.onboardingState).toBe('completed');
    expect(result.directness).toBe('direct');
    expect(result.honorificLevel).toBe('hapsyo');
    expect(typeof result.updatedAt).toBe('string');
  });

  it('스킵 경로 — onboarding_state=skipped면 스타일 4필드를 전부 null로 저장한다(AC-059②, 기본값·추측값 금지)', async () => {
    const { client, upsertCalls } = createFakeUpsertSupabase();

    const result = await saveOnboardingProfile(client, 'user-2', {
      onboardingState: 'skipped',
    });

    expect(upsertCalls[0][0]).toMatchObject({
      user_id: 'user-2',
      onboarding_state: 'skipped',
      directness: null,
      emoji_preference: null,
      formality: null,
      honorific_level: null,
    });
    expect(result.onboardingState).toBe('skipped');
    expect(result.directness).toBeNull();
    expect(result.emojiPreference).toBeNull();
    expect(result.formality).toBeNull();
    expect(result.honorificLevel).toBeNull();
  });

  it('스킵인데 호출부가 스타일 값을 실어 보내도 무시하고 null로 저장한다(AC-059② 마지막 방어선)', async () => {
    const { client, upsertCalls } = createFakeUpsertSupabase();

    await saveOnboardingProfile(client, 'user-3', {
      onboardingState: 'skipped',
      directness: 'direct',
      emojiPreference: 'likes',
      formality: 'high',
      honorificLevel: 'haeyo',
    });

    expect(upsertCalls[0][0]).toMatchObject({
      directness: null,
      emoji_preference: null,
      formality: null,
      honorific_level: null,
    });
  });

  it('저장 실패 시 에러를 던진다(에러 삼키기 금지)', async () => {
    const { client } = createFakeUpsertSupabase({ error: { message: 'connection failed' } });

    await expect(
      saveOnboardingProfile(client, 'user-1', { onboardingState: 'skipped' }),
    ).rejects.toEqual({ message: 'connection failed' });
  });
});
