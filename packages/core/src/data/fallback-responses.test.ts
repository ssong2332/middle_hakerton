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
  // 🔴 Major 5(2026-08-05, reviewer 재검토 → 수정) — c2 폴백의 `preserved`가 `[]`로 비워지면서
  // (실제로 보지 않은 마감을 "보존했다"고 주장하지 않는다) 이 테스트의 원래 전제("c2는 마감을
  // 보존한다")는 더 이상 성립하지 않는다. c1.reason이 "마감 신호가 없다"는 취지를 주장하면 안
  // 된다는 본래의 불변식 자체는 preserved 내용과 무관하게 여전히 유효하므로 그 assertion은
  // 유지하고, 전제 확인만 새 현실(preserved가 비어 있다)에 맞춘다.
  it('일관성 — c1 reason은 (더 이상 아무것도 보존하지 않는) c2와 모순되는 "마감 없음" 주장을 하지 않는다(C-1/Major 5)', () => {
    const c1Entry = FALLBACK_RESPONSES.find((e) => e.step === 'c1' && e.cacheKey === undefined)!;
    const c2Entry = FALLBACK_RESPONSES.find((e) => e.step === 'c2' && e.cacheKey === undefined)!;
    const c1Parsed = JSON.parse(c1Entry.content) as { reason: string };
    const c2Parsed = JSON.parse(c2Entry.content) as { preserved: { kind: string }[] };

    // 전제 확인(Major 5로 갱신) — 폴백은 실제 입력을 본 적이 없으므로 c2는 이제 아무것도
    // "보존했다"고 주장하지 않는다.
    expect(c2Parsed.preserved).toEqual([]);
    // c1.reason이 "마감 신호가 없다"는 취지를 주장하면 안 된다(입력을 봤다고 전제하는 주장이므로).
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

  // MJ-A(사용자 지시 유지보수 라운드) — c1.reason은 이미 "폴백이라 실제 입력을 확인하지
  // 못했다"는 사실만 말하도록 고쳐져 있다(T15/T16). c2.reason은 여전히 "완곡한 표현 속 긴급도를
  // 명시적 기한과 확인 요청 문장으로 복원했습니다" — 실제로 보지 않은 사용자 입력을 분석해
  // 판단한 것처럼 말한다. 마감이 없는 원문에서 이 폴백이 뜨면, 쓰지도 않은 마감이 정말 원문에서
  // 왔다는 것처럼 통보되는 결함이다. c1과 같은 패턴(사실만 말한다)을 c2에도 적용한다.
  it('MJ-A — c2 폴백 reason도 c1과 같은 패턴으로 "폴백이라 실제 입력을 확인하지 못했다"는 사실만 말한다', () => {
    const c1Entry = FALLBACK_RESPONSES.find((e) => e.step === 'c1' && e.cacheKey === undefined)!;
    const c2Entry = FALLBACK_RESPONSES.find((e) => e.step === 'c2' && e.cacheKey === undefined)!;
    const c1Parsed = JSON.parse(c1Entry.content) as { reason: string };
    const c2Parsed = JSON.parse(c2Entry.content) as { reason: string };

    const disclosurePattern = /폴백 응답이라 실제 입력을 확인하지 못했습니다/;
    // 전제 확인 — c1은 이미 이 패턴을 쓴다(T15/T16, 회귀하지 않았는지 재확인).
    expect(c1Parsed.reason).toMatch(disclosurePattern);
    // c2도 같은 패턴을 공유해야 한다.
    expect(c2Parsed.reason).toMatch(disclosurePattern);
    // "복원했습니다"처럼 실제 입력을 분석해 얻은 결론인 것처럼 말하는 문구가 남아 있으면 안 된다.
    expect(c2Parsed.reason).not.toMatch(/복원했습니다/);
  });

  // Major 5(reviewer 재검토 → 수정) — MJ-A는 c2.reason만 "폴백이라 실제 입력을 확인하지 못했다"로
  // 고쳤지만, 같은 응답의 `preserved: [{kind:'deadline', ...}]`는 그대로 남아 있었다.
  // `ComparisonView.tsx`가 이걸 "EOD today (보존됨)"으로 렌더하므로, 마감이 없는 실제 원문에서
  // 이 폴백이 뜨면 쓰지도 않은 마감이 "보존됨"으로 통보되는 결함이 재현된다. 폴백은 실제로 아무
  // 것도 "봤다"고 주장할 근거가 없으므로(c1이 이미 이 패턴), preserved도 비워야 한다.
  // `transformed`(U-01 시나리오 예시 텍스트)는 그대로 둔다 — preserved만의 문제다.
  it('Major 5 — c2 폴백의 preserved는 비어 있다(실제로 보지 않은 항목을 보존됐다고 주장하지 않는다)', () => {
    const c2Entry = FALLBACK_RESPONSES.find((e) => e.step === 'c2' && e.cacheKey === undefined)!;
    const c2Parsed = JSON.parse(c2Entry.content) as {
      transformed: string;
      preserved: unknown[];
    };

    expect(c2Parsed.preserved).toEqual([]);
    // transformed(U-01 시나리오 예시)는 이 수정과 무관하게 그대로 유지된다.
    expect(c2Parsed.transformed).toBe(
      "I need this by EOD today. Please confirm if that's not feasible.",
    );
  });

  // Minor(사용자 지시 유지보수 라운드) — c2 폴백의 `preserved`는 항상 `[]`라 `ComparisonView`의
  // "보존된 항목" 블록 자체가 렌더되지 않는다(Major 5). 그런데 `reason` 문구는 여전히 "아래
  // 변환문·보존 항목은 예시"라고 말해, 화면에 없는 UI("보존 항목" 블록)를 가리키고 있었다.
  it('Minor — c2 폴백 reason은 "보존 항목"을 언급하지 않는다(preserved가 항상 []이라 그 블록이 렌더되지 않는다)', () => {
    const c2Entry = FALLBACK_RESPONSES.find((e) => e.step === 'c2' && e.cacheKey === undefined)!;
    const c2Parsed = JSON.parse(c2Entry.content) as { reason: string };

    expect(c2Parsed.reason).not.toMatch(/보존 항목/);
    // "폴백이라 실제 입력을 확인하지 못했다"는 사실 고지 자체는 MJ-A/C-1과 동일하게 유지되어야
    // 한다 — 이 수정이 그 불변식을 깨지 않았는지 함께 확인한다.
    expect(c2Parsed.reason).toMatch(/폴백 응답이라 실제 입력을 확인하지 못했습니다/);
  });
});
