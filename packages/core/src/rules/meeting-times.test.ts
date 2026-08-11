/**
 * R2 최적 회의 시간 추천 — AC-023. `docs/API.md` "POST /api/meeting-times" 계약 그대로:
 * 겹침 최대 3개, 없으면 빈 배열.
 */
import { describe, expect, it } from 'vitest';
import { findMeetingCandidates } from './meeting-times';

describe('findMeetingCandidates — AC-023', () => {
  it('같은 타임존, 근무시간이 겹치면 그 겹침 구간을 반환한다', () => {
    const candidates = findMeetingCandidates(
      { timezone: 'Asia/Seoul', workStart: '09:00', workEnd: '18:00' },
      { timezone: 'Asia/Seoul', workStart: '14:00', workEnd: '20:00' },
      { from: '2026-08-12', to: '2026-08-12' },
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0].senderLocal).toBe('2026-08-12 14:00');
    expect(candidates[0].recipientLocal).toBe('2026-08-12 14:00');
  });

  it('서울(오전 근무)·LA(저녁 근무)처럼 겹치지 않으면 빈 배열을 반환한다(억지 후보 금지)', () => {
    const candidates = findMeetingCandidates(
      { timezone: 'Asia/Seoul', workStart: '09:00', workEnd: '12:00' },
      { timezone: 'America/Los_Angeles', workStart: '09:00', workEnd: '12:00' },
      { from: '2026-08-12', to: '2026-08-12' },
    );

    expect(candidates).toEqual([]);
  });

  it('타임존이 달라도 실제로 겹치는 시간대(서울 오전 vs LA 저녁 근무)는 찾는다', () => {
    // 서울 09:00~18:00 KST(UTC+9) = UTC 00:00~09:00.
    // LA(America/Los_Angeles, 8월은 PDT UTC-7) 근무시간을 05:00~14:00으로 두면
    // UTC 12:00~21:00 — 그대로는 안 겹친다. LA를 야간 근무(16:00~23:00 PDT = UTC 23:00~06:00)로
    // 두면 서울 00:00~09:00 UTC와 00:00~06:00 구간에서 겹친다.
    const candidates = findMeetingCandidates(
      { timezone: 'Asia/Seoul', workStart: '09:00', workEnd: '18:00' },
      { timezone: 'America/Los_Angeles', workStart: '16:00', workEnd: '23:00' },
      { from: '2026-08-12', to: '2026-08-12' },
    );

    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      expect(new Date(candidate.startUtc).getTime()).toBeLessThan(new Date(candidate.endUtc).getTime());
    }
  });

  it('최대 3개까지만 반환한다', () => {
    const candidates = findMeetingCandidates(
      { timezone: 'Asia/Seoul', workStart: '09:00', workEnd: '18:00' },
      { timezone: 'Asia/Seoul', workStart: '09:00', workEnd: '18:00' },
      { from: '2026-08-10', to: '2026-08-20' },
    );

    expect(candidates.length).toBeLessThanOrEqual(3);
    expect(candidates.length).toBeGreaterThan(0);
  });

  it('workEnd가 workStart보다 이르거나 같은 잘못된 창은 건너뛴다', () => {
    const candidates = findMeetingCandidates(
      { timezone: 'Asia/Seoul', workStart: '18:00', workEnd: '09:00' },
      { timezone: 'Asia/Seoul', workStart: '09:00', workEnd: '18:00' },
      { from: '2026-08-12', to: '2026-08-12' },
    );

    expect(candidates).toEqual([]);
  });

  it('겹침 구간의 시작·끝은 두 근무 창의 교집합이다(더 늦게 시작, 더 일찍 끝)', () => {
    const candidates = findMeetingCandidates(
      { timezone: 'Asia/Seoul', workStart: '09:00', workEnd: '12:00' },
      { timezone: 'Asia/Seoul', workStart: '10:00', workEnd: '15:00' },
      { from: '2026-08-12', to: '2026-08-12' },
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0].senderLocal).toBe('2026-08-12 10:00');
  });
});
