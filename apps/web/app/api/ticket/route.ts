/**
 * `POST /api/ticket` — `docs/API.md` "POST /api/ticket" (UX-007/UF-004) / T24.
 * AC-017, AC-018, AC-050, AC-058, AC-062, AC-064①.
 *
 * 🔴 **이 라우트는 자체 게이트를 만들지 않는다.** AC-058의 감정 신호 게이트 판정은
 * `POST /api/mediate` 응답의 `ticketOption.offered`가 유일한 판정처다(`docs/API.md`
 * "POST /api/ticket" "게이트" 행, `docs/adr/0005-c6-ticket-gate-field.md`) — 판정기가 둘이면 같은
 * 입력이 두 가지로 갈린다. 이 라우트를 직접 호출하는 잔여 표면은 UI 레벨 보장의 한계이며
 * (`docs/API.md` 같은 행 참조), 결과가 호출한 본인에게만 표시되는 것이 그 잔여 위험의 방어선이다.
 *
 * 🔴 승인 전이므로 영속 쓰기가 없다(UX-007 Data Operations) — `sent_messages`/`diff_records`에
 * 쓰지 않는다. 사용자가 "Use this ticket"으로 이 결과를 메시지 본문으로 채택한 뒤에만
 * `POST /api/messages`(승인 클릭, AC-010)를 통해 저장된다.
 */
import { z } from 'zod';
import { runTicketConversion, type TicketResult } from '@cross-border/core';
import { withApi } from '../../../lib/http';
import { createLLMClient } from '../../../lib/llm/create-client';

const ticketRequestSchema = z.object({
  text: z.string().min(1),
  context: z.object({
    channel: z.enum(['web', 'extension']),
  }),
});

type TicketRequest = z.infer<typeof ticketRequestSchema>;

export const POST = withApi<TicketRequest, TicketResult>(
  { schema: ticketRequestSchema, requireAuth: true },
  async ({ input, session }) => {
    const llm = await createLLMClient(session?.userId);

    // C6(T24) — 4섹션 변환 + 결정 권한 상태를 한 번의 LLM 호출로 산출한다
    // (AC-017/018/050/062/064①, `packages/core/src/steps/c6.ts`).
    const result = await runTicketConversion({ text: input.text }, llm);

    return result;
  },
);
