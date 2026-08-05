/**
 * `rules/misread-risk.ts` — `MisreadRisk[]` 스키마 검증 단위 테스트 (AC-043).
 */
import { describe, expect, it } from 'vitest';
import { parseMisreadRisks } from './misread-risk';

describe('parseMisreadRisks', () => {
  it('quote/misreading/evidence를 모두 갖춘 배열을 그대로 반환한다', () => {
    const raw = [
      {
        quote: '확인 부탁드립니다',
        misreading: "상대가 '단순 참고'로 받아들여 액션을 취하지 않을 수 있음",
        evidence: '명시적 기한·행위 지정 없이 요청만 있음',
      },
    ];

    expect(parseMisreadRisks(raw)).toEqual(raw);
  });

  it('빈 배열은 유효한 값이다(근거 없는 위험을 지어내지 않는다, AC-043②)', () => {
    expect(parseMisreadRisks([])).toEqual([]);
  });

  it('evidence가 빠지면 null을 반환한다(3요소 중 하나라도 없으면 근거 없는 위험이 통과해서는 안 된다)', () => {
    const raw = [{ quote: 'x', misreading: 'y' }];
    expect(parseMisreadRisks(raw)).toBeNull();
  });

  it('quote가 빈 문자열이면 null을 반환한다', () => {
    const raw = [{ quote: '', misreading: 'y', evidence: 'z' }];
    expect(parseMisreadRisks(raw)).toBeNull();
  });

  it('배열이 아니면 null을 반환한다', () => {
    expect(parseMisreadRisks('none')).toBeNull();
  });
});
