/**
 * `PATCH /api/messages/{id}` — `docs/API.md` "PATCH /api/messages/{id}" (UX-015 "답장 받음"
 * 마킹 · UX-006 예약 설정). `docs/Tasks.md` T50. AC-044①, AC-024.
 *
 * `apps/web/app/api/dictionary/[id]/route.ts`(T23)와 같은 이유로 `request.url`에서 id를
 * 직접 파싱한다 — `withApi()`가 Next.js의 `{ params }`를 받지 않는다.
 */
import { z } from 'zod';
import { ValidationError } from '@cross-border/core';
import { withApi } from '../../../../lib/http';
import { updateSentMessage, type UpdatedSentMessage } from '../../../../lib/messages/storage';

function parseIdFromUrl(request: Request): string {
  const id = new URL(request.url).pathname.split('/').filter(Boolean).pop();
  if (!id) {
    throw new ValidationError('id가 없습니다');
  }
  return id;
}

const patchMessageSchema = z
  .object({
    replied: z.literal(true).optional(),
    scheduledFor: z.string().nullable().optional(),
  })
  .refine((value) => value.replied !== undefined || value.scheduledFor !== undefined, {
    message: 'replied 또는 scheduledFor 중 하나는 있어야 합니다',
  });

type PatchMessageRequest = z.infer<typeof patchMessageSchema>;

export const PATCH = withApi<PatchMessageRequest, UpdatedSentMessage>(
  { schema: patchMessageSchema, requireAuth: true },
  async ({ input, request, session }) => {
    const client = session?.client;
    if (!client) {
      throw new Error('세션에 인증된 Supabase 클라이언트가 없습니다');
    }
    const id = parseIdFromUrl(request);
    return updateSentMessage(client, session.userId, id, input);
  },
);
