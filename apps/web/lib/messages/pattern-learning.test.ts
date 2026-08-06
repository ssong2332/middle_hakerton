/**
 * T20 — diff 3회 반복 패턴 감지 → `profile_learned_items` 반영 (AC-012/AC-013).
 * Supabase는 실제로 호출하지 않고 최소 체이닝만 흉내내는 페이크로 검증한다
 * (`apps/web/lib/messages/storage.test.ts`와 같은 모킹 정책).
 *
 * 🔴 AC-013("2회에서 미반영·3회에서 반영 두 케이스 모두 검증")의 직접 근거 파일 —
 * "profile_learned_items 3회 미만에서는 미반영" / "3회 이상이면 반영" 두 describe 블록이
 * 각각 그 케이스다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  applyPatternLearning,
  applyPatternLearningSafe,
  countDiffRecordsForPattern,
  upsertProfileLearnedItem,
} from './pattern-learning';

interface FakeHandle {
  client: SupabaseClient;
  learnedItemUpserts: unknown[];
  countQueries: { table: string; eqCalls: Array<[string, unknown]> }[];
}

function createFakeSupabase(
  options: {
    diffRecordCount?: number;
    countError?: { message: string } | null;
    upsertError?: { message: string } | null;
  } = {},
): FakeHandle {
  const learnedItemUpserts: unknown[] = [];
  const countQueries: { table: string; eqCalls: Array<[string, unknown]> }[] = [];

  const client = {
    from(table: string) {
      if (table === 'diff_records') {
        const query = { table, eqCalls: [] as Array<[string, unknown]> };
        countQueries.push(query);
        const chain = {
          eq: (column: string, value: unknown) => {
            query.eqCalls.push([column, value]);
            return chain;
          },
          then: (resolve: (result: { count: number | null; error: unknown }) => unknown) =>
            resolve({
              count: options.countError ? null : (options.diffRecordCount ?? 0),
              error: options.countError ?? null,
            }),
        };
        return { select: () => chain };
      }
      if (table === 'profile_learned_items') {
        return {
          upsert: (values: unknown) => {
            learnedItemUpserts.push(values);
            return Promise.resolve({ error: options.upsertError ?? null });
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as SupabaseClient;

  return { client, learnedItemUpserts, countQueries };
}

describe('countDiffRecordsForPattern', () => {
  it('user_id·pattern_key로 필터링해 diff_records 개수를 센다(G4 쿼리와 동형)', async () => {
    const { client, countQueries } = createFakeSupabase({ diffRecordCount: 2 });

    const count = await countDiffRecordsForPattern(client, 'user-1', 'emoji_removed');

    expect(count).toBe(2);
    expect(countQueries).toEqual([
      { table: 'diff_records', eqCalls: [['user_id', 'user-1'], ['pattern_key', 'emoji_removed']] },
    ]);
  });

  it('count가 null이면 0으로 취급한다', async () => {
    const fakeClient = {
      from: () => ({
        select: () => ({
          eq(this: unknown) {
            return this;
          },
          then: (resolve: (result: { count: number | null; error: unknown }) => unknown) =>
            resolve({ count: null, error: null }),
        }),
      }),
    } as unknown as SupabaseClient;

    const count = await countDiffRecordsForPattern(fakeClient, 'user-1', 'emoji_removed');
    expect(count).toBe(0);
  });

  it('쿼리가 실패하면 에러를 던진다(삼키지 않는다)', async () => {
    const { client } = createFakeSupabase({ countError: { message: 'query failed' } });
    await expect(countDiffRecordsForPattern(client, 'user-1', 'emoji_removed')).rejects.toBeTruthy();
  });
});

describe('upsertProfileLearnedItem', () => {
  it('profile_learned_items에 user_id/pattern_key/value/observed_count를 upsert한다', async () => {
    const { client, learnedItemUpserts } = createFakeSupabase();

    await upsertProfileLearnedItem(client, 'user-1', 'emoji_removed', 3);

    expect(learnedItemUpserts).toHaveLength(1);
    expect(learnedItemUpserts[0]).toMatchObject({
      user_id: 'user-1',
      pattern_key: 'emoji_removed',
      value: 'avoids',
      observed_count: 3,
    });
  });

  it('upsert가 실패하면 에러를 던진다(삼키지 않는다)', async () => {
    const { client } = createFakeSupabase({ upsertError: { message: 'upsert failed' } });
    await expect(upsertProfileLearnedItem(client, 'user-1', 'emoji_removed', 3)).rejects.toBeTruthy();
  });
});

describe('applyPatternLearning — AC-013 3회 미만에서는 미반영', () => {
  it('같은 패턴이 2회뿐이면 profile_learned_items에 아무것도 쓰지 않고 false를 반환한다', async () => {
    const { client, learnedItemUpserts } = createFakeSupabase({ diffRecordCount: 2 });

    const learnedApplied = await applyPatternLearning(client, 'user-1', 'emoji_removed');

    expect(learnedApplied).toBe(false);
    expect(learnedItemUpserts).toHaveLength(0);
  });

  it('같은 패턴이 1회뿐이어도 미반영이다(0/1/2 모두 3 미만)', async () => {
    const { client, learnedItemUpserts } = createFakeSupabase({ diffRecordCount: 1 });

    const learnedApplied = await applyPatternLearning(client, 'user-1', 'cushion_insert');

    expect(learnedApplied).toBe(false);
    expect(learnedItemUpserts).toHaveLength(0);
  });

  it('patternKey가 null(분류 불가)이면 DB를 조회하지 않고 즉시 false를 반환한다', async () => {
    const { client, countQueries, learnedItemUpserts } = createFakeSupabase({ diffRecordCount: 5 });

    const learnedApplied = await applyPatternLearning(client, 'user-1', null);

    expect(learnedApplied).toBe(false);
    expect(countQueries).toHaveLength(0);
    expect(learnedItemUpserts).toHaveLength(0);
  });

  it('알 수 없는 pattern_key(분류기가 만들 수 없는 값)면 미반영으로 안전하게 처리한다', async () => {
    const { client, countQueries, learnedItemUpserts } = createFakeSupabase({ diffRecordCount: 5 });

    const learnedApplied = await applyPatternLearning(client, 'user-1', 'unknown_pattern');

    expect(learnedApplied).toBe(false);
    expect(countQueries).toHaveLength(0);
    expect(learnedItemUpserts).toHaveLength(0);
  });
});

describe('applyPatternLearning — AC-013 3회 이상이면 반영', () => {
  it('같은 패턴이 3회째면 profile_learned_items에 observed_count=3으로 upsert하고 true를 반환한다', async () => {
    const { client, learnedItemUpserts } = createFakeSupabase({ diffRecordCount: 3 });

    const learnedApplied = await applyPatternLearning(client, 'user-1', 'emoji_removed');

    expect(learnedApplied).toBe(true);
    expect(learnedItemUpserts).toHaveLength(1);
    expect(learnedItemUpserts[0]).toMatchObject({
      user_id: 'user-1',
      pattern_key: 'emoji_removed',
      value: 'avoids',
      observed_count: 3,
    });
  });

  it('4회, 5회로 계속 반복되면 observed_count를 갱신하며 계속 반영한다', async () => {
    const { client, learnedItemUpserts } = createFakeSupabase({ diffRecordCount: 5 });

    const learnedApplied = await applyPatternLearning(client, 'user-1', 'cushion_insert');

    expect(learnedApplied).toBe(true);
    expect(learnedItemUpserts[0]).toMatchObject({
      pattern_key: 'cushion_insert',
      value: 'indirect',
      observed_count: 5,
    });
  });
});

// 위 두 describe 블록을 한 번에 대조하는 회귀 고정 — 카운트 하나만 바뀌었을 때 반영 여부가
// 정확히 임계값(3)에서 뒤집히는지 같은 목(mock) 구성으로 나란히 확인한다.
describe('applyPatternLearning — 2회/3회 경계값 대조 (AC-013)', () => {
  it.each([
    [0, false],
    [1, false],
    [2, false],
    [3, true],
    [4, true],
  ])('observed count %i → learnedApplied %s', async (diffRecordCount, expected) => {
    const { client, learnedItemUpserts } = createFakeSupabase({ diffRecordCount });

    const learnedApplied = await applyPatternLearning(client, 'user-1', 'emoji_removed');

    expect(learnedApplied).toBe(expected);
    expect(learnedItemUpserts).toHaveLength(expected ? 1 : 0);
  });
});

/**
 * 🔴 Reviewer Major(REJECTED → 수정) 회귀 — `applyPatternLearningSafe`는 `POST /api/messages`의
 * `insertSentMessageAndDiffRecord`(발송 커밋, 이미 durable) 직후·`saveIdempotentResponse`(멱등성
 * 캐시 저장) 직전에 호출된다(`app/api/messages/route.ts`). 이 구간에서 예외가 그대로 전파되면
 * 발송은 이미 커밋됐는데 멱등성 캐시는 없어, 같은 `Idempotency-Key`로 재시도할 때 캐시 미스로
 * 저장소가 다시 호출되어 중복 발송이 된다. `applyPatternLearningSafe`가 내부(`applyPatternLearning`
 * → `countDiffRecordsForPattern`/`upsertProfileLearnedItem`)의 에러를 여기서 흡수해 그 실패
 * 창을 없앤다 — 아래 두 테스트가 "에러를 삼키지 않는다(로그를 남긴다)"와 "그럼에도 호출자에게는
 * 절대 던지지 않는다(false로 안전 반환)"를 각각 증명한다.
 */
