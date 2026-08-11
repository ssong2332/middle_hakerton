import { describe, expect, it } from 'vitest';
import { computeProtocolMismatches, type CounterpartObservationRollup } from './protocol-mismatch';
import type { PairProtocol } from '../contract';

const NO_PROTOCOL: PairProtocol = {
  directnessAllowed: null,
  emojiPolicy: null,
  addressForm: null,
  deadlineStyle: null,
};

const EMPTY_ROLLUP: CounterpartObservationRollup = {
  manual: { sampleCount: 0, emojiCount: 0, hedgeCount: 0 },
  github: { sampleCount: 0, emojiCount: 0, hedgeCount: 0 },
};

describe('computeProtocolMismatches — AC-079/AC-083, T70', () => {
  it('규약이 전혀 없으면(합의값 없음) 어떤 축도 만들지 않는다', () => {
    const rollup: CounterpartObservationRollup = {
      manual: { sampleCount: 10, emojiCount: 5, hedgeCount: 5 },
      github: { sampleCount: 20, emojiCount: 5, hedgeCount: 0 },
    };
    expect(computeProtocolMismatches(NO_PROTOCOL, rollup)).toEqual([]);
  });

  it('표본 자체가 없으면(전혀 관측된 적 없는 상대) 어떤 축도 만들지 않는다', () => {
    const protocol: PairProtocol = { ...NO_PROTOCOL, emojiPolicy: 'avoid', directnessAllowed: 'yes' };
    expect(computeProtocolMismatches(protocol, EMPTY_ROLLUP)).toEqual([]);
  });

  describe('이모지 축 — AC-079⑥ 검증 케이스', () => {
    it('명확한 불일치 — 규약 "이모지 미사용" + 관측 이모지 빈도 있음 → 경고 출력', () => {
      const protocol: PairProtocol = { ...NO_PROTOCOL, emojiPolicy: 'avoid' };
      const rollup: CounterpartObservationRollup = {
        manual: { sampleCount: 3, emojiCount: 4, hedgeCount: 0 },
        github: { sampleCount: 0, emojiCount: 0, hedgeCount: 0 },
      };
      const result = computeProtocolMismatches(protocol, rollup);
      expect(result).toContainEqual({
        axis: 'emoji',
        mismatched: true,
        comparison: '규약: 이모지 사용 지양 · 관측: 이모지 4건 (표본 3건)',
        sampleCount: 3,
        sources: ['manual'],
      });
    });

    it('일치 — 규약 "이모지 미사용" + 관측 이모지 0건 → 미출력(mismatched:false로 축은 존재)', () => {
      const protocol: PairProtocol = { ...NO_PROTOCOL, emojiPolicy: 'avoid' };
      const rollup: CounterpartObservationRollup = {
        manual: { sampleCount: 5, emojiCount: 0, hedgeCount: 0 },
        github: { sampleCount: 0, emojiCount: 0, hedgeCount: 0 },
      };
      const [result] = computeProtocolMismatches(protocol, rollup);
      expect(result.mismatched).toBe(false);
    });

    it('emojiPolicy가 ok면(반대 방향) 이모지 축을 만들지 않는다', () => {
      const protocol: PairProtocol = { ...NO_PROTOCOL, emojiPolicy: 'ok' };
      const rollup: CounterpartObservationRollup = {
        manual: { sampleCount: 10, emojiCount: 0, hedgeCount: 0 },
        github: { sampleCount: 0, emojiCount: 0, hedgeCount: 0 },
      };
      expect(computeProtocolMismatches(protocol, rollup)).toEqual([]);
    });

    it('AC-083① — 두 경로(manual+github) 표본을 합산해 판정한다', () => {
      const protocol: PairProtocol = { ...NO_PROTOCOL, emojiPolicy: 'avoid' };
      const rollup: CounterpartObservationRollup = {
        manual: { sampleCount: 3, emojiCount: 1, hedgeCount: 0 },
        github: { sampleCount: 10, emojiCount: 2, hedgeCount: 0 },
      };
      const [result] = computeProtocolMismatches(protocol, rollup);
      expect(result).toMatchObject({ sampleCount: 13, sources: ['manual', 'github'], mismatched: true });
    });

    it('축별 표본 미달 — 두 출처 다 임계값 미만이면 이모지 축을 만들지 않는다(AC-083②)', () => {
      const protocol: PairProtocol = { ...NO_PROTOCOL, emojiPolicy: 'avoid' };
      const rollup: CounterpartObservationRollup = {
        manual: { sampleCount: 2, emojiCount: 5, hedgeCount: 0 },
        github: { sampleCount: 9, emojiCount: 5, hedgeCount: 0 },
      };
      expect(computeProtocolMismatches(protocol, rollup)).toEqual([]);
    });

    it('출처 하나만 임계값을 넘으면 그 출처만 포함한다(경로별 임계값 독립 적용)', () => {
      const protocol: PairProtocol = { ...NO_PROTOCOL, emojiPolicy: 'avoid' };
      const rollup: CounterpartObservationRollup = {
        manual: { sampleCount: 2, emojiCount: 5, hedgeCount: 0 }, // 미달(< 3)
        github: { sampleCount: 10, emojiCount: 3, hedgeCount: 0 }, // 충족(>= 10)
      };
      const [result] = computeProtocolMismatches(protocol, rollup);
      expect(result).toMatchObject({ sampleCount: 10, sources: ['github'] });
    });
  });

  describe('직설 축 — 수동 표시 표본에서만', () => {
    it('규약 "직설 허용" + 완곡 표현 관측 있음 → 불일치', () => {
      const protocol: PairProtocol = { ...NO_PROTOCOL, directnessAllowed: 'yes' };
      const rollup: CounterpartObservationRollup = {
        manual: { sampleCount: 3, emojiCount: 0, hedgeCount: 2 },
        github: { sampleCount: 0, emojiCount: 0, hedgeCount: 0 },
      };
      const [result] = computeProtocolMismatches(protocol, rollup);
      expect(result).toEqual({
        axis: 'directness',
        mismatched: true,
        comparison: '규약: 직설 허용 · 관측: 완곡 표현 2건 (표본 3건)',
        sampleCount: 3,
        sources: ['manual'],
      });
    });

    it('GitHub 표본만 있는 상대에게는 직설 축을 만들지 않는다(AC-083①)', () => {
      const protocol: PairProtocol = { ...NO_PROTOCOL, directnessAllowed: 'yes' };
      const rollup: CounterpartObservationRollup = {
        manual: { sampleCount: 0, emojiCount: 0, hedgeCount: 0 },
        github: { sampleCount: 50, emojiCount: 0, hedgeCount: 20 },
      };
      const results = computeProtocolMismatches(protocol, rollup);
      expect(results.find((r) => r.axis === 'directness')).toBeUndefined();
    });

    it('directnessAllowed가 no면(반대 방향) 직설 축을 만들지 않는다', () => {
      const protocol: PairProtocol = { ...NO_PROTOCOL, directnessAllowed: 'no' };
      const rollup: CounterpartObservationRollup = {
        manual: { sampleCount: 10, emojiCount: 0, hedgeCount: 0 },
        github: { sampleCount: 0, emojiCount: 0, hedgeCount: 0 },
      };
      expect(computeProtocolMismatches(protocol, rollup)).toEqual([]);
    });

    it('수동 표본이 임계값 미만이면 직설 축을 만들지 않는다', () => {
      const protocol: PairProtocol = { ...NO_PROTOCOL, directnessAllowed: 'yes' };
      const rollup: CounterpartObservationRollup = {
        manual: { sampleCount: 2, emojiCount: 0, hedgeCount: 5 },
        github: { sampleCount: 0, emojiCount: 0, hedgeCount: 0 },
      };
      expect(computeProtocolMismatches(protocol, rollup)).toEqual([]);
    });
  });

  it('AC-083④ — 수동 표본이 충분한 상대에서 4축 중 불일치 축만 경고된다(여기선 2축 중)', () => {
    const protocol: PairProtocol = {
      directnessAllowed: 'yes',
      emojiPolicy: 'avoid',
      addressForm: '이름',
      deadlineStyle: '명시적 날짜',
    };
    const rollup: CounterpartObservationRollup = {
      manual: { sampleCount: 5, emojiCount: 0, hedgeCount: 3 }, // 이모지 일치, 직설 불일치
      github: { sampleCount: 0, emojiCount: 0, hedgeCount: 0 },
    };
    const results = computeProtocolMismatches(protocol, rollup);
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.axis === 'emoji')?.mismatched).toBe(false);
    expect(results.find((r) => r.axis === 'directness')?.mismatched).toBe(true);
  });

  it('comparison 문구에 판정 단정 표현("거짓"/"틀렸다"/"다르게 적었다")이 없다', () => {
    const protocol: PairProtocol = { ...NO_PROTOCOL, emojiPolicy: 'avoid', directnessAllowed: 'yes' };
    const rollup: CounterpartObservationRollup = {
      manual: { sampleCount: 5, emojiCount: 3, hedgeCount: 2 },
      github: { sampleCount: 0, emojiCount: 0, hedgeCount: 0 },
    };
    const results = computeProtocolMismatches(protocol, rollup);
    for (const result of results) {
      expect(result.comparison).not.toMatch(/거짓|틀렸|다르게 적|사실과 다르게/);
    }
  });
});
