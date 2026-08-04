/**
 * Major 5 — `docs/UX.md` Information Architecture "Navigation": 로그아웃은 인증된 화면 중
 * 상시 내비게이션이 있는 화면(`(app)/(with-nav)` 라우트 그룹) 어디서나 보여야 한다.
 * `apps/web/app/layout.tsx`(루트, 미인증 화면도 포함) 대신 이 레이아웃이 `LogoutButton`을
 * 소유한다. Major 1(reviewer 5차) — onboarding(UX-003)은 이 그룹 밖의 형제이므로 이 레이아웃을
 * 상속하지 않는다(`apps/web/app/(app)/onboarding/route-composition.test.ts`).
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
const mockSignOut = vi.fn();
vi.mock('../../../lib/supabase/browser', () => ({
  createClient: () => ({ auth: { signOut: mockSignOut } }),
}));

import AppLayout from './layout';

describe('(app)/(with-nav)/layout — Major 5', () => {
  it('인증된 화면 레이아웃에는 로그아웃 버튼이 렌더된다', () => {
    render(
      <AppLayout>
        <p>child</p>
      </AppLayout>,
    );
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeTruthy();
  });

  it('children을 그대로 렌더한다', () => {
    render(
      <AppLayout>
        <p>child-content</p>
      </AppLayout>,
    );
    expect(screen.getByText('child-content')).toBeTruthy();
  });
});
