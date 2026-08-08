// T58 — 프라이버시 고지 화면(UX-017). "읽고 닫기"만 있고 동의/거부 선택은 없다
// (Planning Decision #81 — 동의 저장·철회 UI 미구현).
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PrivacyNotice } from './PrivacyNotice';
import { NOTICE_ITEMS } from './notice';

describe('PrivacyNotice', () => {
  it('renders every notice item as text', () => {
    render(<PrivacyNotice onAcknowledge={() => {}} />);
    for (const item of NOTICE_ITEMS) {
      expect(screen.getByText(item)).toBeTruthy();
    }
  });

  it('renders as a labeled dialog (accessibility)', () => {
    render(<PrivacyNotice onAcknowledge={() => {}} />);
    expect(screen.getByRole('dialog', { name: '프라이버시 고지' })).toBeTruthy();
  });

  it('moves focus into the notice on mount', () => {
    render(<PrivacyNotice onAcknowledge={() => {}} />);
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('calls onAcknowledge when the close/confirm button is clicked', () => {
    const onAcknowledge = vi.fn();
    render(<PrivacyNotice onAcknowledge={onAcknowledge} />);

    fireEvent.click(screen.getByRole('button', { name: '확인했습니다' }));

    expect(onAcknowledge).toHaveBeenCalledTimes(1);
  });

  it('calls onAcknowledge on Escape (keyboard-dismissible)', () => {
    const onAcknowledge = vi.fn();
    render(<PrivacyNotice onAcknowledge={onAcknowledge} />);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(onAcknowledge).toHaveBeenCalledTimes(1);
  });

  // 확인/거부 두 갈래가 없다 — "읽고 닫기"뿐이다(UX.md UX-017 Exit).
  it('offers no accept/decline choice — only one action button exists', () => {
    render(<PrivacyNotice onAcknowledge={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
