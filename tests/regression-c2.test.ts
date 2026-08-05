/**
 * T11 러너(`regression-c2.ts`) 자체의 정확성 검증 — `docs/Tasks.md` T11 "미리 판단해야 할 것 2"
 * ②가 요구하는 "LLMClient를 모킹해서 러너 자체의 정확성(파싱·판정 로직이 맞는지)은 검증해라"의
 * 구현이다.
 *
 * 🔴 이 테스트는 **실제 LLM을 호출하지 않는다** — `C2Invoker`를 가짜로 주입해 "판정 로직이 맞는
 * 입력에 맞는 판정을 내리는가"만 검증한다. 실제 53건을 진짜 파이프라인(진짜 LLM)으로 실행한
 * 수치는 이 테스트의 책임이 아니다(`docs/TestCases.md` "실행 기록" 표에 미실행으로 기록됨 — 이
 * 워크트리에 `.env`가 없다).
 */
import { describe, expect, it } from 'vitest';
import { C2_REGRESSION_CASES, type C2Case, type RequiredItem } from './fixtures/c2-cases';
import { formatReport, runC2Regression, type C2Invoker } from './regression-c2';

/** 픽스처의 `required[]`에서 자동 판정 가능한 항목(literal/anyOf)의 대표 문구를 뽑아 이어붙인다.
 * `humanJudgment` 항목은 건너뛴다 — 그 항목은 애초에 텍스트로 판정할 수 없다(러너의 설계 자체가
 * 그것을 검증 대상으로 삼는다). 이렇게 만든 텍스트는 "이 케이스의 자동 판정 가능 부분을 전부
 * 만족하는 최소 정답"이다. */
function representativeText(items: RequiredItem[]): string {
  return items
    .filter(
      (i): i is Extract<RequiredItem, { kind: 'literal' | 'anyOf' }> => i.kind !== 'humanJudgment',
    )
    .map((i) => (i.kind === 'literal' ? i.text : i.options[0]))
    .join(' — ');
}

function hasHumanJudgment(items: RequiredItem[]): boolean {
  return items.some((i) => i.kind === 'humanJudgment');
}

/**
 * "정답" 인보커 — 53건 전부에 대해 각 케이스가 인코딩한 자동 판정 가능 요구사항을 정확히
 * 만족하는 응답을 돌려준다. AC-046(존댓말)은 케이스별 내용과 무관하게 요청받은 `honorificLevel`
 * 하나로 일관된 문장을 돌려준다 — 판정이 "혼용 여부"만 보기 때문에 이것으로 충분하다.
 */
const goldenInvoker: C2Invoker = {
  async transform({ text, honorificLevel }) {
    const kase = C2_REGRESSION_CASES.find((c) => c.input === text);
    if (!kase) throw new Error(`픽스처에 없는 입력: ${text}`);

    if (kase.ac === 'AC-046') {
      const transformed = honorificLevel === 'hapsyo' ? '확인 부탁드립니다.' : '확인 부탁드려요.';
      return { transformed, preserved: [], misreadRisks: [] };
    }
    if (kase.ac === 'AC-043') {
      const misreadRisks = kase.expectRisk
        ? [{ quote: kase.input, misreading: '오해 예시', evidence: '근거 예시' }]
        : [];
      return { transformed: 'ok', preserved: [], misreadRisks };
    }
    // AC-006 / AC-045 / AC-049 — required 항목의 대표 문구를 그대로 담아 반환.
    return { transformed: representativeText(kase.required), preserved: [], misreadRisks: [] };
  },
};

describe('C2_REGRESSION_CASES 픽스처', () => {
  it('총 53건이다(표 A 46건 + 표 B T-P 7건, docs/Tasks.md T11 범위)', () => {
    expect(C2_REGRESSION_CASES).toHaveLength(53);
  });

  it('AC-047(호칭·직급 매핑, C5 소관)은 포함하지 않는다', () => {
    expect(C2_REGRESSION_CASES.some((c) => (c as C2Case).ac === ('AC-047' as never))).toBe(false);
  });

  it('AC별 건수가 docs/TestCases.md 표와 일치한다(AC-006 10+7 · AC-043 10 · AC-045 10 · AC-046 10 · AC-049 6)', () => {
    const count = (ac: string) => C2_REGRESSION_CASES.filter((c) => c.ac === ac).length;
    expect(count('AC-006')).toBe(17);
    expect(count('AC-043')).toBe(10);
    expect(count('AC-045')).toBe(10);
    expect(count('AC-046')).toBe(10);
    expect(count('AC-049')).toBe(6);
  });
});

