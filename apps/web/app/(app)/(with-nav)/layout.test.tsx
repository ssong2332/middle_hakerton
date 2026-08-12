/**
 * Major 5 — `docs/UX.md` Information Architecture "Navigation": 상시 내비게이션(로그아웃 포함)은
 * "UX-003(onboarding) 제외 전 인증 화면"에서만 보인다. Major 1(reviewer 5차) — onboarding(UX-003)은
 * 이 그룹 밖의 형제이므로 이 레이아웃을 상속하지 않는다
 * (`apps/web/app/(app)/onboarding/route-composition.test.ts`).
 *
 * T73③/④ — `AppLayout`은 이제 async Server Component다(`enforceOnboardingRedirect()` 호출 +
 * `PrimaryNav` 렌더). React Testing Library는 async Server Component를 JSX로 직접 렌더할 수 없으므로
 * (`apps/web/app/page.test.tsx`가 `RootPage()`를 함수로 직접 호출하는 것과 같은 패턴) 여기서도
 * `AppLayout({ children })`을 함수로 직접 호출해 반환된 엘리먼트를 `render()`한다.
 * `enforceOnboardingRedirect`는 이 파일의 관심사가 아니므로(전용 테스트는
 * `apps/web/lib/onboarding-guard.test.ts`) no-op으로 모킹한다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
const mockSignOut = vi.fn();
vi.mock('../../../lib/supabase/browser', () => ({
  createClient: () => ({ auth: { signOut: mockSignOut } }),
}));
const mockEnforceOnboardingRedirect = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../lib/onboarding-guard', () => ({
  enforceOnboardingRedirect: () => mockEnforceOnboardingRedirect(),
}));

import AppLayout from './layout';

describe('(app)/(with-nav)/layout — Major 5 / T73③④', () => {
  afterEach(() => {
    mockEnforceOnboardingRedirect.mockClear();
  });

  it('인증된 화면 레이아웃에는 로그아웃 버튼이 렌더된다', async () => {
    const element = await AppLayout({ children: <p>child</p> });
    render(element);
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeTruthy();
  });

  it('children을 그대로 렌더한다', async () => {
    const element = await AppLayout({ children: <p>child-content</p> });
    render(element);
    expect(screen.getByText('child-content')).toBeTruthy();
  });

  it('T73④ — 렌더 전에 enforceOnboardingRedirect()를 호출한다(온보딩 미완료 강제 리다이렉트 배선)', async () => {
    await AppLayout({ children: <p>child</p> });
    expect(mockEnforceOnboardingRedirect).toHaveBeenCalledTimes(1);
  });

  it('T73③ — 중재 내비게이션 링크가 렌더된다(PrimaryNav 배선)', async () => {
    const element = await AppLayout({ children: <p>child</p> });
    render(element);
    expect(screen.getByRole('link', { name: '중재' })).toBeTruthy();
  });
});
