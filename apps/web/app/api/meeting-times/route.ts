/**
 * `POST /api/meeting-times` — `docs/API.md` "POST /api/meeting-times" (UX-012/UF-009).
 * `docs/Tasks.md` T31. AC-023.
 *
 * 🔴 DB 조회가 없다 — `sender`/`recipient`의 타임존·근무시간은 요청 body로 직접 받는다(수동
 * 입력, `docs/Tasks.md` T31·T39 "착수 전 확인 항목" 표가 명시한 대로 architect가 API 계약
 * 자체로 이미 답했다). 실제 계산은 `packages/core/src/rules/meeting-times.ts`의
 * `findMeetingCandidates()`(LLM 호출 없음, 전부 결정적 계산)에 위임한다.
 */
import { z } from 'zod';
import { findMeetingCandidates, type MeetingTimeCandidate } from '@cross-border/core';
import { withApi } from '../../../lib/http';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const workWindowSchema = z
  .object({
    timezone: z.string().trim().min(1, 'IANA 타임존을 입력해주세요'),
    workStart: z.string().regex(TIME_PATTERN, '근무 시작 시각은 HH:mm 형식이어야 합니다'),
    workEnd: z.string().regex(TIME_PATTERN, '근무 종료 시각은 HH:mm 형식이어야 합니다'),
  })
  .refine((value) => value.workStart < value.workEnd, {
    message: '근무 종료 시각은 시작 시각보다 늦어야 합니다',
    path: ['workEnd'],
  });

const meetingTimesRequestSchema = z
  .object({
    sender: workWindowSchema,
    recipient: workWindowSchema,
    dateRange: z.object({
      from: z.string().regex(DATE_PATTERN, '날짜는 YYYY-MM-DD 형식이어야 합니다'),
      to: z.string().regex(DATE_PATTERN, '날짜는 YYYY-MM-DD 형식이어야 합니다'),
    }),
  })
  .refine((value) => value.dateRange.from <= value.dateRange.to, {
    message: 'dateRange.to는 dateRange.from보다 앞설 수 없습니다',
    path: ['dateRange', 'to'],
  });

type MeetingTimesRequest = z.infer<typeof meetingTimesRequestSchema>;

export interface MeetingTimesResponse {
  candidates: MeetingTimeCandidate[];
}

export const POST = withApi<MeetingTimesRequest, MeetingTimesResponse>(
  { schema: meetingTimesRequestSchema, requireAuth: true },
  async ({ input }) => {
    const candidates = findMeetingCandidates(input.sender, input.recipient, input.dateRange);
    return { candidates };
  },
);
