/**
 * `findFallbackResponse` — AC-041 폴백 경로 3단계 중 ③ 단계의 조회 함수.
 * 근거: `docs/Architecture.md` Data Flow "2) LLM 호출 3단 해석" —
 * "cacheKey 일치분 우선, 없으면 시나리오 기본값". 위 4건의 테스트는 `entries` 인자로 주입한
 * 가짜 데이터로 조회 로직만 검증한다(실 데이터와 독립).
 *
 * 아래 `FALLBACK_RESPONSES`(실 데이터, T16이 채움) 관련 테스트는 `entries`를 주입하지 **않는다**
 * — 기본 인자(`FALLBACK_RESPONSES` 그 자체)로 호출해 실제로 채워진 c1/c2/c4 시나리오 기본값이
 * 조회되는지 확인한다.
 */
import { describe, expect, it } from 'vitest';
import {
  FALLBACK_RESPONSES,
  findFallbackResponse,
  type FallbackResponseEntry,
} from './fallback-responses';

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
});

describe('FALLBACK_RESPONSES — T16이 채운 시나리오 기본값(c1/c2/c4)', () => {
  it('c1/c2/c4 각각 cacheKey 없는(시나리오 기본값) 항목이 정확히 1건씩 있다', () => {
    for (const step of ['c1', 'c2', 'c4'] as const) {
      const scenarioDefaults = FALLBACK_RESPONSES.filter(
        (entry) => entry.step === step && entry.cacheKey === undefined,
      );
      expect(scenarioDefaults).toHaveLength(1);
    }
  });

  it('cacheKey를 지정하지 않은 임의의 입력에서도 c1/c2/c4 각각 시나리오 기본값이 조회된다(모델 미확정 환경에서도 조회됨 — 임의 cacheKey 3건 샘플)', () => {
    expect(findFallbackResponse('c1', 'arbitrary-cache-key-1')?.content).toContain('"urgency"');
    expect(findFallbackResponse('c2', 'arbitrary-cache-key-2')?.content).toContain('"transformed"');
    expect(findFallbackResponse('c4', 'arbitrary-cache-key-3')?.content).toContain(
      '"backTranslation"',
    );
  });

  it('c1 기본값 content는 유효한 JSON이고 {urgency, reason} 스키마를 만족한다', () => {
    const entry = FALLBACK_RESPONSES.find((e) => e.step === 'c1' && e.cacheKey === undefined);
    const parsed = JSON.parse(entry!.content) as { urgency: string; reason: string };
    expect(['CRITICAL', 'NORMAL', 'LOW']).toContain(parsed.urgency);
    expect(parsed.reason.length).toBeGreaterThan(0);
  });

  it('c2 기본값 content는 유효한 JSON이고 {transformed, reason, preserved[], misreadRisks[]} 스키마를 만족한다', () => {
    const entry = FALLBACK_RESPONSES.find((e) => e.step === 'c2' && e.cacheKey === undefined);
    const parsed = JSON.parse(entry!.content) as {
      transformed: string;
      reason: string;
      preserved: { kind: string; sourceText: string; transformedText: string }[];
      misreadRisks: unknown[];
    };
    expect(parsed.transformed.length).toBeGreaterThan(0);
    expect(parsed.reason.length).toBeGreaterThan(0);
    expect(Array.isArray(parsed.preserved)).toBe(true);
    expect(Array.isArray(parsed.misreadRisks)).toBe(true);
    // preserved[]가 자기신고 불일치 필터(c2.ts filterPreservedByTransformedText)를 통과하는지 —
    // transformedText가 실제로 transformed 문자열 안에 있어야 한다.
    for (const item of parsed.preserved) {
      expect(parsed.transformed.toLowerCase()).toContain(item.transformedText.toLowerCase());
    }
  });

  it('c4 기본값 content는 유효한 JSON이고 {backTranslation} 스키마를 만족한다', () => {
    const entry = FALLBACK_RESPONSES.find((e) => e.step === 'c4' && e.cacheKey === undefined);
    const parsed = JSON.parse(entry!.content) as { backTranslation: string };
    expect(parsed.backTranslation.length).toBeGreaterThan(0);
  });

  // 🔴 C-1(2026-08-05, reviewer REJECTED → 수정) — c1/c2/c4 기본값이 서로 다른 데모 시나리오에서
  // 왔었다: c1.reason은 "마감 신호 없음"을 주장하면서 c2는 실제로 마감을 preserved에 넣었고(자기
  // 모순), c4.backTranslation은 c2.transformed와 무관한 다른 장면의 문구였다(BackTranslationPreview는
  // 바로 위에 뜬 변환문을 검증하는 컴포넌트이므로, 무관한 역번역은 그 존재 이유를 무너뜨린다).
  // 폴백 발동 시 이 3건이 SenderPanel.tsx 한 화면에 동시에 뜨므로 아래 두 불변식을 고정한다.
  it('일관성 — c1 reason은 c2가 실제로 보존한 마감 신호의 부재를 주장하지 않는다(C-1)', () => {
    const c1Entry = FALLBACK_RESPONSES.find((e) => e.step === 'c1' && e.cacheKey === undefined)!;
    const c2Entry = FALLBACK_RESPONSES.find((e) => e.step === 'c2' && e.cacheKey === undefined)!;
    const c1Parsed = JSON.parse(c1Entry.content) as { reason: string };
    const c2Parsed = JSON.parse(c2Entry.content) as { preserved: { kind: string }[] };

    // 전제 확인 — U-01 시나리오(c2)는 마감을 보존한다(오늘 중 → EOD today).
    expect(c2Parsed.preserved.some((item) => item.kind === 'deadline')).toBe(true);
    // c1.reason이 "마감 신호가 없다"는 취지를 주장하면 위 사실과 정면으로 모순된다.
    expect(c1Parsed.reason).not.toMatch(/마감.{0,12}(없|확인되지\s*않)/);
  });

  it('일관성 — c4 backTranslation은 c2 transformed와 무관한 다른 시나리오의 문구가 아니다(C-1)', () => {
    const c2Entry = FALLBACK_RESPONSES.find((e) => e.step === 'c2' && e.cacheKey === undefined)!;
    const c4Entry = FALLBACK_RESPONSES.find((e) => e.step === 'c4' && e.cacheKey === undefined)!;
    const c2Parsed = JSON.parse(c2Entry.content) as { transformed: string };
    const c4Parsed = JSON.parse(c4Entry.content) as { backTranslation: string };

    // 전제 확인 — U-01의 우리 변환문은 "today"라는 명시적 기한을 담고 있다.
    expect(c2Parsed.transformed.toLowerCase()).toContain('today');
    // 같은 시나리오를 역번역했다면 한국어 역번역에도 "오늘"이 있어야 한다. 없으면 다른 장면
    // (예: 이전 버전의 "이 안건은 보류하고...")에서 가져온 무관한 문구라는 뜻이다.
    expect(c4Parsed.backTranslation).toContain('오늘');
  });
});
