/**
 * `GET /api/protocol/mismatches` — `docs/API.md:241` (UX-011 MismatchBanner, UF-022) / AC-079,
 * AC-083. `docs/Tasks.md` T70.
 *
 * 🔴 이 라우트는 **판정 로직을 갖지 않는다** — 조회(`fetchProtocol`/`getIndicatorRollupForCounterpart`)
 * 후 `packages/core`의 `computeProtocolMismatches()`를 부를 뿐이다(`docs/Architecture.md`
 * Conventions 11 — core는 조회하지 않고, 조회는 core를 판단하지 않는다).
 *
 * 🔴 이 라우트가 UX-011 화면에 배너를 그리지 않는다 — 그건 T69(`[FE]`, 별도 태스크, `todo`)의
 * 몫이다(`docs/UX.md:649` "this screen does not compute the comparison itself, only renders
 * it"). T70은 그 화면이 읽을 신호(`axes[]`)만 만든다.
 */
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { computeProtocolMismatches, type MismatchAxisResult } from '@cross-border/core';
import { ValidationError } from '@cross-border/core';
import { withApi } from '../../../../lib/http';
import { fetchProtocol, toPairProtocolOrNull } from '../../../../lib/protocol/storage';
import { getIndicatorRollupForCounterpart } from '../../../../lib/samples/storage';

const mismatchesGetQuerySchema = z.object({
  counterpart: z.string().trim().email('올바른 이메일 형식이 아닙니다'),
});

async function resolveUserEmail(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.email) {
    throw new Error('세션에서 사용자 이메일을 확인할 수 없습니다');
  }
  return data.user.email;
}

export interface MismatchesGetResponse {
  axes: MismatchAxisResult[];
}

/** T70 — `docs/API.md:243` Response 200 `{ axes: [...] }`. 규약이 아직 없으면(`authorshipState
 * === 'untouched'`) 대조할 합의값이 없으므로 `axes: []`(에러가 아니다 — `fetchProtocol()`의
 * "규약 없음은 정상 상태" 선례와 같은 판단). */
export const GET = withApi<undefined, MismatchesGetResponse>(
  { requireAuth: true },
  async ({ request, session }) => {
    const client = session?.client;
    if (!client) {
      throw new Error('세션에 인증된 Supabase 클라이언트가 없습니다');
    }
    const url = new URL(request.url);
    const parsed = mismatchesGetQuerySchema.safeParse({ counterpart: url.searchParams.get('counterpart') });
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? '올바른 이메일 형식이 아닙니다');
    }

    const userEmail = await resolveUserEmail(client);
    const [protocolRecord, rollup] = await Promise.all([
      fetchProtocol(client, userEmail, parsed.data.counterpart),
      getIndicatorRollupForCounterpart(client, session.userId, parsed.data.counterpart),
    ]);
    const protocol = toPairProtocolOrNull(protocolRecord);
    if (!protocol) {
      return { axes: [] };
    }
    return { axes: computeProtocolMismatches(protocol, rollup) };
  },
);
