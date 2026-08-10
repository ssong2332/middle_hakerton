/**
 * `GET / PUT /api/protocol` — `docs/API.md` "GET / PUT /api/protocol" (UX-011/UF-008).
 * `docs/Tasks.md` T41/T42. AC-037, AC-075.
 *
 * `apps/web/app/api/dictionary/route.ts`(T23)와 같은 배선 패턴: 검증(`withApi()`의 zod
 * 스키마) → 세션의 `client`로 저장소 함수 호출 → 응답 조합.
 */
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ValidationError } from '@cross-border/core';
import { withApi } from '../../../lib/http';
import { protocolPutSchema, type ProtocolPutRequest } from '../../../lib/protocol/schema';
import { fetchProtocol, saveProtocol, type ProtocolRecord } from '../../../lib/protocol/storage';

const protocolGetQuerySchema = z.object({
  counterpart: z.string().trim().email('올바른 이메일 형식이 아닙니다'),
});

async function resolveUserEmail(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.email) {
    throw new Error('세션에서 사용자 이메일을 확인할 수 없습니다');
  }
  return data.user.email;
}

/**
 * T41 — `GET /api/protocol?counterpart=<email>`(UX-011 화면 조회). 규약이 아직 없으면
 * `fetchProtocol()`이 `authorshipState:'untouched'` 기본값을 돌려준다(404가 아니다 —
 * `docs/API.md:226` Errors가 400·401만 나열).
 */
export const GET = withApi<undefined, ProtocolRecord>({ requireAuth: true }, async ({ request, session }) => {
  const client = session?.client;
  if (!client) {
    throw new Error('세션에 인증된 Supabase 클라이언트가 없습니다');
  }
  const url = new URL(request.url);
  const parsed = protocolGetQuerySchema.safeParse({ counterpart: url.searchParams.get('counterpart') });
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? '올바른 이메일 형식이 아닙니다');
  }
  const userEmail = await resolveUserEmail(client);
  return fetchProtocol(client, userEmail, parsed.data.counterpart);
});

/** T41/T42 — `PUT /api/protocol`(UX-011 저장). */
export const PUT = withApi<ProtocolPutRequest, ProtocolRecord>(
  { schema: protocolPutSchema, requireAuth: true },
  async ({ input, session }) => {
    const client = session?.client;
    if (!client) {
      throw new Error('세션에 인증된 Supabase 클라이언트가 없습니다');
    }
    const userEmail = await resolveUserEmail(client);
    return saveProtocol(client, userEmail, session.userId, input);
  },
);
