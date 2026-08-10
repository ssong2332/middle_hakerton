/**
 * T14 — `sent_messages`/`diff_records` 저장. `docs/API.md` "POST /api/messages" ·
 * `docs/Database.md` "sent_messages"·"diff_records" 절 그대로. 이 파일이 두 테이블에 쓰는 유일한
 * 경로다(`apps/web/app/api/messages/route.ts` 만 호출한다).
 *
 * 🔴 두 테이블 모두 `docs/Tasks.md` T18(스키마 구축)이 아직 `todo`라 실제 Supabase 프로젝트에는
 * 아직 존재하지 않는다 — T4가 `llm_cache`·`llm_call_log`를 T18보다 먼저 최소 마이그레이션으로
 * 만든 것과 같은 방식으로, 이 태스크(T14)가 `supabase/migrations/0002_sent_messages_and_diff_
 * records.sql`을 작성한다(파일만, 실제 적용은 오케스트레이터 판단 — `docs/Tasks.md` T14 원문).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { NotFoundError, ValidationError, classifyDiffPattern } from '@cross-border/core';

export type SentMessageChannel = 'web_mock' | 'extension_insert' | 'extension_clipboard';

export interface CreateSentMessageInput {
  userId: string;
  recipientIdentifier: string;
  recipientCountry: string | null;
  recipientTimezone: string | null;
  originalText: string;
  finalText: string;
  urgency: string;
  channel: SentMessageChannel;
  /**
   * 클라이언트가 요청한 예약 발송 시각. 🔴 `urgency === 'CRITICAL'`이면 이 값과 무관하게 항상
   * `NULL`로 저장된다(AC-005, `docs/API.md` "POST /api/messages" 서버 규칙 — "클라이언트를
   * 믿지 않는다"). 이 라우트의 현재 UI(T13/T14)는 예약 발송 컨트롤(UX-006, T32, 별도 P2
   * 태스크)을 노출하지 않으므로 실제로는 항상 `null`이 들어오지만, 서버 강제는 클라이언트
   * 구현과 무관하게 항상 적용된다.
   */
  scheduledFor: string | null;
  mediationApplied: boolean;
  isReminder: boolean;
  parentMessageId: string | null;
}

export interface CreateDiffRecordInput {
  userId: string;
  /** 확장 클립보드 경로 등 발송 기록이 없을 수 있어 nullable(`docs/Database.md` diff_records.message_id). */
  messageId: string | null;
  aiText: string;
  finalText: string;
  recipientIdentifier: string;
  channel: SentMessageChannel;
}

/** `sent_messages.channel`(3값) → `diff_records.channel`(2값) 어휘 변환 — 두 테이블의 CHECK 제약이 다르다. */
function toDiffChannel(channel: SentMessageChannel): 'web' | 'extension' {
  return channel === 'web_mock' ? 'web' : 'extension';
}

export async function insertSentMessage(
  client: SupabaseClient,
  input: CreateSentMessageInput,
): Promise<{ id: string; sentAt: string }> {
  const scheduledFor = input.urgency === 'CRITICAL' ? null : input.scheduledFor;

  const { data, error } = await client
    .from('sent_messages')
    .insert({
      user_id: input.userId,
      recipient_identifier: input.recipientIdentifier,
      recipient_country: input.recipientCountry,
      recipient_timezone: input.recipientTimezone,
      original_text: input.originalText,
      final_text: input.finalText,
      urgency: input.urgency,
      channel: input.channel,
      scheduled_for: scheduledFor,
      is_reminder: input.isReminder,
      parent_message_id: input.parentMessageId,
      mediation_applied: input.mediationApplied,
    })
    .select('id, sent_at')
    .single();
  if (error) throw error;

  const row = data as { id: string; sent_at: string };
  return { id: row.id, sentAt: row.sent_at };
}

