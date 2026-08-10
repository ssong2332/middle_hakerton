// `deadline-negotiation.ts` 회귀 검증 — AC-036abc. `docs/Tasks.md` T39.
//
// 🔴 판정 기준(2026-08-10 reviewer 재검토로 확정): 마감이 근무 시작 시각 이후 + 공휴일이
// 아니면 feasible이다 — 근무 종료 이후 마감은 하루 전체를 쓸 수 있어 문제가 아니다. infeasible은
// ① 근무 시작 전 ② 공휴일, 이 둘뿐이다(`deadline-negotiation.ts` 함수 주석 참조).
import { describe, expect, it } from 'vitest';
import { checkDeadlineFeasibility, type DeadlineRecipient } from './deadline-negotiation';

const SEOUL_9_TO_6: DeadlineRecipient = {
  timezone: 'Asia/Seoul',
  workStart: '09:00',
  workEnd: '18:00',
  country: 'KR',
};

describe('checkDeadlineFeasibility — AC-036a 실현 가능 판정', () => {
  it('근무 시작 이후 + 공휴일 아님 → feasible true, counterOffers 없음', () => {
    // 2026-03-16(월) 10:00 서울 = UTC 01:00
    const result = checkDeadlineFeasibility('2026-03-16T01:00:00Z', SEOUL_9_TO_6);
    expect(result.feasible).toBe(true);
    expect(result.counterOffers).toEqual([]);
  });

  it('근무 종료 이후여도 feasible이다 — 하루 전체를 쓸 수 있었으므로 문제가 아니다', () => {
    // 2026-03-16(월) 20:00 서울 = UTC 11:00 — 근무종료(18:00) 이후지만 근무시작(09:00) 이후
    const result = checkDeadlineFeasibility('2026-03-16T11:00:00Z', SEOUL_9_TO_6);
    expect(result.feasible).toBe(true);
    expect(result.counterOffers).toEqual([]);
  });

  it('근무 시작 전(공휴일 아님) → infeasible, 사유에 근무 시작이 언급된다', () => {
    // 2026-03-16(월) 07:00 서울 = UTC(전날) 22:00 — 근무시작(09:00) 이전
    const result = checkDeadlineFeasibility('2026-03-15T22:00:00Z', SEOUL_9_TO_6);
    expect(result.feasible).toBe(false);
    expect(result.reason).toContain('근무 시작');
  });

  it('수신자 국가 공휴일과 겹침 → infeasible, 사유에 공휴일이 언급된다', () => {
    // 2026-02-17(설날) 10:00 서울 = UTC 01:00 — 근무시작 이후이지만 공휴일
    const result = checkDeadlineFeasibility('2026-02-17T01:00:00Z', SEOUL_9_TO_6);
    expect(result.feasible).toBe(false);
    expect(result.reason).toContain('공휴일');
  });
});

describe('checkDeadlineFeasibility — AC-036b 대체 기한 역제안', () => {
  it('불가능하면 최소 1개의 대체 기한을 반환한다', () => {
    const result = checkDeadlineFeasibility('2026-03-15T22:00:00Z', SEOUL_9_TO_6);
    expect(result.counterOffers.length).toBeGreaterThanOrEqual(1);
  });

  it('근무 시작 전(같은 날, 공휴일 아님) 위반이면 첫 대체 기한은 같은 날 근무 시작 시각이다', () => {
    const result = checkDeadlineFeasibility('2026-03-15T22:00:00Z', SEOUL_9_TO_6);
    // 2026-03-16(월) 09:00 서울 = UTC 00:00
    expect(result.counterOffers[0].date).toBe('2026-03-16T00:00:00.000Z');
  });

  it('연휴(설날 3일)에 걸리면 대체 기한은 연휴가 끝난 다음날부터 제시된다', () => {
    const result = checkDeadlineFeasibility('2026-02-17T01:00:00Z', SEOUL_9_TO_6);
    // 설날 연휴 2026-02-16~18, 다음 근무일 02-19(목) 09:00 서울 = UTC 00:00
    expect(result.counterOffers[0].date).toBe('2026-02-19T00:00:00.000Z');
  });

  it('대체 기한은 최대 3개이며 날짜 오름차순이다', () => {
    const result = checkDeadlineFeasibility('2026-02-17T01:00:00Z', SEOUL_9_TO_6);
    expect(result.counterOffers.length).toBeLessThanOrEqual(3);
    const dates = result.counterOffers.map((o) => o.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it('country가 null이면 공휴일 배제 없이 근무 시작 시각만으로 판정한다', () => {
    const noCountry: DeadlineRecipient = { ...SEOUL_9_TO_6, country: null };
    // 설날 당일이지만 country가 없으므로 공휴일로 취급하지 않는다 — 근무시작 이후라 feasible
    const result = checkDeadlineFeasibility('2026-02-17T01:00:00Z', noCountry);
    expect(result.feasible).toBe(true);
  });
});

describe('checkDeadlineFeasibility — AC-036c 자동 변경 금지', () => {
  it('infeasible이어도 neededBy 자체를 대체값으로 바꿔치기하지 않는다 — 제안만 반환한다', () => {
    const result = checkDeadlineFeasibility('2026-03-15T22:00:00Z', SEOUL_9_TO_6);
    expect(result).not.toHaveProperty('confirmedDeadline');
    expect(result).not.toHaveProperty('neededBy');
    expect(result.counterOffers.every((o) => 'date' in o && 'rationale' in o)).toBe(true);
  });
});
