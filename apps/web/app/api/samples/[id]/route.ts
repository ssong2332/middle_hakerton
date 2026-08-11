/**
 * `DELETE /api/samples/{id}` — `docs/API.md:335` (UX-019, UF-021) / AC-081④. `docs/Tasks.md` T72.
 *
 * `apps/web/app/api/dictionary/[id]/route.ts`(T23)와 같은 패턴으로 `request.url`에서 id를 직접
 * 파싱한다 — `withApi()`가 Next.js의 `{ params }`를 받지 않는다(그 파일 헤더 주석 참조).
 */
import { ValidationError } from '@cross-border/core';
import { withApi } from '../../../../lib/http';
import { deleteSample } from '../../../../lib/samples/storage';

function parseIdFromUrl(request: Request): string {
  const id = new URL(request.url).pathname.split('/').filter(Boolean).pop();
  if (!id) {
    throw new ValidationError('id가 없습니다');
  }
  return id;
}

export interface SamplesDeleteResponse {
  id: string;
}

/** T72 — 행이 없으면(타인 소유 포함, RLS 결과) `NotFoundError` → 404(`docs/API.md:345` Errors
 * "400·401·404"). 재집계는 별도 단계가 없다 — 지표를 캐시하지 않으므로(`docs/Database.md:254`)
 * 다음 `GET /api/samples` 호출이 남은 행만으로 자동 재집계한다. */
export const DELETE = withApi<undefined, SamplesDeleteResponse>(
  { requireAuth: true },
  async ({ request, session }) => {
    const client = session?.client;
    if (!client) {
      throw new Error('세션에 인증된 Supabase 클라이언트가 없습니다');
    }
    const id = parseIdFromUrl(request);
    await deleteSample(client, session.userId, id);
    return { id };
  },
);
