/**
 * `POST /api/deadline/check` — `docs/API.md` "POST /api/deadline/check" (UX-005/UF-003).
 * `docs/Tasks.md` T39. AC-036, AC-057, AC-005(지연 절반).
 *
 * 🔴 CRITICAL 자기 배제는 **서버가 강제**한다(`docs/API.md:279`, AC-005) — 클라이언트를 믿지
 * 않는다. 판정은 `resolveDeliveryPath(urgency) === 'immediate'`(`@cross-border/core`) **하나만**
 * 쓰고, 이 라우트가 긴급도 판정 로직을 다시 구현하지 않는다. CRITICAL이면 `400`이 아니라
 * `200 + { skipped: 'critical_immediate' }`다 — "거부"가 아니라 "정상적으로 건너뛰는 경로"이기
 * 때문이다.
 */
import { z } from 'zod';
import {
  checkDeadlineFeasibility,
  resolveDeliveryPath,
  type CounterOffer,
} from '@cross-border/core';
import { withApi } from '../../../../lib/http';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function isValidIsoDatetime(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

const recipientSchema = z
  .object({
    timezone: z
      .string()
      .trim()
      .min(1, 'IANA 타임존을 입력해주세요')
      .refine(isValidTimezone, { message: '올바른 IANA 타임존이 아닙니다' }),
    workStart: z.string().regex(TIME_PATTERN, '근무 시작 시각은 HH:mm 형식이어야 합니다'),
    workEnd: z.string().regex(TIME_PATTERN, '근무 종료 시각은 HH:mm 형식이어야 합니다'),
    country: z.enum(['KR', 'US', 'JP', 'CN']).optional(),
  })
  .refine((value) => value.workStart < value.workEnd, {
    message: '근무 종료 시각은 시작 시각보다 늦어야 합니다',
    path: ['workEnd'],
  });

const deadlineCheckRequestSchema = z.object({
  urgency: z.enum(['CRITICAL', 'NORMAL', 'LOW']),
  neededBy: z.string().refine(isValidIsoDatetime, { message: '올바른 날짜/시각 형식이 아닙니다' }),
  recipient: recipientSchema,
});

type DeadlineCheckRequest = z.infer<typeof deadlineCheckRequestSchema>;

export interface DeadlineCheckResponse {
  feasible: boolean;
  reason: string;
  counterOffers: CounterOffer[];
  skipped?: 'critical_immediate';
}

export const POST = withApi<DeadlineCheckRequest, DeadlineCheckResponse>(
  { schema: deadlineCheckRequestSchema, requireAuth: true },
  async ({ input }) => {
    if (resolveDeliveryPath(input.urgency) === 'immediate') {
      return {
        feasible: true,
        skipped: 'critical_immediate',
        reason: 'CRITICAL 메시지는 예약·지연 경로를 거치지 않고 즉시 발송됩니다',
        counterOffers: [],
      };
    }

    const result = checkDeadlineFeasibility(input.neededBy, {
      timezone: input.recipient.timezone,
      workStart: input.recipient.workStart,
      workEnd: input.recipient.workEnd,
      country: input.recipient.country ?? null,
    });

    return result;
  },
);
