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
import {
  insertDiffRecord,
  insertSentMessage,
  insertSentMessageAndDiffRecord,
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
  it('diff_records에 insert하고 id를 반환하며, 패턴 분류기가 없어 pattern_key는 항상 NULL이다', async () => {
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
