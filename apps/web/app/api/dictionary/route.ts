/**
 * `GET / POST /api/dictionary` — `docs/API.md` "GET / POST /api/dictionary · PUT / DELETE
 * /api/dictionary/{id}" (UX-010, UF-007). `docs/Tasks.md` T23. AC-016, AC-047.
 *
 * `apps/web/app/api/profile/route.ts`(T19/T21)와 같은 배선 패턴이다 — 검증(`withApi()`의 zod
 * 스키마) → 세션의 `client`로 저장소 함수 호출 → 응답 조합.
 */
import { withApi } from '../../../lib/http';
import { dictionaryEntryBodySchema, type DictionaryEntryBody } from '../../../lib/dictionary/schema';
import {
  createDictionaryEntry,
  fetchDictionaryEntriesDetailed,
  type DictionaryEntryDetail,
} from '../../../lib/dictionary/storage';

export interface DictionaryListResponse {
  items: DictionaryEntryDetail[];
}

/** T23 — `GET /api/dictionary`(UX-010 화면 조회). 인증만 요구하고 body는 없다. */
export const GET = withApi<undefined, DictionaryListResponse>(
  { requireAuth: true },
  async ({ session }) => {
    const client = session?.client;
    if (!client) {
      throw new Error('세션에 인증된 Supabase 클라이언트가 없습니다');
    }
    const items = await fetchDictionaryEntriesDetailed(client, session.userId);
    return { items };
  },
);

/**
 * T23 — `POST /api/dictionary`(UX-010 추가). `docs/API.md` Response "201" — 리소스를 생성하므로
 * `successStatus: 201`(`apps/web/lib/http.ts` `WithApiOptions.successStatus` JSDoc과 같은 이유,
 * T14의 `POST /api/messages` 선례).
 */
export const POST = withApi<DictionaryEntryBody, DictionaryEntryDetail>(
  { schema: dictionaryEntryBodySchema, requireAuth: true, successStatus: 201 },
  async ({ input, session }) => {
    const client = session?.client;
    if (!client) {
      throw new Error('세션에 인증된 Supabase 클라이언트가 없습니다');
    }
    return createDictionaryEntry(client, session.userId, input);
  },
);
