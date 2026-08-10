// `holiday-conflict.ts` 회귀 검증 — AC-048②③④, AC-057①②, AC-063①②. `docs/Tasks.md` T53.
import { describe, expect, it } from 'vitest';
import { hasHolidayData, holidayConflictsForDate, isHolidayDate } from './holiday-conflict';

describe('holidayConflictsForDate — AC-048/AC-057', () => {
  it('음력 설날(한국)에 걸리면 충돌 1건 + dayIndex를 반환한다', () => {
    expect(holidayConflictsForDate('2026-02-17', 'KR')).toEqual([
      { date: '2026-02-17', country: 'KR', holidayName: '설날', dayIndex: 2 },
    ]);
  });

  it('설날 연휴 3일 전체가 연속 dayIndex(1,2,3)를 갖는다', () => {
    expect(holidayConflictsForDate('2026-02-16', 'KR')[0].dayIndex).toBe(1);
    expect(holidayConflictsForDate('2026-02-17', 'KR')[0].dayIndex).toBe(2);
    expect(holidayConflictsForDate('2026-02-18', 'KR')[0].dayIndex).toBe(3);
  });

  it('추석(한국)에 걸리면 충돌을 반환한다', () => {
    expect(holidayConflictsForDate('2026-09-25', 'KR')).toEqual([
      { date: '2026-09-25', country: 'KR', holidayName: '추석', dayIndex: 2 },
    ]);
  });

  it('춘절(중국)에 걸리면 연휴 N일차를 반환한다 — 9일 연휴 중 5일차', () => {
    expect(holidayConflictsForDate('2026-02-19', 'CN')).toEqual([
      { date: '2026-02-19', country: 'CN', holidayName: '春节', dayIndex: 5 },
    ]);
  });

  it('서구 크리스마스~신년 케이스 — 미국 크리스마스에 걸리면 충돌을 반환한다', () => {
    expect(holidayConflictsForDate('2026-12-25', 'US')).toEqual([
      { date: '2026-12-25', country: 'US', holidayName: 'Christmas Day', dayIndex: 1 },
    ]);
  });

  it('서구 크리스마스~신년 케이스 — 미국 신정에 걸리면 충돌을 반환한다', () => {
    expect(holidayConflictsForDate('2026-01-01', 'US')).toEqual([
      { date: '2026-01-01', country: 'US', holidayName: "New Year's Day", dayIndex: 1 },
    ]);
  });

  it('일본 골든위크 — 연속 4일 연휴에서 dayIndex가 1~4로 이어진다', () => {
    expect(holidayConflictsForDate('2026-05-03', 'JP')[0].dayIndex).toBe(1);
    expect(holidayConflictsForDate('2026-05-04', 'JP')[0].dayIndex).toBe(2);
    expect(holidayConflictsForDate('2026-05-05', 'JP')[0].dayIndex).toBe(3);
    expect(holidayConflictsForDate('2026-05-06', 'JP')[0].dayIndex).toBe(4);
  });

  it('공휴일이 아닌 평범한 날짜는 빈 배열을 반환한다', () => {
    expect(holidayConflictsForDate('2026-03-15', 'KR')).toEqual([]);
  });

  it('AC-063① — country가 null이면(데이터 없음/미상) 빈 배열을 반환하고 예외를 던지지 않는다', () => {
    expect(holidayConflictsForDate('2026-01-01', null)).toEqual([]);
  });
});

describe('isHolidayDate — T39 역제안 날짜 제외용 축약형', () => {
  it('공휴일이면 true', () => {
    expect(isHolidayDate('2026-08-15', 'KR')).toBe(true);
  });

  it('공휴일이 아니면 false', () => {
    expect(isHolidayDate('2026-08-16', 'KR')).toBe(false);
  });

  it('country가 null이면 false(억지 충돌 금지)', () => {
    expect(isHolidayDate('2026-08-15', null)).toBe(false);
  });
});

describe('hasHolidayData — AC-063② 내부 구분(화면에는 노출하지 않는다)', () => {
  it('4개국은 전부 데이터가 있다', () => {
    expect(hasHolidayData('KR')).toBe(true);
    expect(hasHolidayData('US')).toBe(true);
    expect(hasHolidayData('JP')).toBe(true);
    expect(hasHolidayData('CN')).toBe(true);
  });

  it('null은 데이터가 있는 것으로 취급하지 않는다', () => {
    expect(hasHolidayData(null)).toBe(false);
  });
});
