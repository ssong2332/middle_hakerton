import { describe, expect, it } from 'vitest';
import { computeIndicatorDeltas } from './indicators';

describe('computeIndicatorDeltas — AC-080④, T71', () => {
  it('문장 수 — 마침표/느낌표/물음표/줄바꿈으로 나눈다', () => {
    const result = computeIndicatorDeltas('첫 문장입니다. 두 번째 문장! 세 번째?\n네 번째 문장');
    expect(result.sentenceCount).toBe(4);
  });

  it('구두점이 없어도 1문장으로 센다', () => {
    expect(computeIndicatorDeltas('구두점 없는 텍스트').sentenceCount).toBe(1);
  });

  it('빈 문자열은 0문장이다', () => {
    expect(computeIndicatorDeltas('').sentenceCount).toBe(0);
    expect(computeIndicatorDeltas('   ').sentenceCount).toBe(0);
  });

  it('이모지 개수 — pattern-detection.ts의 countEmoji와 동일 판정', () => {
    const result = computeIndicatorDeltas('확인했습니다 👍😊');
    expect(result.emojiCount).toBe(2);
  });

  it('이모지가 없으면 0이다', () => {
    expect(computeIndicatorDeltas('이모지 없음').emojiCount).toBe(0);
  });

  it('문자 수 — text.length 그대로', () => {
    expect(computeIndicatorDeltas('12345').charCount).toBe(5);
  });

  it('완충 표현(hedge) 개수 — CUSHION_PHRASES 목록의 각 구를 모두 합산한다(중복 등장도 각각 센다)', () => {
    // "혹시" 2회 + "괜찮으시다면" 1회 = 3.
    const result = computeIndicatorDeltas('혹시 괜찮으시다면 확인 부탁드립니다. 혹시 시간 되실까요?');
    expect(result.hedgeCount).toBe(3);
  });

  it('완충 표현이 없으면 0이다', () => {
    expect(computeIndicatorDeltas('금요일까지 확인 부탁드립니다.').hedgeCount).toBe(0);
  });

  it('addressFormKind/deadlineMentionKind — 스코프 갭, 항상 null(지어내지 않는다)', () => {
    const result = computeIndicatorDeltas('아무 텍스트나 상관없다');
    expect(result.addressFormKind).toBeNull();
    expect(result.deadlineMentionKind).toBeNull();
  });

  it('원문과 무관하게 6개 필드를 모두 반환한다(shape 고정)', () => {
    const result = computeIndicatorDeltas('테스트');
    expect(Object.keys(result).sort()).toEqual(
      ['addressFormKind', 'charCount', 'deadlineMentionKind', 'emojiCount', 'hedgeCount', 'sentenceCount'].sort(),
    );
  });
});
