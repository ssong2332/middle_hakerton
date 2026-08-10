// `feedback-summary.ts` 회귀 검증 — AC-025(응답 시간 부분), AC-070①②③. `docs/Tasks.md` T33.
import { describe, expect, it } from 'vitest';
import { summarizeFeedback, type RepliedMessageRecord } from './feedback-summary';

function record(
  id: string,
  sentAt: string,
  repliedMarkedAt: string,
  mediationApplied: boolean,
): RepliedMessageRecord {
  return { id, sentAt, repliedMarkedAt, mediationApplied };
}

describe('summarizeFeedback — AC-070① 응답 소요 시간 계산 + 중재 전/후 비교', () => {
  it('빈 배열이면 두 그룹 모두 count 0, medianHours는 null이다(표본 0을 0으로 채우지 않는다)', () => {
    const result = summarizeFeedback([]);
    expect(result.withMediation).toEqual({ count: 0, medianHours: null });
    expect(result.withoutMediation).toEqual({ count: 0, medianHours: null });
    expect(result.items).toEqual([]);
  });

  it('elapsedHours를 sentAt~repliedMarkedAt 차이(시간)로 계산한다', () => {
    const result = summarizeFeedback([
      record('msg-1', '2026-08-10T00:00:00Z', '2026-08-10T02:00:00Z', true),
    ]);
    expect(result.items[0].elapsedHours).toBe(2);
  });

  it('소수 시간은 둘째 자리로 반올림한다', () => {
    // 37분 = 0.61666...시간 → 0.62
    const result = summarizeFeedback([
      record('msg-1', '2026-08-10T00:00:00Z', '2026-08-10T00:37:00Z', true),
    ]);
    expect(result.items[0].elapsedHours).toBe(0.62);
  });

  it('mediationApplied로 그룹을 나누고 각각 count·중앙값(짝수 개수)을 계산한다', () => {
    const result = summarizeFeedback([
      record('m1', '2026-08-10T00:00:00Z', '2026-08-10T02:00:00Z', true), // 2h
      record('m2', '2026-08-10T00:00:00Z', '2026-08-10T06:00:00Z', true), // 6h
      record('m3', '2026-08-10T00:00:00Z', '2026-08-10T10:00:00Z', false), // 10h
      record('m4', '2026-08-10T00:00:00Z', '2026-08-10T20:00:00Z', false), // 20h
    ]);

    expect(result.withMediation).toEqual({ count: 2, medianHours: 4 });
    expect(result.withoutMediation).toEqual({ count: 2, medianHours: 15 });
    expect(result.items).toHaveLength(4);
  });

  it('홀수 개수 그룹의 중앙값은 가운데 값이다', () => {
    const result = summarizeFeedback([
      record('m1', '2026-08-10T00:00:00Z', '2026-08-10T02:00:00Z', true), // 2h
      record('m2', '2026-08-10T00:00:00Z', '2026-08-10T04:00:00Z', true), // 4h
      record('m3', '2026-08-10T00:00:00Z', '2026-08-10T06:00:00Z', true), // 6h
    ]);

    expect(result.withMediation).toEqual({ count: 3, medianHours: 4 });
  });

  it('한쪽 그룹이 비어 있으면 그 그룹만 medianHours null, count 0이다', () => {
    const result = summarizeFeedback([
      record('m1', '2026-08-10T00:00:00Z', '2026-08-10T03:00:00Z', true),
    ]);

    expect(result.withMediation).toEqual({ count: 1, medianHours: 3 });
    expect(result.withoutMediation).toEqual({ count: 0, medianHours: null });
  });

  it('items에는 messageId·sentAt·repliedMarkedAt·mediationApplied가 원본 그대로 담긴다', () => {
    const result = summarizeFeedback([
      record('msg-42', '2026-08-10T00:00:00Z', '2026-08-10T01:00:00Z', false),
    ]);

    expect(result.items[0]).toEqual({
      messageId: 'msg-42',
      sentAt: '2026-08-10T00:00:00Z',
      repliedMarkedAt: '2026-08-10T01:00:00Z',
      elapsedHours: 1,
      mediationApplied: false,
    });
  });
});
