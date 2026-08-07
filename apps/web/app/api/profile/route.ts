/**
 * `PUT /api/profile` — `docs/API.md` "GET / PUT / DELETE /api/profile" · `docs/Tasks.md` T19.
 * UX-003(온보딩)의 완료·스킵 저장과 재실행(다시 온보딩을 거쳐 프로필을 채우는 경우) 모두 이
 * 한 라우트로 처리한다 — 완료/스킵의 구분은 `saveOnboardingProfile`(`lib/profile/storage.ts`)이
 * 판정한다(AC-059②의 마지막 방어선이 거기 있다).
 *
 * 🔴 GET/DELETE는 이 태스크(T19) 범위가 아니다 — `docs/Tasks.md` T21(프로필 열람·수정 화면)이
 * 채운다. 이 파일에 PUT만 있는 상태로 두는 것은 두 태스크의 범위를 섞지 않기 위함이다.
 */
import { z } from 'zod';
import { withApi } from '../../../lib/http';
import { saveOnboardingProfile, type SavedProfile } from '../../../lib/profile/storage';

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
