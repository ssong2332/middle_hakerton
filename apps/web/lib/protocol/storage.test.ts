/**
 * T41/T42 — `fetchProtocol()`/`saveProtocol()`(AC-037, AC-075). 페이크 Supabase 체이닝으로
 * 검증한다(`apps/web/lib/dictionary/storage.test.ts`·`apps/web/lib/pair-protocols/storage.test.ts`와
 * 같은 모킹 정책).
 */
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchProtocol, saveProtocol } from './storage';

function createFakeSupabaseForFetch(row: unknown, error: { message: string } | null = null) {
  const eqCalls: [string, string][] = [];
  const client = {
    from(table: string) {
      if (table !== 'pair_protocols') throw new Error(`unexpected table: ${table}`);
      return {
        select: () => ({
          eq: (column: string, value: string) => {
            eqCalls.push([column, value]);
            return { maybeSingle: () => Promise.resolve({ data: row, error }) };
          },
        }),
      };
    },
  } as unknown as SupabaseClient;
  return { client, eqCalls };
}

function createFakeSupabaseForSave(row: unknown, error: { message: string } | null = null) {
  const upsertCalls: unknown[] = [];
  const client = {
    from(table: string) {
      if (table !== 'pair_protocols') throw new Error(`unexpected table: ${table}`);
      return {
        upsert: (value: unknown) => {
          upsertCalls.push(value);
          return {
            select: () => ({
              single: () => Promise.resolve({ data: row, error }),
            }),
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, upsertCalls };
}

describe('fetchProtocol', () => {
  it('규약이 없으면 authorshipState untouched + 4축 null인 기본값을 반환한다(AC-037, UX-011 Empty)', async () => {
    const { client } = createFakeSupabaseForFetch(null);

    const result = await fetchProtocol(client, 'me@example.com', 'tanaka@sakuradigital.example');

    expect(result).toMatchObject({
      counterpart: 'tanaka@sakuradigital.example',
      directnessAllowed: null,
      emojiPolicy: null,
      addressForm: null,
      deadlineStyle: null,
      authorshipState: 'untouched',
    });
  });

  it('행이 있으면 나(party_a/party_b 중 나 아닌 쪽)를 counterpart로 매핑해 반환한다', async () => {
    const { client } = createFakeSupabaseForFetch({
      pair_key: 'k',
      party_a: 'me@example.com',
      party_b: 'tanaka@sakuradigital.example',
      directness_allowed: 'yes',
      emoji_policy: 'avoid',
      address_form: '님',
      deadline_style: 'EOD',
      authorship_state: 'sender_confirmed',
      updated_at: '2026-08-10T00:00:00.000Z',
    });

    const result = await fetchProtocol(client, 'me@example.com', 'tanaka@sakuradigital.example');

    expect(result).toEqual({
      pairKey: 'k',
      counterpart: 'tanaka@sakuradigital.example',
      directnessAllowed: 'yes',
      emojiPolicy: 'avoid',
      addressForm: '님',
      deadlineStyle: 'EOD',
      authorshipState: 'sender_confirmed',
      updatedAt: '2026-08-10T00:00:00.000Z',
    });
  });

  it('조회 에러는 삼키지 않고 던진다', async () => {
    const { client } = createFakeSupabaseForFetch(null, { message: 'boom' });

    await expect(
      fetchProtocol(client, 'me@example.com', 'tanaka@sakuradigital.example'),
    ).rejects.toMatchObject({ message: 'boom' });
  });
});

describe('saveProtocol', () => {
  it('두 이메일을 소문자화·정렬해 pair_key/party_a/party_b를 만들고 upsert한다', async () => {
    const { client, upsertCalls } = createFakeSupabaseForSave({
      pair_key: 'x',
      party_a: 'me@example.com',
      party_b: 'zzz@example.com',
      directness_allowed: 'yes',
      emoji_policy: null,
      address_form: null,
      deadline_style: null,
      authorship_state: 'sender_confirmed',
      updated_at: '2026-08-10T00:00:00.000Z',
    });

    await saveProtocol(client, 'ME@example.com', 'user-1', {
      counterpart: 'ZZZ@example.com',
      directnessAllowed: 'yes',
    });

    expect(upsertCalls).toHaveLength(1);
    const call = upsertCalls[0] as Record<string, unknown>;
    expect(call.party_a).toBe('me@example.com');
    expect(call.party_b).toBe('zzz@example.com');
    expect(call.authorship_state).toBe('sender_confirmed');
    expect(call.last_written_by).toBe('user-1');
  });

  it('저장 결과에서 나 아닌 쪽을 counterpart로 매핑해 반환한다', async () => {
    const { client } = createFakeSupabaseForSave({
      pair_key: 'x',
      party_a: 'me@example.com',
      party_b: 'tanaka@sakuradigital.example',
      directness_allowed: 'no',
      emoji_policy: 'ok',
      address_form: null,
      deadline_style: null,
      authorship_state: 'sender_confirmed',
      updated_at: '2026-08-10T00:00:00.000Z',
    });

    const result = await saveProtocol(client, 'me@example.com', 'user-1', {
      counterpart: 'tanaka@sakuradigital.example',
      directnessAllowed: 'no',
      emojiPolicy: 'ok',
    });

    expect(result.counterpart).toBe('tanaka@sakuradigital.example');
    expect(result.directnessAllowed).toBe('no');
    expect(result.emojiPolicy).toBe('ok');
  });

  it('저장 에러는 삼키지 않고 던진다', async () => {
    const { client } = createFakeSupabaseForSave(null, { message: 'boom' });

    await expect(
      saveProtocol(client, 'me@example.com', 'user-1', { counterpart: 'tanaka@sakuradigital.example' }),
    ).rejects.toMatchObject({ message: 'boom' });
  });
});
