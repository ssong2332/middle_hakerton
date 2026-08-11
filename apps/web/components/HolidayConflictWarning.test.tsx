/**
 * T54 — UX-004 HolidayConflict 상태. AC-048, AC-057②③, AC-063①②.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HolidayConflictWarning } from './HolidayConflictWarning';

describe('HolidayConflictWarning', () => {
  it('AC-063① — 빈 배열이면 아무것도 렌더하지 않는다(충돌 없음·데이터 없는 국가 둘 다 같은 표현)', () => {
    const { container } = render(<HolidayConflictWarning conflicts={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('AC-057② — 고정 문구 "이 마감일은 상대 국가 연휴 N일차입니다"를 그대로 보여준다', () => {
    render(
      <HolidayConflictWarning
        conflicts={[{ date: '2026-09-25T00:00:00Z', country: 'KR', holidayName: '추석', dayIndex: 2 }]}
      />,
    );

    expect(screen.getByText('이 마감일은 상대 국가 연휴 2일차입니다.')).toBeTruthy();
  });

  it('여러 충돌이 있으면 각각 별도 항목으로 보여준다', () => {
    render(
      <HolidayConflictWarning
        conflicts={[
          { date: '2026-09-25T00:00:00Z', country: 'KR', holidayName: '추석', dayIndex: 2 },
          { date: '2026-09-26T00:00:00Z', country: 'KR', holidayName: '추석', dayIndex: 3 },
        ]}
      />,
    );

    expect(screen.getByText('이 마감일은 상대 국가 연휴 2일차입니다.')).toBeTruthy();
    expect(screen.getByText('이 마감일은 상대 국가 연휴 3일차입니다.')).toBeTruthy();
  });

  it('onNegotiate가 있으면 "기한 재협상" 링크가 렌더되고 클릭 시 그 충돌의 날짜로 호출된다', () => {
    const onNegotiate = vi.fn();
    render(
      <HolidayConflictWarning
        conflicts={[{ date: '2026-09-25T00:00:00Z', country: 'KR', holidayName: '추석', dayIndex: 2 }]}
        onNegotiate={onNegotiate}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '기한 재협상' }));

    expect(onNegotiate).toHaveBeenCalledWith('2026-09-25T00:00:00Z');
  });

  it('onNegotiate가 없으면 링크를 렌더하지 않는다', () => {
    render(
      <HolidayConflictWarning
        conflicts={[{ date: '2026-09-25T00:00:00Z', country: 'KR', holidayName: '추석', dayIndex: 2 }]}
      />,
    );

    expect(screen.queryByRole('button', { name: '기한 재협상' })).toBeNull();
  });

  it('국가명·공휴일명을 화면 문구에 노출하지 않는다', () => {
    render(
      <HolidayConflictWarning
        conflicts={[{ date: '2026-09-25T00:00:00Z', country: 'KR', holidayName: '추석', dayIndex: 2 }]}
      />,
    );

    expect(screen.queryByText(/추석/)).toBeNull();
    expect(screen.queryByText(/한국|KR/)).toBeNull();
  });
});