export async function insertDiffRecord(
  client: SupabaseClient,
  input: CreateDiffRecordInput,
): Promise<{ id: string; patternKey: string | null }> {
  // 🔴 T20 — `classifyDiffPattern`(`packages/core/src/rules/pattern-detection.ts`)이 이제
  // pattern_key를 채운다. 분류 불가(신호 없음)면 그 함수 자신이 `null`을 돌려준다(지어내지
  // 않는다 — `docs/Database.md` diff_records.pattern_key "분류 불가면 NULL").
  const patternKey = classifyDiffPattern(input.aiText, input.finalText);

  const { data, error } = await client
    .from('diff_records')
    .insert({
      user_id: input.userId,
      message_id: input.messageId,
      ai_text: input.aiText,
      final_text: input.finalText,
      pattern_key: patternKey,
      recipient_identifier: input.recipientIdentifier,
      channel: toDiffChannel(input.channel),
    })
    .select('id')
    .single();
  if (error) throw error;

  const row = data as { id: string };
  // 🔴 3회 반복 판정·`profile_learned_items` 반영은 DB 조회가 필요해 여기서 하지 않는다 —
  // `apps/web/lib/messages/pattern-learning.ts`(호출부: `app/api/messages/route.ts`)의 범위다.
  return { id: row.id, patternKey };
}

/**
 * 🔴 Reviewer(REJECTED, Major 2) — `sent_messages`·`diff_records` 두 insert가 원자적이지
 * 않았다. `diff_records` insert가 실패하면 방금 만든 `sent_messages` 행이 고아로 남는다
 * (승인 이력 없이 "발송된 메시지"만 존재). 실제 Postgres 트랜잭션(RPC 함수)으로 묶는 방법도
 * 검토했으나, 이 두 테이블은 아직 T18 이전 최소 마이그레이션(0002, 파일만 존재 — 파일 헤더
 * 주석 참조)이라 DB 함수를 새로 배포할 파이프라인이 없다 — 애플리케이션 레벨 보상 삭제
 * (compensating delete)로 최소 범위에서 원자성 결과를 만든다.
 */
async function deleteSentMessage(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from('sent_messages').delete().eq('id', id);
  if (error) throw error;
}

/**
 * `sent_messages` 1행 + `diff_records` 1행을 순서대로 만들되, 두 번째 insert가 실패하면 첫 번째
 * 행을 보상 삭제해 "발송 기록만 있고 diff는 없는" 상태가 남지 않게 한다. 에러는 삼키지 않고
 * 그대로 다시 던진다(`docs/CodingRules.md` Error Handling "에러 삼키기 금지") — 이 함수의
 * `catch`는 HTTP 응답으로 변환하는 지점이 아니라(그건 `withApi()` 한 곳뿐) 보상 동작을 위한
 * 것이며, 항상 원래 에러를 재던진다.
 */
export async function insertSentMessageAndDiffRecord(
  client: SupabaseClient,
  sentMessageInput: CreateSentMessageInput,
  buildDiffRecordInput: (messageId: string) => CreateDiffRecordInput,
): Promise<{
  sentMessage: { id: string; sentAt: string };
  diffRecord: { id: string; patternKey: string | null };
}> {
  const sentMessage = await insertSentMessage(client, sentMessageInput);
  try {
    const diffRecord = await insertDiffRecord(client, buildDiffRecordInput(sentMessage.id));
    return { sentMessage, diffRecord };
  } catch (diffError) {
    try {
      await deleteSentMessage(client, sentMessage.id);
    } catch (cleanupError) {
      // 보상 삭제 자체가 실패하면 고아 행이 남을 수 있다 — 원인 파악을 위해 id만 로그로
      // 남긴다(메시지 원문은 로그 금지 항목, `docs/CodingRules.md` Error Handling).
      console.error('[messages] compensating delete of sent_messages failed', {
        sentMessageId: sentMessage.id,
        cleanupError:
          (cleanupError as { message?: unknown } | null)?.message ?? String(cleanupError),
      });
    }
    throw diffError;
  }
}

