/**
 * T73③ 상시 내비게이션 바 — `docs/UX.md:893` 목록 그대로, 목록 밖 추가 0건(AC-084⑤).
 * T73④ AC-084⑥ — 아직 구현되지 않은 화면(Pair Protocols/Meeting Times/Feedback, `docs/Tasks.md`
 * T31/Feedback 담당 태스크 미완료 — Pair Protocols는 T41/T42가 `done`인데도 이 파일이 여전히
 * `implemented: false`로 두고 있다는 stale 발견이 `PrimaryNav.tsx` 헤더 주석에 남아 있다,
 * T72 각주)의 항목은 렌더하지 않는다(비활성/빈/404 링크 금지 — disabled 속성이 아니라 미렌더).
 * T52(2026-08-11) — 발송 내역(UX-015)이 구현 완료돼 이 목록으로 옮겨졌다.
 * T72(2026-08-11) — 관측 표본(UX-019)이 구현 완료돼 이 목록으로 옮겨졌다.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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
  it('구현된 화면(Mediate/Profile/Terminology/Decisions/발송 내역/관측 표본)은 렌더된다', () => {
    render(<PrimaryNav />);
    expect(screen.getByRole('link', { name: 'Mediate' }).getAttribute('href')).toBe('/mediate');
    expect(screen.getByRole('link', { name: 'Profile' }).getAttribute('href')).toBe('/profile');
    expect(screen.getByRole('link', { name: 'Terminology' }).getAttribute('href')).toBe(
      '/terminology',
    );
    expect(screen.getByRole('link', { name: 'Decisions' }).getAttribute('href')).toBe(
      '/decisions',
    );
    expect(screen.getByRole('link', { name: '발송 내역' }).getAttribute('href')).toBe(
      '/sent-messages',
    );
    expect(screen.getByRole('link', { name: '관측 표본' }).getAttribute('href')).toBe(
      '/observation-samples',
    );
  });

  it('아직 구현되지 않은 화면(Pair Protocols/Meeting Times/Feedback)은 렌더되지 않는다 — AC-084⑥', () => {
    render(<PrimaryNav />);
    for (const label of ['Pair Protocols', 'Meeting Times', 'Feedback']) {
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

describe('PrimaryNav — T77 모바일 내비 접기 (docs/UX.md v6.8)', () => {
  it('트리거는 접힌 상태(aria-expanded=false)로 시작한다', () => {
    render(<PrimaryNav />);
    const trigger = screen.getByRole('button', { name: /메뉴/ });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('트리거를 누르면 aria-expanded가 true가 되고, 다시 누르면 false로 돌아간다', () => {
    render(<PrimaryNav />);
    const trigger = screen.getByRole('button', { name: /메뉴/ });

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('열리면 목록의 첫 링크로 포커스가 이동한다', () => {
    render(<PrimaryNav />);
    fireEvent.click(screen.getByRole('button', { name: /메뉴/ }));

    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Mediate' }));
  });

  it('Escape를 누르면 닫히고 트리거로 포커스가 복귀한다 — UX.md v6.8 close/focus-return 관례', () => {
    render(<PrimaryNav />);
    const trigger = screen.getByRole('button', { name: /메뉴/ });
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    fireEvent.keyDown(screen.getByRole('navigation'), { key: 'Escape' });

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('항목을 클릭하면 메뉴가 닫힌다', () => {
    render(<PrimaryNav />);
    const trigger = screen.getByRole('button', { name: /메뉴/ });
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(screen.getByRole('link', { name: 'Mediate' }));

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('메뉴 바깥을 클릭하면 닫힌다', () => {
    render(<PrimaryNav />);
    fireEvent.click(screen.getByRole('button', { name: /메뉴/ }));
    const trigger = screen.getByRole('button', { name: /메뉴/ });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    fireEvent.mouseDown(document.body);

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('접기 대상은 docs/UX.md:893 목록과 동일하다 — 죽은 링크·새 항목을 추가하지 않는다', () => {
    render(<PrimaryNav />);
    fireEvent.click(screen.getByRole('button', { name: /메뉴/ }));
    const links = screen.getAllByRole('link');
    for (const link of links) {
      const label = link.textContent;
      expect(ALLOWED_ITEMS[label as string]).toBe(link.getAttribute('href'));
    }
  });
});
