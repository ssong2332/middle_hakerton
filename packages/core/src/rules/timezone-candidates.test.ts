import { describe, expect, it } from 'vitest';
import { deriveTimezoneCandidates } from './timezone-candidates';

describe('deriveTimezoneCandidates — AC-065④', () => {
  it('알려진 도시명을 대소문자 무시로 매칭한다', () => {
    expect(deriveTimezoneCandidates('Seoul, South Korea')).toEqual(['Asia/Seoul']);
    expect(deriveTimezoneCandidates('TOKYO')).toEqual(['Asia/Tokyo']);
    expect(deriveTimezoneCandidates('based in san francisco')).toEqual(['America/Los_Angeles']);
  });

  it('매칭되는 키워드가 없으면 빈 배열이다(지어내지 않는다)', () => {
    expect(deriveTimezoneCandidates('Somewhere Unknown')).toEqual([]);
    expect(deriveTimezoneCandidates('asdkfjasldkfj')).toEqual([]);
  });

  it('null이거나 빈 문자열이면 빈 배열이다', () => {
    expect(deriveTimezoneCandidates(null)).toEqual([]);
    expect(deriveTimezoneCandidates('')).toEqual([]);
    expect(deriveTimezoneCandidates('   ')).toEqual([]);
  });

  it('같은 타임존으로 매칭되는 키워드가 여러 개여도 중복 없이 1개만 반환한다', () => {
    expect(deriveTimezoneCandidates('Seoul, Korea')).toEqual(['Asia/Seoul']);
  });

  it('서로 다른 타임존 키워드가 섞이면 둘 다 후보로 반환한다', () => {
    const result = deriveTimezoneCandidates('Seoul / Tokyo (remote)');
    expect(result).toContain('Asia/Seoul');
    expect(result).toContain('Asia/Tokyo');
    expect(result).toHaveLength(2);
  });
});