describe('applyPatternLearningSafe — 내부 실패를 흡수해 발송 성공/멱등성을 보호한다', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('countDiffRecordsForPattern이 던져도(diff_records 쿼리 실패) 예외를 전파하지 않고 false를 반환한다', async () => {
    const { client } = createFakeSupabase({ countError: { message: 'query failed' } });

    await expect(
      applyPatternLearningSafe(client, 'user-1', 'emoji_removed'),
    ).resolves.toBe(false);
  });

  it('upsertProfileLearnedItem이 던져도(3회 도달했지만 upsert 실패) 예외를 전파하지 않고 false를 반환한다', async () => {
    const { client } = createFakeSupabase({
      diffRecordCount: 3,
      upsertError: { message: 'upsert failed' },
    });

    await expect(
      applyPatternLearningSafe(client, 'user-1', 'emoji_removed'),
    ).resolves.toBe(false);
  });

  it('내부 실패를 무로그로 삼키지 않는다 — console.error에 userId/patternKey/에러 메시지를 남긴다', async () => {
    const { client } = createFakeSupabase({ countError: { message: 'query failed' } });

    await applyPatternLearningSafe(client, 'user-1', 'emoji_removed');

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const [, details] = consoleErrorSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(details).toMatchObject({ userId: 'user-1', patternKey: 'emoji_removed' });
    expect(details.error).toBeTruthy();
  });

  it('내부가 정상 동작하면(에러 없음) 기존 applyPatternLearning과 동일하게 판정 결과를 그대로 반환한다', async () => {
    const { client } = createFakeSupabase({ diffRecordCount: 3 });

    await expect(
      applyPatternLearningSafe(client, 'user-1', 'emoji_removed'),
    ).resolves.toBe(true);
  });
});