/**
 * T50 — `PATCH /api/messages/{id}`. `docs/API.md` "PATCH /api/messages/{id}" 서버 규칙
 * "`replied`를 바꾸는 경로는 이 라우트 하나뿐이며 사용자의 명시적 요청으로만 호출된다"(AC-044⑤,
 * 자동 응답 감지 코드 경로 부재) — 이 함수가 그 유일한 통로다.
 */
export interface UpdateSentMessageInput {
  /** `true`만 허용 — "답장 받음"을 다시 되돌리는 경로는 없다(수동 마킹, AC-044①). */
  replied?: true;
  /** 생략하면 변경하지 않는다. `null`은 예약 취소(명시적 값). */
  scheduledFor?: string | null;
}

export interface UpdatedSentMessage {
  id: string;
  replied: boolean;
  repliedMarkedAt: string | null;
  scheduledFor: string | null;
}

interface SentMessageUrgencyRow {
  urgency: string;
}

interface UpdatedSentMessageRow {
  id: string;
  replied: boolean;
  replied_marked_at: string | null;
  scheduled_for: string | null;
}

/**
 * `id`·`user_id` 둘 다로 스코프해 갱신한다(`updateDictionaryEntry`/`deleteDictionaryEntry`와
 * 같은 패턴 — 존재하지 않거나 타인 소유면 `NotFoundError`, 404, 소유 여부를 구분해 노출하지
 * 않는다).
 *
 * 🔴 AC-005 — `scheduledFor`를 바꾸려는 요청인데 대상 메시지의 `urgency`가 `CRITICAL`이면
 * **거부한다**(`docs/API.md` "PATCH /api/messages/{id}" 서버 규칙). `POST /api/messages`(T32)의
 * "무시하고 NULL로 저장"과 다른 처리다 — 그쪽은 발송 시점의 자기 배제(사용자가 그 컨트롤 자체를
 * 보지 못한다, UX-006 AC-005 게이팅)라 조용히 무시해도 되지만, 이 라우트는 **이미 발송된 특정
 * 메시지**를 사용자가 나중에 지목해 예약을 걸려는 명시적 시도라 조용히 무시하면 "성공한 것처럼
 * 보이는데 아무 일도 안 일어나는" 혼란을 만든다 — `ValidationError`(400)로 명시적으로 막는다.
 */
export async function updateSentMessage(
  client: SupabaseClient,
  userId: string,
  id: string,
  input: UpdateSentMessageInput,
): Promise<UpdatedSentMessage> {
  const { data: existingRows, error: fetchError } = await client
    .from('sent_messages')
    .select('urgency')
    .eq('id', id)
    .eq('user_id', userId);
  if (fetchError) throw fetchError;

  const existing = (existingRows ?? []) as SentMessageUrgencyRow[];
  if (existing.length === 0) {
    throw new NotFoundError('발송 기록을 찾을 수 없습니다');
  }
  if ('scheduledFor' in input && existing[0].urgency === 'CRITICAL') {
    throw new ValidationError('CRITICAL 메시지는 예약 발송을 설정할 수 없습니다');
  }

  const patch: Record<string, unknown> = {};
  if (input.replied === true) {
    patch.replied = true;
    patch.replied_marked_at = new Date().toISOString();
  }
  if ('scheduledFor' in input) {
    patch.scheduled_for = input.scheduledFor;
  }

  const { data, error } = await client
    .from('sent_messages')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select('id, replied, replied_marked_at, scheduled_for');
  if (error) throw error;

  const rows = (data ?? []) as UpdatedSentMessageRow[];
  if (rows.length === 0) {
    throw new NotFoundError('발송 기록을 찾을 수 없습니다');
  }
  const row = rows[0];
  return {
    id: row.id,
    replied: row.replied,
    repliedMarkedAt: row.replied_marked_at,
    scheduledFor: row.scheduled_for,
  };
}
