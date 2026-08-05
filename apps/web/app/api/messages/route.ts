/**
 * `POST /api/messages` — `docs/API.md` "POST /api/messages" · `docs/Tasks.md` T14.
 *
 * 🔴 **모의 전송.** `sent_messages` 1행 + `diff_records` 1행을 생성한다. **이 라우트는 사용자의
 * 명시적 승인 동작(Approve & Send 클릭)으로만 호출되며, 다른 어떤 라우트도 이것을 내부에서
 * 호출하지 않는다**(AC-010). 리포 전체에서 이 경로를 호출하는 지점은
 * `apps/web/components/RecipientPanel.tsx`의 승인 버튼 핸들러 한 곳뿐이다 — grep으로 검증
 * 가능해야 한다(구현 보고서에 grep 결과를 첨부한다).
 *
 * 🔴 **DB 의존성 — T18보다 먼저 존재하는 두 테이블.** `sent_messages`·`diff_records`는
 * `docs/Tasks.md` T18(스키마 구축)이 아직 `todo`라 실제 Supabase 프로젝트에 없다. T4가
 * `llm_cache`·`llm_call_log`를 T18보다 먼저 최소 마이그레이션(`0001_llm_cache_and_log.sql`)으로
 * 만든 것과 같은 방식으로, 이 태스크가 `supabase/migrations/0002_sent_messages_and_diff_
 * records.sql`을 작성한다(파일만 — 실제 적용은 오케스트레이터 판단).
 *
 * 🔴 **`learnedApplied`는 이 라우트 범위에서 항상 `false`다.** `docs/API.md` Response 201의
 * `learnedApplied` = "이 diff로 어떤 패턴이 3회에 도달해 프로필에 반영되었는지" — 그 판정
 * (`pattern_key` 분류 + `GROUP BY pattern_key HAVING count(*) >= 3` + `profile_learned_items`
 * 쓰기)은 `docs/Tasks.md` **T20**("diff 저장 + 3회 반복 패턴 감지", AC-012/AC-013)의 범위다.
 * T20은 아직 `todo`이고 `profile_learned_items` 테이블도 T18 의존이라 존재하지 않는다.
 * `diff_records.pattern_key`를 분류할 분류기 자체가 리포에 없으므로(패턴 분류 로직 0건,
 * `packages/core`에 grep으로 확인 가능) 지금 이 값을 지어내면 `docs/CodingRules.md` Error
 * Handling "없는 값을 지어내지 않는다"를 어긴다 — `pattern_key`는 항상 `null`로 저장되고
 * (`lib/messages/storage.ts` 참조), `learnedApplied`는 항상 `false`로 반환한다. T20이 착수되면
 * 이 라우트가 그 결과를 읽어 반영하도록 교체한다.
 */
import { z } from 'zod';
import type { CountryCode, UrgencyLevel } from '@cross-border/core';
import { withApi } from '../../../lib/http';
import {
  insertSentMessageAndDiffRecord,
  type SentMessageChannel,
} from '../../../lib/messages/storage';
import { getIdempotentResponse, saveIdempotentResponse } from '../../../lib/messages/idempotency';

const messagesRequestSchema = z.object({
  originalText: z.string().min(1),
  finalText: z.string().min(1),
  aiSuggestedText: z.string().min(1),
  urgency: z.enum(['CRITICAL', 'NORMAL', 'LOW']),
  recipient: z.string().min(1),
  recipientCountry: z.enum(['KR', 'US', 'JP', 'CN']).nullable().optional(),
  recipientTimezone: z.string().nullable().optional(),
  channel: z.enum(['web_mock', 'extension_insert', 'extension_clipboard']),
  scheduledFor: z.string().nullable().optional(),
  mediationApplied: z.boolean(),
  isReminder: z.boolean().optional(),
  parentMessageId: z.string().optional(),
});

type MessagesRequest = z.infer<typeof messagesRequestSchema>;

export interface MessagesResponse {
  messageId: string;
  diffId: string;
  sentAt: string;
  patternKey: string | null;
  learnedApplied: boolean;
}

export const POST = withApi<MessagesRequest, MessagesResponse>(
  { schema: messagesRequestSchema, requireAuth: true, successStatus: 201 },
  async ({ input, request, session }) => {
    // 🔴 `session.client`는 `requireAuth:true` 라우트에서 `resolveSession()`이 항상 채워
    // 반환한다(`apps/web/lib/auth.ts` `Session` JSDoc) — 실제 운영에서는 undefined일 수 없다.
    // 그럼에도 타입이 optional이므로(테스트 목이 생략할 수 있어) 방어적으로 검사한다.
    const client = session?.client;
    if (!client) {
      throw new Error('세션에 인증된 Supabase 클라이언트가 없습니다');
    }

    // 🔴 Major 2(reviewer REJECTED → 수정) — `docs/API.md` Conventions "멱등성": 선택적
    // `Idempotency-Key` 헤더. 같은 사용자가 같은 키로 재요청하면(더블클릭·네트워크 재시도) 다시
    // insert하지 않고 첫 응답을 그대로 재사용한다.
    const idempotencyKey = request.headers.get('idempotency-key');
    if (idempotencyKey) {
      const cached = getIdempotentResponse<MessagesResponse>(session.userId, idempotencyKey);
      if (cached) {
        return cached;
      }
    }

    const channel = input.channel as SentMessageChannel;

    // 🔴 Major 2(reviewer REJECTED → 수정) — 두 insert(`sent_messages`/`diff_records`)를
    // 원자적으로 묶은 단일 함수를 쓴다(`lib/messages/storage.ts` 참조). 두 번째 insert가
    // 실패하면 첫 번째 행이 보상 삭제되어 고아 행이 남지 않는다.
    const { sentMessage, diffRecord } = await insertSentMessageAndDiffRecord(
      client,
      {
        userId: session.userId,
        recipientIdentifier: input.recipient,
        recipientCountry: (input.recipientCountry ?? null) as CountryCode | null,
        recipientTimezone: input.recipientTimezone ?? null,
        originalText: input.originalText,
        finalText: input.finalText,
        urgency: input.urgency as UrgencyLevel,
        channel,
        scheduledFor: input.scheduledFor ?? null,
        mediationApplied: input.mediationApplied,
        isReminder: input.isReminder ?? false,
        parentMessageId: input.parentMessageId ?? null,
      },
      (messageId) => ({
        userId: session.userId,
        messageId,
        aiText: input.aiSuggestedText,
        finalText: input.finalText,
        recipientIdentifier: input.recipient,
        channel,
      }),
    );

    const responseBody: MessagesResponse = {
      messageId: sentMessage.id,
      diffId: diffRecord.id,
      sentAt: sentMessage.sentAt,
      patternKey: diffRecord.patternKey,
      // 🔴 T20 미도달 — 파일 헤더 주석 참조. 지어내지 않고 항상 false.
      learnedApplied: false,
    };

    if (idempotencyKey) {
      saveIdempotentResponse(session.userId, idempotencyKey, responseBody);
    }

    return responseBody;
  },
);
