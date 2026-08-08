/**
 * `GET / PUT / DELETE /api/profile` — `docs/API.md` "GET / PUT / DELETE /api/profile".
 * PUT은 UX-003(온보딩)의 완료·스킵 저장과 재실행(다시 온보딩을 거쳐 프로필을 채우는 경우) 모두
 * 이 한 라우트로 처리한다 — 완료/스킵의 구분은 `saveOnboardingProfile`(`lib/profile/storage.ts`)이
 * 판정한다(AC-059②의 마지막 방어선이 거기 있다). `docs/Tasks.md` T19.
 *
 * GET/DELETE는 UX-009(프로필 열람·수정 화면, `docs/Tasks.md` T21)가 채운다 — 화면이 현재 값을
 * 불러오고(GET), "다시 시작" 삭제 액션(DELETE, 계정은 삭제하지 않고 값만 비운다)을 수행한다.
 */
import { z } from 'zod';
import { withApi } from '../../../lib/http';
import {
  saveOnboardingProfile,
  fetchProfileWithMeta,
  resetProfile,
  type SavedProfile,
  type ProfileWithMeta,
} from '../../../lib/profile/storage';

const profilePutSchema = z.object({
  onboardingState: z.enum(['completed', 'skipped']),
  directness: z.enum(['direct', 'indirect']).optional(),
  emojiPreference: z.enum(['likes', 'neutral', 'avoids']).optional(),
  formality: z.enum(['high', 'medium', 'low']).optional(),
  honorificLevel: z.enum(['hapsyo', 'haeyo']).optional(),
});

type ProfilePutRequest = z.infer<typeof profilePutSchema>;

export type ProfilePutResponse = SavedProfile;

export const PUT = withApi<ProfilePutRequest, ProfilePutResponse>(
  { schema: profilePutSchema, requireAuth: true },
  async ({ input, session }) => {
    // 🔴 `session?.client`는 `requireAuth:true` 라우트에서 항상 채워진다(`lib/auth.ts` `Session`
    // JSDoc) — `apps/web/app/api/messages/route.ts`와 같은 방어적 체크.
    const client = session?.client;
    if (!client) {
      throw new Error('세션에 인증된 Supabase 클라이언트가 없습니다');
    }
    return saveOnboardingProfile(client, session.userId, input);
  },
);

/** T21 — `GET /api/profile`(UX-009 화면 조회). 인증만 요구하고 body는 없다. */
export const GET = withApi<undefined, ProfileWithMeta>(
  { requireAuth: true },
  async ({ session }) => {
    const client = session?.client;
    if (!client) {
      throw new Error('세션에 인증된 Supabase 클라이언트가 없습니다');
    }
    return fetchProfileWithMeta(client, session.userId);
  },
);

/**
 * T21 — `DELETE /api/profile`(UX-009 "온보딩을 건너뛰었습니다"로 되돌리는 삭제 액션).
 * `docs/API.md`: "프로필 값을 비우고 onboardingState 를 not_started 로 되돌린다(계정은 삭제하지
 * 않는다)". `PUT`과 같은 응답 형태(`SavedProfile`)를 반환한다 — 화면이 초기화 직후 값을 다시
 * fetch하지 않고 이 응답으로 바로 갱신할 수 있게 한다.
 */
export const DELETE = withApi<undefined, SavedProfile>(
  { requireAuth: true },
  async ({ session }) => {
    const client = session?.client;
    if (!client) {
      throw new Error('세션에 인증된 Supabase 클라이언트가 없습니다');
    }
    return resetProfile(client, session.userId);
  },
);
