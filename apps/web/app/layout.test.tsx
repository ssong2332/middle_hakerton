/**
 * Major 5 — `docs/UX.md` Information Architecture "Navigation": 상시 내비게이션(Log out 포함)은
 * "every authenticated screen"에만 있다. 루트 레이아웃(모든 화면, 미인증 UX-001/UX-002 포함)에
 * `LogoutButton`이 남아 있으면 위반이다. `LogoutButton`은 `apps/web/app/(app)/layout.tsx`로 옮긴다.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../lib/supabase/browser', () => ({
  createClient: () => ({ auth: { signOut: vi.fn() } }),
}));

import RootLayout from './layout';

describe('RootLayout — Major 5', () => {
  it('미인증 화면(UX-001/UX-002)에도 걸리는 루트 레이아웃에는 로그아웃 버튼을 렌더하지 않는다', () => {
    render(
      <RootLayout>
        <p>child</p>
      </RootLayout>,
    );
    expect(screen.queryByRole('button', { name: '로그아웃' })).toBeNull();
  });
});
