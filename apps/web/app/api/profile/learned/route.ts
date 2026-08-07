/**
 * `GET /api/profile/learned` — `docs/API.md` "GET /api/profile/learned · DELETE
 * /api/profile/learned/{id}" (UX-009 / AC-013, AC-014). `docs/Tasks.md` T21.
 *
 * DELETE는 동적 세그먼트가 필요해 같은 디렉터리의 `[id]/route.ts`에 따로 둔다(Next.js는 같은
 * `route.ts` 파일에 정적/동적 세그먼트를 섞을 수 없다).
 */
import { withApi } from '../../../../lib/http';
import {
  fetchLearnedItemsDetailed,
  type LearnedItemDetail,
} from '../../../../lib/profile/storage';

export interface LearnedListResponse {
  items: LearnedItemDetail[];
}

export const GET = withApi<undefined, LearnedListResponse>(
  { requireAuth: true },
  async ({ session }) => {
    const client = session?.client;
    if (!client) {
      throw new Error('세션에 인증된 Supabase 클라이언트가 없습니다');
    }
    const items = await fetchLearnedItemsDetailed(client, session.userId);
    return { items };
  },
);
