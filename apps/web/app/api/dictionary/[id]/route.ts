/**
 * `PUT / DELETE /api/dictionary/{id}` — `docs/API.md` "GET / POST /api/dictionary · PUT / DELETE
 * /api/dictionary/{id}" (UX-010, UF-007). `docs/Tasks.md` T23. AC-016, AC-047.
 *
 * `apps/web/app/api/profile/learned/[id]/route.ts`(T21)와 같은 이유로 `request.url`에서 id를
 * 직접 파싱한다 — `withApi()`가 Next.js의 `{ params }`를 받지 않으므로(그 파일 헤더 주석 참조).
 */
import { ValidationError } from '@cross-border/core';
import { withApi } from '../../../../lib/http';
import { dictionaryEntryBodySchema, type DictionaryEntryBody } from '../../../../lib/dictionary/schema';
import {
  deleteDictionaryEntry,
  updateDictionaryEntry,
  type DictionaryEntryDetail,
} from '../../../../lib/dictionary/storage';

function parseIdFromUrl(request: Request): string {
  const id = new URL(request.url).pathname.split('/').filter(Boolean).pop();
  if (!id) {
    throw new ValidationError('id가 없습니다');
  }
  return id;
}

export interface DictionaryDeleteResponse {
  id: string;
}

/** T23 — `PUT /api/dictionary/{id}`(UX-010 수정). */
export const PUT = withApi<DictionaryEntryBody, DictionaryEntryDetail>(
  { schema: dictionaryEntryBodySchema, requireAuth: true },
  async ({ input, request, session }) => {
    const client = session?.client;
    if (!client) {
      throw new Error('세션에 인증된 Supabase 클라이언트가 없습니다');
    }
    const id = parseIdFromUrl(request);
    return updateDictionaryEntry(client, session.userId, id, input);
  },
);

/** T23 — `DELETE /api/dictionary/{id}`(UX-010 삭제, 확인 후 호출). */
export const DELETE = withApi<undefined, DictionaryDeleteResponse>(
  { requireAuth: true },
  async ({ request, session }) => {
    const client = session?.client;
    if (!client) {
      throw new Error('세션에 인증된 Supabase 클라이언트가 없습니다');
    }
    const id = parseIdFromUrl(request);
    await deleteDictionaryEntry(client, session.userId, id);
    return { id };
  },
);
