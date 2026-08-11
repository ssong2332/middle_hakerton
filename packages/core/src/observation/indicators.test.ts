import { describe, expect, it } from 'vitest';
import {
  computeIndicatorDeltas,
  computeObserveIndicators,
  type ComputeObserveIndicatorsInput,
} from './indicators';

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

const EMPTY_OBSERVE_INPUT: ComputeObserveIndicatorsInput = {
  manual: { sampleCount: 0, sentenceCountSum: 0, emojiCountSum: 0 },
  github: { sampleCount: 0, sentenceCountSum: 0, emojiCountSum: 0 },
  activityHourHistogram: null,
  activitySampleCount: 0,
};

describe('computeObserveIndicators — AC-072, T68', () => {
  it('4개 키를 항상 전부 반환한다(표본이 전혀 없어도)', () => {
    const result = computeObserveIndicators(EMPTY_OBSERVE_INPUT);
    expect(result.map((r) => r.key)).toEqual(['commentLength', 'emojiFrequency', 'responseDelay', 'activityHours']);
  });

  it('표본이 없으면 value:null·sampleCount:0이다(지어내지 않는다)', () => {
    const [commentLength, emojiFrequency] = computeObserveIndicators(EMPTY_OBSERVE_INPUT);
    expect(commentLength).toMatchObject({ value: null, sampleCount: 0 });
    expect(emojiFrequency).toMatchObject({ value: null, sampleCount: 0 });
  });

  it('commentLength — 두 출처 표본을 합쳐 평균 문장 수를 계산한다', () => {
    const input: ComputeObserveIndicatorsInput = {
      ...EMPTY_OBSERVE_INPUT,
      manual: { sampleCount: 2, sentenceCountSum: 6, emojiCountSum: 0 },
      github: { sampleCount: 3, sentenceCountSum: 9, emojiCountSum: 0 },
    };
    const [commentLength] = computeObserveIndicators(input);
    expect(commentLength).toEqual({
      key: 'commentLength',
      value: 3, // (6+9)/(2+3)
      sampleCount: 5,
      sampleCountBySource: { manual: 2, github: 3 },
    });
  });

  it('emojiFrequency — 두 출처 표본을 합쳐 평균 이모지 개수를 계산한다', () => {
    const input: ComputeObserveIndicatorsInput = {
      ...EMPTY_OBSERVE_INPUT,
      manual: { sampleCount: 4, sentenceCountSum: 0, emojiCountSum: 2 },
      github: { sampleCount: 0, sentenceCountSum: 0, emojiCountSum: 0 },
    };
    const [, emojiFrequency] = computeObserveIndicators(input);
    expect(emojiFrequency).toEqual({
      key: 'emojiFrequency',
      value: 0.5,
      sampleCount: 4,
      sampleCountBySource: { manual: 4, github: 0 },
    });
  });

  it('responseDelay — 계산할 데이터가 없어 항상 null/0이다(지어내지 않는다)', () => {
    const input: ComputeObserveIndicatorsInput = {
      ...EMPTY_OBSERVE_INPUT,
      manual: { sampleCount: 10, sentenceCountSum: 20, emojiCountSum: 5 },
    };
    const [, , responseDelay] = computeObserveIndicators(input);
    expect(responseDelay).toEqual({
      key: 'responseDelay',
      value: null,
      sampleCount: 0,
      sampleCountBySource: { manual: 0, github: 0 },
    });
  });

  it('activityHours — recipient_enrichments의 히스토그램에서 최빈 시간대를 뽑는다(GitHub 전용)', () => {
    const histogram = new Array<number>(24).fill(0);
    histogram[14] = 20;
    const input: ComputeObserveIndicatorsInput = {
      ...EMPTY_OBSERVE_INPUT,
      activityHourHistogram: histogram,
      activitySampleCount: 30,
    };
    const [, , , activityHours] = computeObserveIndicators(input);
    expect(activityHours).toEqual({
      key: 'activityHours',
      value: 14,
      sampleCount: 30,
      sampleCountBySource: { manual: 0, github: 30 },
    });
  });

  it('activityHours — 히스토그램이 null(표본 부족)이면 value가 null이다', () => {
    const [, , , activityHours] = computeObserveIndicators(EMPTY_OBSERVE_INPUT);
    expect(activityHours.value).toBeNull();
  });
});
