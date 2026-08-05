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
  const { data, error } = await client
    .from('diff_records')
    .insert({
      user_id: input.userId,
      message_id: input.messageId,
      ai_text: input.aiText,
      final_text: input.finalText,
      // 🔴 수정 패턴 분류기가 아직 없다(`docs/Tasks.md` T20 "diff 저장 + 3회 반복 패턴 감지"가
      // 소유 — AC-012/AC-013). 분류 불가는 NULL이 정답이다(`docs/Database.md` diff_records.
      // pattern_key "분류 불가면 NULL(지어내지 않는다)") — 없는 분류를 지어내지 않는다.
      pattern_key: null,
      recipient_identifier: input.recipientIdentifier,
      channel: toDiffChannel(input.channel),
    })
    .select('id')
    .single();
  if (error) throw error;

  const row = data as { id: string };
  // 🔴 pattern_key가 항상 null이므로 이 diff가 3회 도달을 만들었을 리 없다 — 3회 판정·
  // profile_learned_items 반영은 T20 범위(`apps/web/app/api/messages/route.ts` 헤더 주석 참조).
  return { id: row.id, patternKey: null };
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
