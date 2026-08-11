// `business-days.ts` 회귀 검증 — AC-044②, AC-063①. `docs/Tasks.md` T51.
import { describe, expect, it } from 'vitest';
import { businessDaysElapsed, isReminderSuggested } from './business-days';

describe('businessDaysElapsed — AC-044②', () => {
  it('발송 당일이면(같은 로컬 날짜) 0을 반환한다', () => {
    // 2026-03-16(월) 10:00 서울 발송, 같은 날 14:00 조회
    const result = businessDaysElapsed(
      '2026-03-16T01:00:00Z',
      new Date('2026-03-16T05:00:00Z'),
      'Asia/Seoul',
      'KR',
    );
    expect(result).toBe(0);
  });

  it('다음날(평일)이면 1을 반환한다', () => {
    const result = businessDaysElapsed(
      '2026-03-16T01:00:00Z',
      new Date('2026-03-17T05:00:00Z'),
      'Asia/Seoul',
      'KR',
    );
    expect(result).toBe(1);
  });

  it('주말은 경과일에서 제외한다', () => {
    // 2026-03-13(금) 발송 → 03-14(토)·03-15(일) 제외 → 03-16(월) 1일만 카운트
    const result = businessDaysElapsed(
      '2026-03-13T01:00:00Z',
      new Date('2026-03-16T01:00:00Z'),
      'Asia/Seoul',
      'KR',
    );
    expect(result).toBe(1);
  });

  it('country가 있으면 그 국가 공휴일도 제외한다', () => {
    // 2026-10-08(목) 발송 → 10-09(금,한글날 KR 공휴일)·10-10(토)·10-11(일) 제외 → 10-12(월) 1일
    const result = businessDaysElapsed(
      '2026-10-08T01:00:00Z',
      new Date('2026-10-12T01:00:00Z'),
      'Asia/Seoul',
      'KR',
    );
    expect(result).toBe(1);
  });

  it('country가 null이면 공휴일 제외 없이 주말만 제외한다(AC-063①)', () => {
    // 같은 구간, country만 null — 10-09(금)은 이제 카운트된다 → 10-09, 10-12 총 2일
    const result = businessDaysElapsed(
      '2026-10-08T01:00:00Z',
      new Date('2026-10-12T01:00:00Z'),
      'Asia/Seoul',
      null,
    );
    expect(result).toBe(2);
  });

  it('timezone이 null이면 UTC로 계산한다(수신자 타임존 미상 방어)', () => {
    const result = businessDaysElapsed(
      '2026-03-16T01:00:00Z',
      new Date('2026-03-17T01:00:00Z'),
      null,
      null,
    );
    expect(result).toBe(1);
  });
});

describe('isReminderSuggested — AC-044② 임계값(Planning Decision #60)', () => {
  it('업무일 1일이면 제안하지 않는다', () => {
    expect(isReminderSuggested(1)).toBe(false);
  });

  it('업무일 2일이면 제안한다', () => {
    expect(isReminderSuggested(2)).toBe(true);
  });

  it('업무일 3일이면 제안한다', () => {
    expect(isReminderSuggested(3)).toBe(true);
  });

  it('업무일 0일이면 제안하지 않는다', () => {
    expect(isReminderSuggested(0)).toBe(false);
  });
});
