/**
 * T73③ 상시 내비게이션 바 — `docs/UX.md:893` 목록 그대로, 목록 밖 추가 0건(AC-084⑤).
 * T73④ AC-084⑥ — 아직 구현되지 않은 화면(Mediate/Profile/Terminology/Decisions 외 전부,
 * `docs/Tasks.md` T31/T41/T42/T52/T72/Feedback 담당 태스크가 모두 `todo`)의 항목은 렌더하지
 * 않는다(비활성/빈/404 링크 금지 — disabled 속성이 아니라 미렌더).
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../lib/supabase/browser', () => ({
  createClient: () => ({ auth: { signOut: vi.fn() } }),
}));

import { vi } from 'vitest';
import { PrimaryNav } from './PrimaryNav';

/** `docs/UX.md:893`가 정한 항목 전체 집합(라벨→href) — 이 밖의 항목이 렌더되면 AC-084⑤ 위반. */
const ALLOWED_ITEMS: Record<string, string> = {
  Mediate: '/mediate',
  Profile: '/profile',
  Terminology: '/terminology',
  'Pair Protocols': '/pair-protocols',
  'Meeting Times': '/meeting-times',
  Decisions: '/decisions',
  Feedback: '/feedback',
  '발송 내역': '/sent-messages',
  '관측 표본': '/observation-samples',
};

describe('PrimaryNav — T73③/④', () => {
  it('구현된 화면(Mediate/Profile/Terminology/Decisions)은 렌더된다', () => {
    render(<PrimaryNav />);
    expect(screen.getByRole('link', { name: 'Mediate' }).getAttribute('href')).toBe('/mediate');
    expect(screen.getByRole('link', { name: 'Profile' }).getAttribute('href')).toBe('/profile');
    expect(screen.getByRole('link', { name: 'Terminology' }).getAttribute('href')).toBe(
      '/terminology',
    );
    expect(screen.getByRole('link', { name: 'Decisions' }).getAttribute('href')).toBe(
      '/decisions',
    );
  });

  it('아직 구현되지 않은 화면(Pair Protocols/Meeting Times/Feedback/발송 내역/관측 표본)은 렌더되지 않는다 — AC-084⑥', () => {
    render(<PrimaryNav />);
    for (const label of [
      'Pair Protocols',
      'Meeting Times',
      'Feedback',
      '발송 내역',
      '관측 표본',
    ]) {
      expect(screen.queryByRole('link', { name: label })).toBeNull();
    }
  });

  it('로그아웃 버튼이 렌더된다', () => {
    render(<PrimaryNav />);
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeTruthy();
  });

  it('렌더된 모든 링크는 docs/UX.md:893 목록 밖 항목을 추가하지 않는다 — AC-084⑤', () => {
    render(<PrimaryNav />);
    const links = screen.getAllByRole('link');
    for (const link of links) {
      const label = link.textContent;
      expect(label).not.toBeNull();
      expect(ALLOWED_ITEMS[label as string]).toBe(link.getAttribute('href'));
    }
  });
});
