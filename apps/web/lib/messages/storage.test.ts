/**
 * T14 — `sent_messages`/`diff_records` 저장 (`docs/API.md` `POST /api/messages`,
 * `docs/Database.md` "sent_messages"·"diff_records"). Supabase는 실제로 호출하지 않고 최소
 * 체이닝만 흉내내는 페이크로 검증한다(`apps/web/lib/llm/openai.test.ts`와 같은 모킹 정책 —
 * `docs/CodingRules.md` Tests "모킹 정책"은 LLM만 모킹 대상으로 명시하지만, `sent_messages`·
 * `diff_records` 테이블 자체가 아직 실제 Supabase 프로젝트에 적용되지 않은 상태다(T18 선행
 * 마이그레이션 0002는 파일만 작성 — `docs/Tasks.md` T14 원문). 실제 Postgres RLS 통합 검증은
 * 테이블이 적용된 뒤(T18 AC-039 교차 확인과 같은 시점)로 미루고, 여기서는 쿼리 구성(컬럼명·
 * 서버 강제 규칙)만 구조적으로 검증한다 — 이 gap은 구현 보고서에 남긴다).
 */
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NotFoundError, ValidationError } from '@cross-border/core';
import {
  fetchRepliedMessages,
  fetchSentMessageForReminder,
  fetchSentMessages,
  insertDiffRecord,
  insertSentMessage,
  insertSentMessageAndDiffRecord,
  updateSentMessage,
  type CreateDiffRecordInput,
  type CreateSentMessageInput,
} from './storage';

interface FakeHandle {
  client: SupabaseClient;
  sentMessagesInserts: unknown[];
  diffRecordsInserts: unknown[];
  sentMessagesDeletes: unknown[];
}

