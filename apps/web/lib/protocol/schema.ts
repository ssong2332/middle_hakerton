/**
 * T41/T42 — `GET / PUT /api/protocol` 공통 요청 스키마(`docs/API.md` "GET / PUT /api/protocol"
 * Request 계약, `docs/Database.md` `pair_protocols` 4축). `docs/UX.md` UX-011 Validation —
 * 5번째 축을 만드는 diff는 반려 대상이므로 `.strict()`로 미지 키를 400 처리한다(무시가 아니라
 * 거부, `docs/API.md:227` 서버 규칙).
 */
import { z } from 'zod';

export const protocolQuerySchema = z.object({
  counterpart: z.string().trim().email('올바른 이메일 형식이 아닙니다'),
});

export const protocolPutSchema = z
  .object({
    counterpart: z.string().trim().email('올바른 이메일 형식이 아닙니다'),
    directnessAllowed: z.enum(['yes', 'no']).nullable().optional(),
    emojiPolicy: z.enum(['ok', 'avoid']).nullable().optional(),
    addressForm: z.string().trim().min(1).nullable().optional(),
    deadlineStyle: z.string().trim().min(1).nullable().optional(),
  })
  .strict();

export type ProtocolPutRequest = z.infer<typeof protocolPutSchema>;
