/**
 * `GET /api/pair-protocols` — `docs/API.md` "GET /api/pair-protocols". T66(AC-067①) 전용:
 * 층 1 패널이 사용자의 기존 쌍방 규약 상대 목록을 보여주기 위해 쓴다. `docs/Tasks.md`
 * T41/T42(규약 편집)의 영역을 침범하지 않는다 — 이 라우트는 **목록 조회만** 하고
 * 개별 규약의 4항목 값은 읽지도 반환하지도 않는다.
 */
import { withApi } from '../../../lib/http';
import { fetchCounterparts } from '../../../lib/pair-protocols/storage';

export interface PairProtocolsListResponse {
  counterparts: string[];
}

export const GET = withApi<undefined, PairProtocolsListResponse>(
  { requireAuth: true },
  async ({ session }) => {
    const client = session?.client;
    if (!client) {
      throw new Error('세션에 인증된 Supabase 클라이언트가 없습니다');
    }
    const { data, error } = await client.auth.getUser();
    if (error || !data.user?.email) {
      throw new Error('세션에서 사용자 이메일을 확인할 수 없습니다');
    }
    const counterparts = await fetchCounterparts(client, data.user.email);
    return { counterparts };
  },
);
