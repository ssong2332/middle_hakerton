/**
 * 루트 `/` — T73②. `docs/UX.md:892` "Authenticated: `/` 또는 `/mediate`(UX-004, 기본 랜딩)".
 * UX-004 화면 자체는 `/mediate`에만 두고(중복 방지), 루트는 서버 리다이렉트만 한다.
 */
import { describe, expect, it, vi } from 'vitest';

const mockRedirect = vi.fn();
vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}));

describe('RootPage (/)', () => {
  it('/mediate로 리다이렉트한다', async () => {
    const { default: RootPage } = await import('./page');
    RootPage();
    expect(mockRedirect).toHaveBeenCalledWith('/mediate');
  });
});
