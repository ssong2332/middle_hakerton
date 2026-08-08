/**
 * `DELETE /api/profile/learned/{id}` — `docs/API.md` "GET /api/profile/learned · DELETE
 * /api/profile/learned/{id}" (UX-009 / AC-013, AC-014). `docs/Tasks.md` T21.
 *
 * 🔴 이 리포의 첫 동적 세그먼트(`[id]`) Route Handler다 — 기존 관례가 없다.
 * `withApi()`(`apps/web/lib/http.ts`)의 반환 시그니처는 `(request: Request) => Promise<...>`
 * 뿐이라 Next.js가 두 번째 인자로 넘기는 `{ params }`를 받지 않는다. 이 한 라우트를 위해
 * `withApi()` 시그니처를 넓히면(다른 요청 없이 컨텍스트를 추가) 이미 그 시그니처에 기대는
 * 모든 기존 Route Handler의 타입에 영향을 주므로, 대신 `request.url`에서 마지막 경로
 * 세그먼트를 직접 읽는다 — 이 라우트 파일 안에서만 끝나는 변경이다.
 */
import { ValidationError } from '@cross-border/core';
import { withApi } from '../../../../../lib/http';
import { deleteLearnedItem } from '../../../../../lib/profile/storage';

export interface LearnedDeleteResponse {
  id: string;
}

export const DELETE = withApi<undefined, LearnedDeleteResponse>(
  { requireAuth: true },
  async ({ request, session }) => {
    const client = session?.client;
    if (!client) {
      throw new Error('세션에 인증된 Supabase 클라이언트가 없습니다');
    }

    const id = new URL(request.url).pathname.split('/').filter(Boolean).pop();
    if (!id) {
      throw new ValidationError('id가 없습니다');
    }

    await deleteLearnedItem(client, session.userId, id);
    return { id };
  },
);
