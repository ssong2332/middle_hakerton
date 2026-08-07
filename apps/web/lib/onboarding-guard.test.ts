/**
 * T73④ — `docs/UX.md:899` "Direct URL access" v2.7/AC-059: 인증된 사용자가 온보딩을 완료하지도
 * 건너뛰지도 않은 상태(`onboarding_state === 'not_started'`)로 `/onboarding` 외의 URL에 접근하면
 * UX-003으로 강제 리다이렉트한다(한 번만). `docs/Tasks.md` T73 row 판정 조건 ⓐ~ⓓ.
 *
 * 이 함수는 `apps/web/app/(app)/(with-nav)/layout.tsx`(async Server Component)에서만 호출된다.
 * `(app)/onboarding`은 이 레이아웃의 형제(그룹 밖)이므로 이 함수를 애초에 호출하지 않는다
 * (ⓒ 루프 방지 — 구조적으로 보장, `apps/web/app/(app)/onboarding/route-composition.test.ts`).
 * DB 조회가 필요해 `apps/web/proxy.ts`(Optimistic-checks-only)가 아니라 이 Server Component
 * 레이어에서 실행한다 — `apps/web/proxy.ts:96~99`의 낙관적 확인 전용 규칙과 충돌하지 않는다.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockGetUser, mockFetchSenderProfile, mockRedirect } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFetchSenderProfile: vi.fn(),
  mockRedirect: vi.fn(),
}));

vi.mock('./supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
}));

vi.mock('./profile/storage', () => ({
  fetchSenderProfile: (...args: unknown[]) => mockFetchSenderProfile(...args),
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}));

import { enforceOnboardingRedirect } from './onboarding-guard';

function profileWith(onboardingState: 'not_started' | 'skipped' | 'completed') {
  return {
    onboardingState,
    directness: null,
    emojiPreference: null,
    formality: null,
    honorificLevel: null,
  };
}

describe('enforceOnboardingRedirect — T73④', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  });

  it('ⓐ-1 — not_started 계정이 /mediate에 해당하는 레이아웃(with-nav)을 거치면 /onboarding으로 리다이렉트한다', async () => {
    mockFetchSenderProfile.mockResolvedValue(profileWith('not_started'));

    await enforceOnboardingRedirect();

    expect(mockRedirect).toHaveBeenCalledWith('/onboarding');
  });

  it('ⓐ-2 — not_started 계정이 /profile에 해당하는 레이아웃(with-nav)을 거쳐도 동일하게 /onboarding으로 리다이렉트한다(2/2)', async () => {
    mockFetchSenderProfile.mockResolvedValue(profileWith('not_started'));

    await enforceOnboardingRedirect();

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    expect(mockRedirect).toHaveBeenCalledWith('/onboarding');
  });

  it('ⓑ-1 — skipped 계정은 리다이렉트되지 않는다(0건) — AC-059① 유지, 스킵 사용자를 가두지 않는다', async () => {
    mockFetchSenderProfile.mockResolvedValue(profileWith('skipped'));

    await enforceOnboardingRedirect();

    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('ⓑ-2 — completed 계정은 리다이렉트되지 않는다(0건)', async () => {
    mockFetchSenderProfile.mockResolvedValue(profileWith('completed'));

    await enforceOnboardingRedirect();

    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('인증 사용자가 없으면(방어적 no-op) 리다이렉트하지 않는다 — proxy가 이미 미인증을 /login으로 보냈다', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    await enforceOnboardingRedirect();

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockFetchSenderProfile).not.toHaveBeenCalled();
  });
});
