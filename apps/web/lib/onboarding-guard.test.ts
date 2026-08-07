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

const { mockGetUser, mockFetchSenderProfile, mockRedirect, mockCreateClient } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFetchSenderProfile: vi.fn(),
  mockRedirect: vi.fn(),
  mockCreateClient: vi.fn(),
}));

vi.mock('./supabase/server', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
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
    mockCreateClient.mockResolvedValue({ auth: { getUser: mockGetUser } });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  });

  /**
   * M-2(reviewer) — 이 함수는 URL/path 인자를 받지 않는다(설계상 URL-불가지론적: 호출부가
   * `(with-nav)` 그룹의 공유 레이아웃 하나뿐이라, 어떤 URL로 들어와도 같은 코드 경로를 탄다).
   * 과거 버전은 "ⓐ-1 /mediate"·"ⓐ-2 /profile"이라는 이름을 붙인 두 테스트가 실제로는 동일한
   * 함수 호출을 두 번 반복할 뿐이어서 "2개 URL에서 모두 리다이렉트된다"는 근거가 되지 못했다
   * (인자가 없으니 두 테스트가 서로 다른 URL을 exercise할 방법이 없었다). 정직한 근거는 두
   * 갈래로 나눈다: ① 이 함수 자체의 리다이렉트 동작은 여기 단일 테스트로 충분히 증명하고,
   * ② "모든 URL에 실제로 이 함수가 걸린다"는 주장(태스크 판정 조건 ⓐ)은 함수 단위 테스트가
   * 아니라 구조 단언으로 증명한다 —
   * `apps/web/app/(app)/(with-nav)/onboarding-guard-coverage.test.ts`: `(with-nav)` 하위 11개
   * 라우트 디렉터리 전부가 이 레이아웃 하나만 상속하고(각자 별도 layout.tsx로 이 레이아웃을
   * 건너뛸 방법이 없음) 그 레이아웃이 `enforceOnboardingRedirect()`를 호출한다는 것을 파일
   * 구조로 확인한다.
   */
  it('ⓐ — not_started 계정은 /onboarding으로 리다이렉트된다(정확히 1회) — URL별 커버리지 증거는 onboarding-guard-coverage.test.ts가 구조적으로 별도 증명한다', async () => {
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

  /**
   * M-1(reviewer) — 이 함수는 이제 `(with-nav)` 아래 **모든** 인증 화면 진입 시 실행된다. env
   * 누락(`createClient()`가 던짐)이나 일시적 DB 오류(`fetchSenderProfile()`이 던짐)가 이 함수를
   * 거쳐 레이아웃 렌더 전체를 깨뜨리면 안 된다(`app/(app)/` 아래 `error.tsx`가 없어 Next 기본
   * 에러 화면으로 전체 인증 셸이 죽는다). 온보딩 강제 리다이렉트는 인증 자체와 달리 보안 필수
   * 기능이 아니므로(리다이렉트가 안 걸려도 최악의 경우 개인화-꺼짐 표시가 대신 알린다,
   * `docs/UX.md:926` "Personalization-off indicator") **fail-open**을 택한다: 로그만 남기고
   * 리다이렉트 없이 사용자를 통과시킨다. fail-closed(레이아웃 자체를 에러로 막기)는 이 기능
   * 하나의 일시적 실패로 전체 인증 화면을 못 쓰게 만드는 대가가 더 크다고 판단했다.
   */
  it('M-1 — createClient()가 env 누락으로 던지면 로그만 남기고 fail-open(리다이렉트 없이 통과)한다', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockCreateClient.mockRejectedValue(
      new Error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY must both be set'),
    );

    await expect(enforceOnboardingRedirect()).resolves.toBeUndefined();

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('M-1 — fetchSenderProfile()이 PostgREST 에러를 던져도 로그만 남기고 fail-open(리다이렉트 없이 통과)한다', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetchSenderProfile.mockRejectedValue({
      code: '42P01',
      message: 'relation "profiles" does not exist',
    });

    await expect(enforceOnboardingRedirect()).resolves.toBeUndefined();

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('M-1 — redirect()가 던지는 NEXT_REDIRECT는 삼키지 않고 그대로 전파된다(catch가 redirect 호출을 감싸지 않는다는 증거)', async () => {
    mockFetchSenderProfile.mockResolvedValue(profileWith('not_started'));
    const redirectError = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;replace;/onboarding;307;',
    });
    mockRedirect.mockImplementation(() => {
      throw redirectError;
    });

    await expect(enforceOnboardingRedirect()).rejects.toBe(redirectError);
  });
});
