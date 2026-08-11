/**
 * `GET /api/feedback` — `docs/API.md` "GET /api/feedback" (UX-013/UF-010). `docs/Tasks.md` T33.
 * AC-025(응답 시간 부분), AC-070.
 *
 * 🔴 감정 분류 필드가 이 응답에 존재하지 않는다(AC-070②③) — 감정 분포를 계산·반환·표시하는
 * 코드 경로가 없다.
 */
import { summarizeFeedback, type FeedbackSummary } from '@cross-border/core';
import { withApi } from '../../../lib/http';
import { fetchRepliedMessages } from '../../../lib/messages/storage';

export const GET = withApi<undefined, FeedbackSummary>(
  { requireAuth: true },
  async ({ session }) => {
    const client = session?.client;
    if (!client) {
      throw new Error('세션에 인증된 Supabase 클라이언트가 없습니다');
    }
    const records = await fetchRepliedMessages(client, session.userId);
    return summarizeFeedback(records);
  },
);
