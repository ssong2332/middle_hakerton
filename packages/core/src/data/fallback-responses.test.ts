/**
 * `findFallbackResponse` — AC-041 폴백 경로 3단계 중 ③ 단계의 조회 함수.
 * 근거: `docs/Architecture.md` Data Flow "2) LLM 호출 3단 해석" —
 * "cacheKey 일치분 우선, 없으면 시나리오 기본값". 실 데모 데이터는 T16이 채운다(이 태스크 범위 밖) —
 * 여기서는 `entries` 인자로 주입해 조회 로직만 검증한다.
 */
import { describe, expect, it } from 'vitest';
import { findFallbackResponse, type FallbackResponseEntry } from './fallback-responses';

const entries: FallbackResponseEntry[] = [
  { step: 'c1', content: '{"urgency":"NORMAL"}' }, // c1 시나리오 기본값 (cacheKey 없음)
  { step: 'c1', cacheKey: 'exact-key-1', content: '{"urgency":"CRITICAL"}' }, // 정확 일치
  { step: 'c2', content: '{"transformed":"..."}' },
];

describe('findFallbackResponse', () => {
  it('cacheKey가 정확히 일치하면 그 항목을 우선 반환한다', () => {
    const result = findFallbackResponse('c1', 'exact-key-1', entries);
    expect(result?.content).toBe('{"urgency":"CRITICAL"}');
  });

  it('정확히 일치하는 cacheKey가 없으면 같은 step의 시나리오 기본값(cacheKey 없는 항목)을 반환한다', () => {
    const result = findFallbackResponse('c1', 'no-such-key', entries);
    expect(result?.content).toBe('{"urgency":"NORMAL"}');
  });

  it('해당 step의 항목이 전혀 없으면 undefined를 반환한다(값을 지어내지 않는다)', () => {
    const result = findFallbackResponse('c4', 'no-such-key', entries);
    expect(result).toBeUndefined();
  });

  it('인자 없이 호출하면 기본 FALLBACK_RESPONSES(빈 배열, T16이 채움)를 조회한다', () => {
    const result = findFallbackResponse('c1', 'anything');
    expect(result).toBeUndefined();
  });
});
