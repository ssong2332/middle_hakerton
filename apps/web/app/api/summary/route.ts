/**
 * `POST /api/summary` — `docs/API.md` "POST /api/summary" (UX-008/UF-005) / T26.
 * AC-019, AC-020, AC-038, AC-050, AC-064②.
 *
 * 🔴 스레드를 저장하지 않는다(UX-008 Data Operations) — `apps/web/app/api/ticket/route.ts`(T24)와
 * 같은 "승인 전 영속 쓰기 없음" 원칙. 저장은 존재하지 않으므로 이 라우트에는 그런 쓰기 코드가
 * 없다.
 */
import { z } from 'zod';
import { runDecisionSummary, type SummaryResult } from '@cross-border/core';
import { withApi } from '../../../lib/http';
import { createLLMClient } from '../../../lib/llm/create-client';

const summaryRequestSchema = z.object({
  threadText: z.string().min(1),
  context: z.object({
    channel: z.enum(['web', 'extension']),
  }),
});

type SummaryRequest = z.infer<typeof summaryRequestSchema>;

export const POST = withApi<SummaryRequest, SummaryResult>(
  { schema: summaryRequestSchema, requireAuth: true },
  async ({ input, session }) => {
    const llm = await createLLMClient(session?.userId);

    // C7(T26) — 결정사항 추출 + 행별 결정 권한 판정을 한 번의 LLM 호출로 산출하고, 미확정 감지
    // (AC-038)는 결과에서 결정적으로 파생한다(`packages/core/src/steps/c7.ts`).
    const result = await runDecisionSummary({ threadText: input.threadText }, llm);

    return result;
  },
);