function createFakeSupabase(
  options: {
    sentMessageRow?: { id: string; sent_at: string } | null;
    sentMessageError?: { message: string } | null;
    diffRecordRow?: { id: string } | null;
    diffRecordError?: { message: string } | null;
    sentMessageDeleteError?: { message: string } | null;
  } = {},
): FakeHandle {
  const sentMessagesInserts: unknown[] = [];
  const diffRecordsInserts: unknown[] = [];
  const sentMessagesDeletes: unknown[] = [];

  const client = {
    from(table: string) {
      if (table === 'sent_messages') {
        return {
          insert: (values: unknown) => {
            sentMessagesInserts.push(values);
            return {
              select: () => ({
                single: async () => ({
                  data: options.sentMessageError
                    ? null
                    : (options.sentMessageRow ?? { id: 'msg-1', sent_at: '2026-08-05T00:00:00Z' }),
                  error: options.sentMessageError ?? null,
                }),
              }),
            };
          },
          delete: () => ({
            eq: async (_column: string, value: unknown) => {
              sentMessagesDeletes.push(value);
              return { error: options.sentMessageDeleteError ?? null };
            },
          }),
        };
      }
      if (table === 'diff_records') {
        return {
          insert: (values: unknown) => {
            diffRecordsInserts.push(values);
            return {
              select: () => ({
                single: async () => ({
                  data: options.diffRecordError
                    ? null
                    : (options.diffRecordRow ?? { id: 'diff-1' }),
                  error: options.diffRecordError ?? null,
                }),
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as SupabaseClient;

  return { client, sentMessagesInserts, diffRecordsInserts, sentMessagesDeletes };
}

const baseSentMessageInput: CreateSentMessageInput = {
  userId: 'user-1',
  recipientIdentifier: 'boss@example.com',
  recipientCountry: null,
  recipientTimezone: null,
  originalText: '내일까지 확인 부탁드립니다.',
  finalText: 'Please confirm by tomorrow.',
  urgency: 'NORMAL',
  channel: 'web_mock',
  scheduledFor: null,
  mediationApplied: true,
  isReminder: false,
  parentMessageId: null,
};

describe('insertSentMessage', () => {
  it('입력을 snake_case 컬럼으로 매핑해 sent_messages에 insert하고 id/sentAt을 반환한다', async () => {
    const { client, sentMessagesInserts } = createFakeSupabase({
      sentMessageRow: { id: 'msg-42', sent_at: '2026-08-05T10:00:00Z' },
    });

    const result = await insertSentMessage(client, baseSentMessageInput);

    expect(result).toEqual({ id: 'msg-42', sentAt: '2026-08-05T10:00:00Z' });
    expect(sentMessagesInserts).toEqual([
      {
        user_id: 'user-1',
        recipient_identifier: 'boss@example.com',
        recipient_country: null,
        recipient_timezone: null,
        original_text: '내일까지 확인 부탁드립니다.',
        final_text: 'Please confirm by tomorrow.',
        urgency: 'NORMAL',
        channel: 'web_mock',
        scheduled_for: null,
        is_reminder: false,
        parent_message_id: null,
        mediation_applied: true,
      },
    ]);
  });

  // AC-005 서버 규칙 — `docs/API.md` "POST /api/messages" 서버 규칙: "urgency === 'CRITICAL'이면
  // scheduledFor를 무시하고 NULL로 저장한다. 클라이언트를 믿지 않는다."
  it('AC-005 — urgency가 CRITICAL이면 클라이언트가 보낸 scheduledFor를 무시하고 NULL로 저장한다', async () => {
    const { client, sentMessagesInserts } = createFakeSupabase({});

    await insertSentMessage(client, {
      ...baseSentMessageInput,
      urgency: 'CRITICAL',
      scheduledFor: '2026-08-10T09:00:00Z',
    });

    expect((sentMessagesInserts[0] as { scheduled_for: unknown }).scheduled_for).toBeNull();
  });

  it('urgency가 NORMAL/LOW면 클라이언트가 보낸 scheduledFor를 그대로 저장한다', async () => {
    const { client, sentMessagesInserts } = createFakeSupabase({});

    await insertSentMessage(client, {
      ...baseSentMessageInput,
      urgency: 'NORMAL',
      scheduledFor: '2026-08-10T09:00:00Z',
    });

    expect((sentMessagesInserts[0] as { scheduled_for: unknown }).scheduled_for).toBe(
      '2026-08-10T09:00:00Z',
    );
  });

  it('insert가 실패하면 에러를 던진다(삼키지 않는다)', async () => {
    const { client } = createFakeSupabase({ sentMessageError: { message: 'insert failed' } });

    await expect(insertSentMessage(client, baseSentMessageInput)).rejects.toBeTruthy();
  });
});

const baseDiffInput: CreateDiffRecordInput = {
  userId: 'user-1',
  messageId: 'msg-42',
  aiText: 'AI suggestion text',
  finalText: 'Final approved text',
  recipientIdentifier: 'boss@example.com',
  channel: 'web_mock',
};

describe('insertDiffRecord', () => {
  // T20 — `classifyDiffPattern`(`packages/core/src/rules/pattern-detection.ts`)이 이제
  // pattern_key를 채운다. baseDiffInput의 텍스트에는 이모지·완충 표현 신호가 없어 분류
  // 결과가 여전히 NULL이다(분류 불가는 지어내지 않는다) — 아래 두 테스트가 실제로 신호가
  // 있을 때 채워짐을 보인다.
  it('diff_records에 insert하고 id를 반환하며, 분류 가능한 신호가 없으면 pattern_key는 NULL이다', async () => {
    const { client, diffRecordsInserts } = createFakeSupabase({ diffRecordRow: { id: 'diff-9' } });

    const result = await insertDiffRecord(client, baseDiffInput);

    expect(result).toEqual({ id: 'diff-9', patternKey: null });
    expect(diffRecordsInserts).toEqual([
      {
        user_id: 'user-1',
        message_id: 'msg-42',
        ai_text: 'AI suggestion text',
        final_text: 'Final approved text',
        pattern_key: null,
        recipient_identifier: 'boss@example.com',
        channel: 'web',
      },
    ]);
  });

  it('T20 — AI 제안문의 이모지가 최종문에서 전부 사라지면 pattern_key=emoji_removed로 저장한다', async () => {
    const { client, diffRecordsInserts } = createFakeSupabase({ diffRecordRow: { id: 'diff-10' } });

    const result = await insertDiffRecord(client, {
      ...baseDiffInput,
      aiText: '확인했습니다 👍',
      finalText: '확인했습니다',
    });

    expect(result).toEqual({ id: 'diff-10', patternKey: 'emoji_removed' });
    expect((diffRecordsInserts[0] as { pattern_key: unknown }).pattern_key).toBe('emoji_removed');
  });

  it('T20 — AI 제안문에 없던 완충 표현이 최종문에 추가되면 pattern_key=cushion_insert로 저장한다', async () => {
    const { client, diffRecordsInserts } = createFakeSupabase({ diffRecordRow: { id: 'diff-11' } });

    const result = await insertDiffRecord(client, {
      ...baseDiffInput,
      aiText: '내일까지 회신 부탁드립니다.',
      finalText: '혹시 괜찮으시다면 내일까지 회신 부탁드립니다.',
    });

    expect(result).toEqual({ id: 'diff-11', patternKey: 'cushion_insert' });
    expect((diffRecordsInserts[0] as { pattern_key: unknown }).pattern_key).toBe('cushion_insert');
  });

  it('sent_messages.channel(web_mock/extension_insert/extension_clipboard)을 diff_records.channel(web/extension) 어휘로 매핑한다', async () => {
    const { client, diffRecordsInserts } = createFakeSupabase({});

    await insertDiffRecord(client, { ...baseDiffInput, channel: 'extension_insert' });
    await insertDiffRecord(client, { ...baseDiffInput, channel: 'extension_clipboard' });

    expect((diffRecordsInserts[0] as { channel: string }).channel).toBe('extension');
    expect((diffRecordsInserts[1] as { channel: string }).channel).toBe('extension');
  });

  it('messageId가 null이어도(확장 클립보드 경로) 정상 insert된다', async () => {
    const { client, diffRecordsInserts } = createFakeSupabase({});

    await insertDiffRecord(client, { ...baseDiffInput, messageId: null });

    expect((diffRecordsInserts[0] as { message_id: unknown }).message_id).toBeNull();
  });

  it('insert가 실패하면 에러를 던진다(삼키지 않는다)', async () => {
    const { client } = createFakeSupabase({ diffRecordError: { message: 'insert failed' } });

    await expect(insertDiffRecord(client, baseDiffInput)).rejects.toBeTruthy();
  });
});

// Major 2(reviewer REJECTED → 수정) — `POST /api/messages`의 두 insert가 원자적이지 않았다.
// `diff_records` insert 실패 시 방금 만든 `sent_messages` 행을 보상 삭제해 고아 행을 남기지 않는다.
describe('insertSentMessageAndDiffRecord', () => {
  it('둘 다 성공하면 sent_messages → diff_records 순서로 insert하고 두 결과를 함께 반환한다', async () => {
    const { client, sentMessagesInserts, diffRecordsInserts, sentMessagesDeletes } =
      createFakeSupabase({
        sentMessageRow: { id: 'msg-42', sent_at: '2026-08-05T10:00:00Z' },
        diffRecordRow: { id: 'diff-9' },
      });

    const result = await insertSentMessageAndDiffRecord(client, baseSentMessageInput, (messageId) => ({
      ...baseDiffInput,
      messageId,
    }));

    expect(result).toEqual({
      sentMessage: { id: 'msg-42', sentAt: '2026-08-05T10:00:00Z' },
      diffRecord: { id: 'diff-9', patternKey: null },
    });
    expect(sentMessagesInserts).toHaveLength(1);
    expect(diffRecordsInserts).toHaveLength(1);
    expect((diffRecordsInserts[0] as { message_id: unknown }).message_id).toBe('msg-42');
    expect(sentMessagesDeletes).toHaveLength(0);
  });

  it('Major 2 — diff_records insert가 실패하면 방금 만든 sent_messages 행을 보상 삭제하고 원래 에러를 던진다', async () => {
    const { client, sentMessagesDeletes } = createFakeSupabase({
      sentMessageRow: { id: 'msg-77', sent_at: '2026-08-05T10:00:00Z' },
      diffRecordError: { message: 'diff insert failed' },
    });

    await expect(
      insertSentMessageAndDiffRecord(client, baseSentMessageInput, (messageId) => ({
        ...baseDiffInput,
        messageId,
      })),
    ).rejects.toBeTruthy();

    expect(sentMessagesDeletes).toEqual(['msg-77']);
  });

  it('보상 삭제 자체가 실패해도 원래(diff insert) 에러를 삼키지 않고 던진다', async () => {
    const { client } = createFakeSupabase({
      sentMessageRow: { id: 'msg-88', sent_at: '2026-08-05T10:00:00Z' },
      diffRecordError: { message: 'diff insert failed' },
      sentMessageDeleteError: { message: 'delete failed' },
    });

    await expect(
      insertSentMessageAndDiffRecord(client, baseSentMessageInput, (messageId) => ({
        ...baseDiffInput,
        messageId,
      })),
    ).rejects.toMatchObject({ message: 'diff insert failed' });
  });
});

// T50 — `PATCH /api/messages/{id}`(AC-044①, AC-024). `updateDictionaryEntry`(T23)의
// `select().eq().eq()` → `update().eq().eq().select()` 2단계 조회/갱신 패턴과 같은 이유(존재·소유
// 확인을 갱신과 분리해 NotFoundError를 명확히 구분한다).
interface FakeUpdateHandle {
  client: SupabaseClient;
  selectEqCalls: Array<[string, unknown]>;
  updateEqCalls: Array<[string, unknown]>;
  updatedPayloads: unknown[];
}

function createFakeUpdateSentMessageSupabase(
  options: {
    existingRows?: Array<{ urgency: string }>;
    existingError?: { message: string } | null;
    updatedRows?: Array<{ id: string; replied: boolean; replied_marked_at: string | null; scheduled_for: string | null }>;
    updateError?: { message: string } | null;
  } = {},
): FakeUpdateHandle {
  const selectEqCalls: Array<[string, unknown]> = [];
  const updateEqCalls: Array<[string, unknown]> = [];
  const updatedPayloads: unknown[] = [];
  const existingRows = options.existingRows ?? [{ urgency: 'NORMAL' }];

  const client = {
    from(table: string) {
      if (table !== 'sent_messages') throw new Error(`unexpected table: ${table}`);
      return {
        select: () => ({
          eq: (col1: string, val1: unknown) => {
            selectEqCalls.push([col1, val1]);
            return {
              eq: (col2: string, val2: unknown) => {
                selectEqCalls.push([col2, val2]);
                return Promise.resolve({
                  data: options.existingError ? null : existingRows,
                  error: options.existingError ?? null,
                });
              },
            };
          },
        }),
        update: (row: unknown) => {
          updatedPayloads.push(row);
          return {
            eq: (col1: string, val1: unknown) => {
              updateEqCalls.push([col1, val1]);
              return {
                eq: (col2: string, val2: unknown) => {
                  updateEqCalls.push([col2, val2]);
                  return {
                    select: () =>
                      Promise.resolve({
                        data: options.updateError ? null : (options.updatedRows ?? []),
                        error: options.updateError ?? null,
                      }),
                  };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;

  return { client, selectEqCalls, updateEqCalls, updatedPayloads };
}

describe('updateSentMessage — AC-044①, AC-024, AC-005', () => {
  it('replied:true를 보내면 replied·replied_marked_at을 함께 갱신하고 id·user_id로 스코프한다', async () => {
    const { client, selectEqCalls, updateEqCalls, updatedPayloads } =
      createFakeUpdateSentMessageSupabase({
        updatedRows: [
          { id: 'msg-1', replied: true, replied_marked_at: '2026-08-10T10:00:00Z', scheduled_for: null },
        ],
      });

    const result = await updateSentMessage(client, 'user-1', 'msg-1', { replied: true });

    expect(result).toEqual({
      id: 'msg-1',
      replied: true,
      repliedMarkedAt: '2026-08-10T10:00:00Z',
      scheduledFor: null,
    });
    expect(selectEqCalls).toEqual([
      ['id', 'msg-1'],
      ['user_id', 'user-1'],
    ]);
    expect(updateEqCalls).toEqual([
      ['id', 'msg-1'],
      ['user_id', 'user-1'],
    ]);
    expect(updatedPayloads[0]).toMatchObject({ replied: true });
    expect((updatedPayloads[0] as { replied_marked_at: string }).replied_marked_at).toBeTruthy();
  });

  it('scheduledFor만 보내면 replied는 건드리지 않는다', async () => {
    const { client, updatedPayloads } = createFakeUpdateSentMessageSupabase({
      existingRows: [{ urgency: 'NORMAL' }],
      updatedRows: [
        { id: 'msg-2', replied: false, replied_marked_at: null, scheduled_for: '2026-08-11T00:00:00Z' },
      ],
    });

    await updateSentMessage(client, 'user-1', 'msg-2', { scheduledFor: '2026-08-11T00:00:00Z' });

    expect(updatedPayloads[0]).toEqual({ scheduled_for: '2026-08-11T00:00:00Z' });
  });

  it('대상이 없으면(다른 사람 소유 포함) NotFoundError를 던진다', async () => {
    const { client } = createFakeUpdateSentMessageSupabase({ existingRows: [] });

    await expect(
      updateSentMessage(client, 'user-1', 'missing-id', { replied: true }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('AC-005 — CRITICAL 메시지의 scheduledFor 변경은 ValidationError로 거부하고 update를 호출하지 않는다', async () => {
    const { client, updatedPayloads } = createFakeUpdateSentMessageSupabase({
      existingRows: [{ urgency: 'CRITICAL' }],
    });

    await expect(
      updateSentMessage(client, 'user-1', 'msg-critical', { scheduledFor: '2026-08-11T00:00:00Z' }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(updatedPayloads).toEqual([]);
  });

  it('CRITICAL 메시지라도 replied 마킹은(scheduledFor 아니므로) 그대로 허용한다', async () => {
    const { client, updatedPayloads } = createFakeUpdateSentMessageSupabase({
      existingRows: [{ urgency: 'CRITICAL' }],
      updatedRows: [
        { id: 'msg-3', replied: true, replied_marked_at: '2026-08-10T10:00:00Z', scheduled_for: null },
      ],
    });

    await updateSentMessage(client, 'user-1', 'msg-3', { replied: true });

    expect(updatedPayloads[0]).toMatchObject({ replied: true });
  });
});

// T33 — `GET /api/feedback`이 쓰는 조회 함수.
describe('fetchRepliedMessages — T33', () => {
  function createFakeFetchRepliedSupabase(
    rows: Array<{ id: string; sent_at: string; replied_marked_at: string | null; mediation_applied: boolean }>,
  ): { client: SupabaseClient; eqCalls: Array<[string, unknown]> } {
    const eqCalls: Array<[string, unknown]> = [];
    const client = {
      from(table: string) {
        if (table !== 'sent_messages') throw new Error(`unexpected table: ${table}`);
        return {
          select: () => ({
            eq: (col1: string, val1: unknown) => {
              eqCalls.push([col1, val1]);
              return {
                eq: (col2: string, val2: unknown) => {
                  eqCalls.push([col2, val2]);
                  return Promise.resolve({ data: rows, error: null });
                },
              };
            },
          }),
        };
      },
    } as unknown as SupabaseClient;
    return { client, eqCalls };
  }

  it('user_id·replied=true로 스코프해 camelCase로 변환해 반환한다', async () => {
    const { client, eqCalls } = createFakeFetchRepliedSupabase([
      { id: 'm1', sent_at: '2026-08-10T00:00:00Z', replied_marked_at: '2026-08-10T02:00:00Z', mediation_applied: true },
    ]);

    const result = await fetchRepliedMessages(client, 'user-1');

    expect(eqCalls).toEqual([
      ['user_id', 'user-1'],
      ['replied', true],
    ]);
    expect(result).toEqual([
      { id: 'm1', sentAt: '2026-08-10T00:00:00Z', repliedMarkedAt: '2026-08-10T02:00:00Z', mediationApplied: true },
    ]);
  });

  it('replied_marked_at이 null인 행은(불변식 위반 방어) 제외한다', async () => {
    const { client } = createFakeFetchRepliedSupabase([
      { id: 'm1', sent_at: '2026-08-10T00:00:00Z', replied_marked_at: null, mediation_applied: true },
      { id: 'm2', sent_at: '2026-08-10T00:00:00Z', replied_marked_at: '2026-08-10T02:00:00Z', mediation_applied: false },
    ]);

    const result = await fetchRepliedMessages(client, 'user-1');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('m2');
  });

  it('결과가 없으면 빈 배열을 반환한다', async () => {
    const { client } = createFakeFetchRepliedSupabase([]);

    const result = await fetchRepliedMessages(client, 'user-1');

    expect(result).toEqual([]);
  });
});

// T52 — `GET /api/messages`가 쓰는 조회 함수. supabase-js 쿼리 빌더는 각 메서드가 자기 자신을
// 반환하며 체인 끝(또는 중간, `.then()`을 직접 호출하는 지점)에서 await되는 thenable이다 — 다른
// 페이크들(고정 깊이 체인)과 달리 `repliedFilter`에 따라 체인 길이가 달라져(`.eq('replied', ...)`
// 가 있을 수도 없을 수도 있다) 이 모양의 페이크가 필요하다.
interface FakeListHandle {
  client: SupabaseClient;
  calls: Array<{ method: string; args: unknown[] }>;
}

function createFakeListSupabase(
  rows: Array<Record<string, unknown>>,
  error: { message: string } | null = null,
): FakeListHandle {
  const calls: Array<{ method: string; args: unknown[] }> = [];

  function builder() {
    const chain: Record<string, unknown> = {
      select: (...args: unknown[]) => {
        calls.push({ method: 'select', args });
        return chain;
      },
      eq: (...args: unknown[]) => {
        calls.push({ method: 'eq', args });
        return chain;
      },
      order: (...args: unknown[]) => {
        calls.push({ method: 'order', args });
        return chain;
      },
      limit: (...args: unknown[]) => {
        calls.push({ method: 'limit', args });
        return chain;
      },
      then: (resolve: (value: { data: unknown; error: unknown }) => void) =>
        resolve({ data: error ? null : rows, error }),
    };
    return chain;
  }

  const client = {
    from(table: string) {
      if (table !== 'sent_messages') throw new Error(`unexpected table: ${table}`);
      return builder();
    },
  } as unknown as SupabaseClient;

  return { client, calls };
}

describe('fetchSentMessages — T52', () => {
  const row = {
    id: 'msg-1',
    recipient_identifier: 'boss@example.com',
    recipient_country: 'KR',
    recipient_timezone: 'Asia/Seoul',
    final_text: 'Please confirm by tomorrow.',
    urgency: 'NORMAL',
    sent_at: '2026-08-05T10:00:00Z',
    replied: false,
    replied_marked_at: null,
    is_reminder: false,
    mediation_applied: true,
  };

  it('user_id로 스코프하고 sent_at DESC로 정렬·limit해 camelCase로 변환한다', async () => {
    const { client, calls } = createFakeListSupabase([row]);

    const result = await fetchSentMessages(client, 'user-1', 'all', 50);

    expect(result).toEqual([
      {
        id: 'msg-1',
        recipient: 'boss@example.com',
        recipientCountry: 'KR',
        recipientTimezone: 'Asia/Seoul',
        finalText: 'Please confirm by tomorrow.',
        urgency: 'NORMAL',
        sentAt: '2026-08-05T10:00:00Z',
        replied: false,
        repliedMarkedAt: null,
        isReminder: false,
        mediationApplied: true,
      },
    ]);
    expect(calls.some((c) => c.method === 'eq' && c.args[0] === 'user_id' && c.args[1] === 'user-1')).toBe(true);
    expect(calls.some((c) => c.method === 'order')).toBe(true);
    expect(calls.some((c) => c.method === 'limit' && c.args[0] === 50)).toBe(true);
    // repliedFilter:'all'이면 replied 컬럼 eq는 걸지 않는다.
    expect(calls.some((c) => c.method === 'eq' && c.args[0] === 'replied')).toBe(false);
  });

  it("repliedFilter가 'true'/'false'면 replied 컬럼으로도 스코프한다", async () => {
    const { client: clientTrue, calls: callsTrue } = createFakeListSupabase([row]);
    await fetchSentMessages(clientTrue, 'user-1', 'true', 50);
    expect(callsTrue.some((c) => c.method === 'eq' && c.args[0] === 'replied' && c.args[1] === true)).toBe(true);

    const { client: clientFalse, calls: callsFalse } = createFakeListSupabase([row]);
    await fetchSentMessages(clientFalse, 'user-1', 'false', 50);
    expect(callsFalse.some((c) => c.method === 'eq' && c.args[0] === 'replied' && c.args[1] === false)).toBe(true);
  });

  it('조회가 실패하면 에러를 던진다(삼키지 않는다)', async () => {
    const { client } = createFakeListSupabase([], { message: 'query failed' });

    await expect(fetchSentMessages(client, 'user-1', 'all', 50)).rejects.toBeTruthy();
  });

  it('결과가 없으면 빈 배열을 반환한다', async () => {
    const { client } = createFakeListSupabase([]);

    const result = await fetchSentMessages(client, 'user-1', 'all', 50);

    expect(result).toEqual([]);
  });
});

// T52 — `POST /api/messages/{id}/reminder`가 대상 메시지 조회에 쓰는 함수.
describe('fetchSentMessageForReminder — T52', () => {
  function createFakeFetchOneSupabase(
    rows: Array<{ final_text: string }>,
    error: { message: string } | null = null,
  ): { client: SupabaseClient; eqCalls: Array<[string, unknown]> } {
    const eqCalls: Array<[string, unknown]> = [];
    const client = {
      from(table: string) {
        if (table !== 'sent_messages') throw new Error(`unexpected table: ${table}`);
        return {
          select: () => ({
            eq: (col1: string, val1: unknown) => {
              eqCalls.push([col1, val1]);
              return {
                eq: (col2: string, val2: unknown) => {
                  eqCalls.push([col2, val2]);
                  return Promise.resolve({ data: error ? null : rows, error });
                },
              };
            },
          }),
        };
      },
    } as unknown as SupabaseClient;
    return { client, eqCalls };
  }

  it('id·user_id로 스코프해 finalText를 반환한다', async () => {
    const { client, eqCalls } = createFakeFetchOneSupabase([{ final_text: 'Please confirm by tomorrow.' }]);

    const result = await fetchSentMessageForReminder(client, 'user-1', 'msg-1');

    expect(result).toEqual({ finalText: 'Please confirm by tomorrow.' });
    expect(eqCalls).toEqual([
      ['id', 'msg-1'],
      ['user_id', 'user-1'],
    ]);
  });

  it('대상이 없으면(다른 사람 소유 포함) NotFoundError를 던진다', async () => {
    const { client } = createFakeFetchOneSupabase([]);

    await expect(fetchSentMessageForReminder(client, 'user-1', 'missing-id')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('조회가 실패하면 에러를 던진다(삼키지 않는다)', async () => {
    const { client } = createFakeFetchOneSupabase([], { message: 'query failed' });

    await expect(fetchSentMessageForReminder(client, 'user-1', 'msg-1')).rejects.toBeTruthy();
  });
});
