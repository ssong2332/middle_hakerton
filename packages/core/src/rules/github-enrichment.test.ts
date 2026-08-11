import { describe, expect, it } from 'vitest';
import { computeActivityHourHistogram, deriveActivityTimeCandidate, extractProfileFields } from './github-enrichment';

describe('extractProfileFields — AC-065⑤', () => {
  it('location/company를 그대로 추출한다', () => {
    expect(extractProfileFields({ location: 'Seoul, Korea', company: '@example' })).toEqual({
      location: 'Seoul, Korea',
      company: '@example',
    });
  });

  it('null/undefined는 null로 정규화한다(미등록)', () => {
    expect(extractProfileFields({ location: null, company: undefined })).toEqual({
      location: null,
      company: null,
    });
  });

  it('빈 문자열/공백뿐인 값도 null로 정규화한다', () => {
    expect(extractProfileFields({ location: '', company: '   ' })).toEqual({
      location: null,
      company: null,
    });
  });

  it('앞뒤 공백은 제거한다', () => {
    expect(extractProfileFields({ location: '  Seoul  ', company: null })).toEqual({
      location: 'Seoul',
      company: null,
    });
  });

  it('location·company 외의 필드는 애초에 타입에 없다(존재해도 결과에 섞이지 않는다)', () => {
    const withExtraFields = { location: 'Seoul', company: null, email: 'x@example.com', bio: 'hi' };
    expect(extractProfileFields(withExtraFields)).toEqual({ location: 'Seoul', company: null });
  });
});

function isoAt(hourUtc: number, index: number): string {
  // 2026-08-11 기준, 시간만 바꾸고 분/초는 index로 흩어 유일하게 만든다(중복 timestamp라도
  // 테스트 목적상 문제없지만 명확성을 위해).
  return `2026-08-11T${String(hourUtc).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}:00Z`;
}

describe('computeActivityHourHistogram — AC-071②/AC-072③', () => {
  it('표본이 임계값 미만이면 histogram은 null이지만 sampleCount는 실제 값을 담는다', () => {
    const timestamps = Array.from({ length: 5 }, (_, i) => isoAt(9, i));
    const result = computeActivityHourHistogram(timestamps, 30);
    expect(result).toEqual({ histogram: null, sampleCount: 5 });
  });

  it('표본이 0건이어도(비활성 계정) 에러 없이 sampleCount: 0을 반환한다', () => {
    expect(computeActivityHourHistogram([], 30)).toEqual({ histogram: null, sampleCount: 0 });
  });

  it('표본이 임계값 이상이면 24버킷 UTC 시간대 분포를 만든다', () => {
    const timestamps = [
      ...Array.from({ length: 20 }, (_, i) => isoAt(9, i)),
      ...Array.from({ length: 10 }, (_, i) => isoAt(14, i)),
    ];
    const result = computeActivityHourHistogram(timestamps, 30);
    expect(result.sampleCount).toBe(30);
    expect(result.histogram).not.toBeNull();
    expect(result.histogram![9]).toBe(20);
    expect(result.histogram![14]).toBe(10);
    expect(result.histogram!.reduce((a, b) => a + b, 0)).toBe(30);
    expect(result.histogram!.length).toBe(24);
  });

  it('임계값을 정확히 충족하면(경계값) histogram이 채워진다', () => {
    const timestamps = Array.from({ length: 30 }, (_, i) => isoAt(0, i));
    const result = computeActivityHourHistogram(timestamps, 30);
    expect(result.histogram).not.toBeNull();
  });

  it('임계값보다 1 적으면(경계값) histogram이 null이다', () => {
    const timestamps = Array.from({ length: 29 }, (_, i) => isoAt(0, i));
    const result = computeActivityHourHistogram(timestamps, 30);
    expect(result.histogram).toBeNull();
  });

  it('threshold를 생략하면 기본값(ACTIVITY_HOUR_SAMPLE_THRESHOLD=30)을 쓴다', () => {
    const timestamps = Array.from({ length: 30 }, (_, i) => isoAt(9, i));
    const result = computeActivityHourHistogram(timestamps);
    expect(result.histogram).not.toBeNull();
  });
});

describe('deriveActivityTimeCandidate — AC-071①③', () => {
  it('histogram이 null(표본 부족)이면 후보를 만들지 않는다', () => {
    expect(deriveActivityTimeCandidate(null)).toBeNull();
  });

  it('최빈 시간대를 UTC 범위 문구로 반환한다', () => {
    const histogram = new Array<number>(24).fill(0);
    histogram[9] = 20;
    histogram[14] = 10;
    expect(deriveActivityTimeCandidate(histogram)).toBe('UTC 09:00–10:00');
  });

  it('동률이면 더 이른 시(hour)를 택한다(결정적)', () => {
    const histogram = new Array<number>(24).fill(0);
    histogram[3] = 15;
    histogram[20] = 15;
    expect(deriveActivityTimeCandidate(histogram)).toBe('UTC 03:00–04:00');
  });

  it('23시가 최빈이면 다음 시간대는 자정으로 넘어간다(00:00)', () => {
    const histogram = new Array<number>(24).fill(0);
    histogram[23] = 5;
    expect(deriveActivityTimeCandidate(histogram)).toBe('UTC 23:00–00:00');
  });

  it('전부 0건이면(이론상 도달 불가하지만 방어적으로) null을 반환한다', () => {
    expect(deriveActivityTimeCandidate(new Array<number>(24).fill(0))).toBeNull();
  });
});
