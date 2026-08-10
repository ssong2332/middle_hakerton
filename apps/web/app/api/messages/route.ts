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
 * 🔴 **`learnedApplied`(T20, AC-012/AC-013).** `docs/API.md` Response 201의 `learnedApplied`
 * = "이 diff로 어떤 패턴이 3회에 도달해 프로필에 반영되었는지". `diff_records` insert 시점에
 * `pattern_key`가 분류되고(`packages/core/src/rules/pattern-detection.ts`
 * `classifyDiffPattern`, `lib/messages/storage.ts` `insertDiffRecord`), 이 라우트는 그 결과를
 * `applyPatternLearningSafe`(`lib/messages/pattern-learning.ts`)에 넘겨 "같은 패턴이 사용자
 * 전체 발송에서 3회 이상 나왔는가"를 판정한다. 3회 미만이면 `profile_learned_items`에 아무것도
 * 쓰지 않고 `learnedApplied: false`, 3회 이상이면 그 테이블에 upsert한 뒤 `true`를 반환한다.
 * 이 판정 자체가 실패해도(Supabase 에러 등) 발송은 이미 커밋되어 있으므로 `learnedApplied:
 * false`로 안전하게 응답한다 — 아래 본문 주석 및 `applyPatternLearningSafe` 헤더 주석 참조.
 */
import { z } from 'zod';
import { resolveDeliveryPath, type CountryCode, type UrgencyLevel } from '@cross-border/core';
import { withApi } from '../../../lib/http';
import {
  insertSentMessageAndDiffRecord,
  type SentMessageChannel,
} from '../../../lib/messages/storage';
import { getIdempotentResponse, saveIdempotentResponse } from '../../../lib/messages/idempotency';
import { applyPatternLearningSafe } from '../../../lib/messages/pattern-learning';

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
    const urgency = input.urgency as UrgencyLevel;

    // 🔴 T32(reviewer 재검토, 2026-08-10 발견·수정) — `docs/API.md:122` 서버 규칙 "urgency ===
    // 'CRITICAL'이면 scheduledFor를 무시하고 NULL로 저장한다(AC-005). 클라이언트를 믿지 않는다"가
    // 계약에는 있었지만 실제로 집행되지 않고 있었다 — 클라이언트가 보낸 scheduledFor를 그대로
    // 저장했다. `resolveDeliveryPath()`(T39·T31에서도 재사용한 그 함수) 하나로만 판정하고
    // 긴급도 분기 로직을 여기서 다시 만들지 않는다.
    const scheduledFor = resolveDeliveryPath(urgency) === 'immediate' ? null : (input.scheduledFor ?? null);

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
        urgency,
        channel,
        scheduledFor,
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

    // T20 — 3회 반복 판정 + profile_learned_items 반영(파일 헤더 주석 참조). diff 저장 자체의
    // 원자성(위 insertSentMessageAndDiffRecord)과 달리, 이 단계는 파생 데이터 쓰기다.
    //
    // 🔴 Reviewer Major(REJECTED → 수정) — 여기는 발송 커밋(위 insertSentMessageAndDiffRecord,
    // 이미 durable)과 멱등성 캐시 저장(아래 saveIdempotentResponse) 사이다. 이 단계가 예외를
    // 던지면 발송은 됐는데 캐시는 없어 재시도 시 중복 발송이 된다 — 그래서 `applyPatternLearning`
    // 을 직접 부르지 않고, 내부에서 에러를 잡아 로그만 남기고 학습 미반영(false)으로 안전하게
    // 되돌리는 `applyPatternLearningSafe`(lib/messages/pattern-learning.ts)를 부른다. 패턴
    // 학습 실패가 발송 성공을 500/중복 위험으로 바꾸지 않는다(`docs/CodingRules.md` Error
    // Handling "부분 실패는 실패가 아니다"와 동일 원칙 — Route Handler 본문에는 여전히
    // try/catch가 없다).
    const learnedApplied = await applyPatternLearningSafe(
      client,
      session.userId,
      diffRecord.patternKey,
    );

    const responseBody: MessagesResponse = {
      messageId: sentMessage.id,
      diffId: diffRecord.id,
      sentAt: sentMessage.sentAt,
      patternKey: diffRecord.patternKey,
      learnedApplied,
    };

    if (idempotencyKey) {
      saveIdempotentResponse(session.userId, idempotencyKey, responseBody);
    }

    return responseBody;
  },
);
