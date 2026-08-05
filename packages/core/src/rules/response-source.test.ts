/**
 * `combineSource` — `MediationResult.source` = `worst(MediationResult.stepSources)` 불변식
 * (F1-e, `docs/adr/0009-step-level-response-provenance.md` D2)의 유일한 구현. 신뢰도 우선순위는
 * `fallback` > `cache` > `live` — 셋 중 하나라도 신뢰도가 낮으면 합쳐진 값도 그 신뢰도를 따른다.
 *
 * 3^3 = 27 조합 전부는 아니지만(ADR-0009 D2가 판별 유니온을 기각한 이유와 같은 이유로 과함),
 * 우선순위 쌍마다 신뢰도가 낮은 쪽이 이긴다는 것을 대표 케이스로 보인다.
 */
import { describe, expect, it } from 'vitest';
import { combineSource } from './response-source';

describe('combineSource', () => {
  it('세 값 모두 live면 live를 반환한다', () => {
    expect(combineSource('live', 'live', 'live')).toBe('live');
  });

  it('fallback이 cache를 이긴다(우선순위 쌍 fallback>cache)', () => {
    expect(combineSource('fallback', 'cache')).toBe('fallback');
    expect(combineSource('cache', 'fallback')).toBe('fallback');
  });

  it('fallback이 live를 이긴다(우선순위 쌍 fallback>live)', () => {
    expect(combineSource('fallback', 'live')).toBe('fallback');
    expect(combineSource('live', 'fallback')).toBe('fallback');
  });

  it('cache가 live를 이긴다(우선순위 쌍 cache>live)', () => {
    expect(combineSource('cache', 'live')).toBe('cache');
    expect(combineSource('live', 'cache')).toBe('cache');
  });

  it('C1=fallback, C2=live, C4=live면 fallback을 반환한다(AC-041, 어느 스텝이든 폴백이면 전체가 폴백)', () => {
    expect(combineSource('fallback', 'live', 'live')).toBe('fallback');
  });

  it('C1=live, C2=live, C4=cache면 cache를 반환한다(AC-041)', () => {
    expect(combineSource('live', 'live', 'cache')).toBe('cache');
  });

  it('C1=live, C2=fallback, C4=live면 fallback을 반환한다(가운데 값도 동일하게 반영된다)', () => {
    expect(combineSource('live', 'fallback', 'live')).toBe('fallback');
  });

  it('세 값이 서로 다르면(cache/fallback/live 조합) 가장 신뢰도 낮은 fallback을 반환한다', () => {
    expect(combineSource('cache', 'fallback', 'live')).toBe('fallback');
  });
});
