/**
 * `POST /api/protocol/confirm-inference` — `docs/API.md:229` (UX-018 Stage 4, UF-018) / AC-074.
 * `docs/Tasks.md` T69.
 *
 * 🔴 요청 스키마는 `PUT /api/protocol`과 동일하다(`docs/API.md:236` Request가 같은 shape) — 두
 * 벌을 따로 만들지 않고 `protocolPutSchema`를 재사용한다.
 *
 * 🔴 이 라우트가 호출되기 전까지 추론 결과는 어디에도 저장되지 않는다(AC-074②) — 초안은
 * `POST /api/enrichment/suggest`(T68) 응답으로만 존재하고, 이 라우트가 유일한 쓰기 경로다.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { withApi } from '../../../../lib/http';
import { protocolPutSchema, type ProtocolPutRequest } from '../../../../lib/protocol/schema';
import { confirmInference, type ProtocolRecord } from '../../../../lib/protocol/storage';

async function resolveUserEmail(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.email) {
    throw new Error('세션에서 사용자 이메일을 확인할 수 없습니다');
  }
  return data.user.email;
}

/** T69 — `docs/API.md:237` Response 200(갱신된 규약 + `authorshipState:'sender_confirmed'`) ·
 * 409 `CONFLICT_PROTOCOL_AUTHORED`(`confirmInference()`가 던진다). */
export const POST = withApi<ProtocolPutRequest, ProtocolRecord>(
  { schema: protocolPutSchema, requireAuth: true },
  async ({ input, session }) => {
    const client = session?.client;
    if (!client) {
      throw new Error('세션에 인증된 Supabase 클라이언트가 없습니다');
    }
    const userEmail = await resolveUserEmail(client);
    return confirmInference(client, userEmail, session.userId, input);
  },
);