describe('runC2Regression — 정답 인보커(모든 케이스가 자기 요구사항을 만족)', () => {
  it('실패(fail) 판정이 0건이다', async () => {
    const report = await runC2Regression(goldenInvoker);
    expect(report.totalCases).toBe(53);
    const fails = report.results.filter((r) => r.verdict === 'fail');
    expect(fails).toEqual([]);
  });

  it('AC-043(오해 경고) 10건은 전부 pass다 — 위험/중립 판정이 올바르다', async () => {
    const report = await runC2Regression(goldenInvoker);
    const ac043 = report.tally.find((t) => t.ac === 'AC-043');
    expect(ac043).toEqual({ ac: 'AC-043', pass: 10, fail: 0, needsHumanReview: 0, total: 10 });
  });

  it('AC-046(존댓말) 10건은 전부 pass다 — 혼용 감지 로직이 올바르다', async () => {
    const report = await runC2Regression(goldenInvoker);
    const ac046 = report.tally.find((t) => t.ac === 'AC-046');
    expect(ac046).toEqual({ ac: 'AC-046', pass: 10, fail: 0, needsHumanReview: 0, total: 10 });
  });

  it('humanJudgment 항목이 있는 케이스는 pass가 아니라 needs-human-review로 표시된다(구조 검사만으로 통과 처리하지 않는다)', async () => {
    const report = await runC2Regression(goldenInvoker);
    const expectedHumanReviewIds = C2_REGRESSION_CASES.filter(
      (c) =>
        (c.ac === 'AC-006' || c.ac === 'AC-045' || c.ac === 'AC-049') &&
        hasHumanJudgment(c.required),
    ).map((c) => c.id);

    expect(expectedHumanReviewIds.length).toBeGreaterThan(0); // 이 픽스처셋에 실제로 존재해야 이 테스트가 의미 있다
    const actualHumanReviewIds = report.results
      .filter((r) => r.verdict === 'needs-human-review')
      .map((r) => r.id);
    expect(new Set(actualHumanReviewIds)).toEqual(new Set(expectedHumanReviewIds));
  });

  it('humanJudgment 없이 required/forbidden을 모두 만족하는 케이스는 pass다(예: D-05)', async () => {
    const d05 = C2_REGRESSION_CASES.find((c) => c.id === 'D-05')!;
    const report = await runC2Regression(goldenInvoker, [d05]);
    expect(report.results[0]).toMatchObject({ id: 'D-05', verdict: 'pass' });
  });
});

describe('runC2Regression — 오답 인보커(고의로 틀린 응답)', () => {
  it('금지 표현이 포함되면 fail이다(D-01, "8/4" 잔존)', async () => {
    const d01 = C2_REGRESSION_CASES.find((c) => c.id === 'D-01')!;
    const badInvoker: C2Invoker = {
      transform: async () => ({
        transformed: '8/4까지 부탁드립니다',
        preserved: [],
        misreadRisks: [],
      }),
    };
    const report = await runC2Regression(badInvoker, [d01]);
    expect(report.results[0].verdict).toBe('fail');
    expect(report.results[0].detail).toContain('금지 표현');
  });

  it('필수 포함이 누락되면 fail이다(D-05, "200ms" 누락)', async () => {
    const d05 = C2_REGRESSION_CASES.find((c) => c.id === 'D-05')!;
    const badInvoker: C2Invoker = {
      transform: async () => ({
        transformed: '응답 시간이 늘었습니다',
        preserved: [],
        misreadRisks: [],
      }),
    };
    const report = await runC2Regression(badInvoker, [d05]);
    expect(report.results[0].verdict).toBe('fail');
    expect(report.results[0].detail).toContain('필수 포함 누락');
  });

  it('중립 케이스(M-07)에서 위험을 지어내면 fail이다(hallucination)', async () => {
    const m07 = C2_REGRESSION_CASES.find((c) => c.id === 'M-07')!;
    const badInvoker: C2Invoker = {
      transform: async () => ({
        transformed: 'ok',
        preserved: [],
        misreadRisks: [{ quote: 'x', misreading: 'y', evidence: 'z' }],
      }),
    };
    const report = await runC2Regression(badInvoker, [m07]);
    expect(report.results[0].verdict).toBe('fail');
    expect(report.results[0].detail).toContain('hallucination');
  });

  it('위험 케이스(M-01)에서 misreadRisks가 비어 있으면 fail이다', async () => {
    const m01 = C2_REGRESSION_CASES.find((c) => c.id === 'M-01')!;
    const badInvoker: C2Invoker = {
      transform: async () => ({ transformed: 'ok', preserved: [], misreadRisks: [] }),
    };
    const report = await runC2Regression(badInvoker, [m01]);
    expect(report.results[0].verdict).toBe('fail');
  });

  it('존댓말 혼용 응답이면 fail이다(H-01)', async () => {
    const h01 = C2_REGRESSION_CASES.find((c) => c.id === 'H-01')!;
    const mixedInvoker: C2Invoker = {
      transform: async () => ({
        transformed: '확인 부탁드립니다. 편하실 때 연락 주세요.',
        preserved: [],
        misreadRisks: [],
      }),
    };
    const report = await runC2Regression(mixedInvoker, [h01]);
    expect(report.results[0].verdict).toBe('fail');
    expect(report.results[0].detail).toContain('혼용');
  });
});

describe('formatReport', () => {
  it('AC별 요약과 합계, 문제 케이스 세부를 포함한 문자열을 만든다', async () => {
    const d01 = C2_REGRESSION_CASES.find((c) => c.id === 'D-01')!;
    const badInvoker: C2Invoker = {
      transform: async () => ({ transformed: '엉뚱한 응답', preserved: [], misreadRisks: [] }),
    };
    const report = await runC2Regression(badInvoker, [d01]);
    const text = formatReport(report);

    expect(text).toContain('AC-049');
    expect(text).toContain('합계: 0/1 pass');
    expect(text).toContain('[AC-049 D-01]');
  });
});
