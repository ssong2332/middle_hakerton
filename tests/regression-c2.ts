/**
 * T11 — C2(T10) 보존/오해 경고/긴급도 복원/존댓말/날짜 회귀 검증셋 **러너**.
 *
 * `docs/Tasks.md` T11 · `docs/Architecture.md` Folder Structure "tests/ # T11 회귀 검증셋 러너
 * (docs/TestCases.md 를 읽는다)" · `docs/CodingRules.md` Tests "LLM 산출물 … 구조 검사만으로
 * 통과 처리하지 않는다".
 *
 * ## 이 파일이 하는 것 / 하지 않는 것
 * - **한다**: `../tests/fixtures/c2-cases.ts`의 53건 픽스처를 순회하며, 호출자가 주입한
 *   `C2Invoker`(실제 파이프라인이든 모킹된 것이든)로 각 케이스를 실행하고, `docs/TestCases.md`
 *   "판정 방법"(필수 포함 전부 존재 AND 금지 전부 부재)을 적용해 하나의 실행 출력(표)으로 판정한다.
 * - **하지 않는다**: 이 파일 스스로 LLM을 호출하지 않는다 — `docs/Architecture.md` Data Flow
 *   "T11(회귀 검증셋 26건)이 목 없이 돈다. 순수 함수라 픽스처를 그대로 넣으면 되고" 원칙을
 *   그대로 따른다. 이 러너의 판정 로직 자체(순수 함수)는 목 없이 돌지만, **그 판정 로직이
 *   올바른지는 모킹된 LLM으로 검증**한다(`regression-c2.test.ts`) — 실제 53건을 진짜 LLM으로
 *   돌리는 것은 별도 실행(호출자가 실제 `LLMClient`를 주입)이며, 이 워크트리에는 `.env`가 없어
 *   수행하지 않았다(`docs/TestCases.md` "실행 기록" 표에 미실행으로 기록).
 */
import {
  detectHonorificMixing,
  type LanguageDirection,
  type MisreadRisk,
  type PreservedItem,
} from '@cross-border/core';
import {
  C2_REGRESSION_CASES,
  type C2Case,
  type DateNumberCase,
  type HonorificCase,
  type MisreadRiskCase,
  type PreservationCase,
  type RequiredItem,
  type UrgencyRestorationCase,
} from './fixtures/c2-cases';

/** 케이스 1건을 실제로 실행하는 수단 — 호출자가 주입한다(실제 파이프라인 또는 모킹). */
export interface C2Invoker {
  transform(input: {
    text: string;
    languageDirection: LanguageDirection;
    /** AC-046 판정 절차: "①프로필=합쇼체 ②프로필=해요체 두 조건으로 각각 실행"(`docs/TestCases.md:125`). */
    honorificLevel: 'hapsyo' | 'haeyo' | null;
  }): Promise<{ transformed: string; preserved: PreservedItem[]; misreadRisks: MisreadRisk[] }>;
}

export type CaseVerdict = 'pass' | 'fail' | 'needs-human-review';

export interface CaseResult {
  id: string;
  ac: C2Case['ac'];
  verdict: CaseVerdict;
  /** 사람이 읽는 판정 근거 — 실패 사유 또는 사람 판정이 필요한 항목 목록. */
  detail: string;
}

function normalize(text: string): string {
  return text.toLowerCase();
}

/**
 * 🔴 "동등한 의미의 값" 판정의 v1 근사치 — 대소문자 무시 부분 문자열 매칭이다. 이것은 **구조적
 * 근사**이지 완전한 의미 판정이 아니다(`c2-cases.ts` 헤더 주석 참조). `humanJudgment` 항목은 이
 * 함수가 관여하지 않고 호출부가 별도로 `needs-human-review`로 표시한다.
 */
function matchesRequired(transformed: string, item: RequiredItem): boolean | 'needs-human-review' {
  if (item.kind === 'humanJudgment') return 'needs-human-review';
  const haystack = normalize(transformed);
  if (item.kind === 'literal') return haystack.includes(normalize(item.text));
  return item.options.some((option) => haystack.includes(normalize(option)));
}

function describeRequired(item: RequiredItem): string {
  if (item.kind === 'literal') return `"${item.text}"`;
  if (item.kind === 'anyOf') return `[${item.options.join(' | ')}] 중 하나`;
  return `(사람 판정) ${item.note}`;
}

function judgeTextCase(
  id: string,
  ac: C2Case['ac'],
  transformed: string,
  required: RequiredItem[],
  forbidden: string[],
): CaseResult {
  const haystack = normalize(transformed);
  const forbiddenHit = forbidden.find((f) => haystack.includes(normalize(f)));
  if (forbiddenHit) {
    return { id, ac, verdict: 'fail', detail: `금지 표현 발견: "${forbiddenHit}"` };
  }

  const evaluated = required.map((item) => ({ item, result: matchesRequired(transformed, item) }));
  const missing = evaluated.filter((e) => e.result === false);
  if (missing.length > 0) {
    return {
      id,
      ac,
      verdict: 'fail',
      detail: `필수 포함 누락: ${missing.map((m) => describeRequired(m.item)).join(', ')}`,
    };
  }

  const needsHuman = evaluated.filter((e) => e.result === 'needs-human-review');
  if (needsHuman.length > 0) {
    return {
      id,
      ac,
      verdict: 'needs-human-review',
      detail: `자동 판정 불가 항목(구조 검사만으로 통과 처리하지 않는다): ${needsHuman
        .map((m) => describeRequired(m.item))
        .join(', ')}`,
    };
  }

  return { id, ac, verdict: 'pass', detail: '필수 포함 전부 존재 AND 금지 전부 부재' };
}

function judgeMisreadRiskCase(kase: MisreadRiskCase, misreadRisks: MisreadRisk[]): CaseResult {
  const wellFormed = misreadRisks.filter(
    (r) => r.quote.length > 0 && r.misreading.length > 0 && r.evidence.length > 0,
  );

  if (kase.expectRisk) {
    return wellFormed.length > 0
      ? {
          id: kase.id,
          ac: kase.ac,
          verdict: 'pass',
          detail: `위험 ${wellFormed.length}건 산출됨(3요소 충족)`,
        }
      : {
          id: kase.id,
          ac: kase.ac,
          verdict: 'fail',
          detail: '위험 케이스인데 misreadRisks가 비어 있음',
        };
  }
  return misreadRisks.length === 0
    ? { id: kase.id, ac: kase.ac, verdict: 'pass', detail: '빈 배열(hallucination 없음)' }
    : {
        id: kase.id,
        ac: kase.ac,
        verdict: 'fail',
        detail: `중립 케이스인데 위험 ${misreadRisks.length}건이 지어내졌음(hallucination)`,
      };
}

/**
 * 🔴 AC-046 판정 범위 — `detectHonorificMixing`으로 **혼용 0건**만 확인한다(AC-046①, 무조건
 * 요구). "적용 레벨이 지정한 프로필값과 정확히 일치하는가"(AC-046②의 세부 일치도)까지는 검증하지
 * 않는다 — `rules/honorific.ts`가 문장 레벨 분류 결과를 외부로 노출하지 않기 때문이다(그 파일은
 * `detectHonorificMixing(): boolean`만 export한다). `docs/TestCases.md` "미확정 항목"의
 * "존댓말 레벨 혼용의 기계적 판정 규칙 … 검증 안 됨(추정)"과 같은 성격의 한계다.
 */
async function judgeHonorificCase(kase: HonorificCase, invoker: C2Invoker): Promise<CaseResult> {
  const levels: Array<'hapsyo' | 'haeyo'> = ['hapsyo', 'haeyo'];
  const mixedFor: string[] = [];
  for (const level of levels) {
    const { transformed } = await invoker.transform({
      text: kase.input,
      languageDirection: kase.direction,
      honorificLevel: level,
    });
    if (detectHonorificMixing(transformed)) mixedFor.push(level);
  }

  return mixedFor.length === 0
    ? { id: kase.id, ac: kase.ac, verdict: 'pass', detail: '합쇼체·해요체 두 실행 모두 혼용 0건' }
    : {
        id: kase.id,
        ac: kase.ac,
        verdict: 'fail',
        detail: `혼용 감지됨(프로필=${mixedFor.join(', ')})`,
      };
}

/** `AC-006`·`AC-045`·`AC-049`는 required/forbidden 형태가 동일해 같은 분기로 묶는다. */
function isPreservationOrUrgencyOrDate(
  kase: C2Case,
): kase is PreservationCase | UrgencyRestorationCase | DateNumberCase {
  return kase.ac === 'AC-006' || kase.ac === 'AC-045' || kase.ac === 'AC-049';
}

async function judgeCase(kase: C2Case, invoker: C2Invoker): Promise<CaseResult> {
  if (kase.ac === 'AC-043') {
    const { misreadRisks } = await invoker.transform({
      text: kase.input,
      languageDirection: kase.direction,
      honorificLevel: null,
    });
    return judgeMisreadRiskCase(kase, misreadRisks);
  }
  if (kase.ac === 'AC-046') {
    return judgeHonorificCase(kase, invoker);
  }
  if (isPreservationOrUrgencyOrDate(kase)) {
    const { transformed } = await invoker.transform({
      text: kase.input,
      languageDirection: kase.direction,
      honorificLevel: null,
    });
    return judgeTextCase(kase.id, kase.ac, transformed, kase.required, kase.forbidden);
  }
  // 🔴 타입 시스템이 이미 위 3개 분기로 `C2Case`를 소진시킨다 — 여기 도달하면 새 AC가
  // `c2-cases.ts`에 추가됐는데 이 러너가 갱신되지 않은 것이다. 조용히 통과시키지 않는다.
  throw new Error(`알 수 없는 케이스 종류: ${JSON.stringify(kase)}`);
}

export interface AcTally {
  ac: string;
  pass: number;
  fail: number;
  needsHumanReview: number;
  total: number;
}

export interface C2RegressionReport {
  results: CaseResult[];
  tally: AcTally[];
  totalPass: number;
  totalCases: number;
}

function tallyByAc(results: CaseResult[]): AcTally[] {
  const acOrder = ['AC-006', 'AC-043', 'AC-045', 'AC-046', 'AC-049'];
  return acOrder.map((ac) => {
    const rows = results.filter((r) => r.ac === ac);
    return {
      ac,
      pass: rows.filter((r) => r.verdict === 'pass').length,
      fail: rows.filter((r) => r.verdict === 'fail').length,
      needsHumanReview: rows.filter((r) => r.verdict === 'needs-human-review').length,
      total: rows.length,
    };
  });
}

/**
 * 53건(표 A 46건 + 표 B T-P 7건) 전체를 실행하고 하나의 실행 출력으로 판정한다.
 * `cases`를 생략하면 `C2_REGRESSION_CASES`(전체 53건)를 쓴다 — 테스트에서는 부분집합을 넘길 수 있다.
 */
export async function runC2Regression(
  invoker: C2Invoker,
  cases: C2Case[] = C2_REGRESSION_CASES,
): Promise<C2RegressionReport> {
  const results: CaseResult[] = [];
  for (const kase of cases) {
    results.push(await judgeCase(kase, invoker));
  }
  return {
    results,
    tally: tallyByAc(results),
    totalPass: results.filter((r) => r.verdict === 'pass').length,
    totalCases: results.length,
  };
}

/** `docs/TestCases.md` "실행 기록" 표에 붙여넣기 좋은 사람이 읽는 요약 문자열을 만든다. */
export function formatReport(report: C2RegressionReport): string {
  const lines: string[] = [];
  lines.push('AC별 결과:');
  for (const row of report.tally) {
    lines.push(
      `  ${row.ac}: ${row.pass}/${row.total} pass` +
        (row.fail > 0 ? `, ${row.fail} fail` : '') +
        (row.needsHumanReview > 0 ? `, ${row.needsHumanReview} needs-human-review` : ''),
    );
  }
  lines.push(`합계: ${report.totalPass}/${report.totalCases} pass`);
  const problems = report.results.filter((r) => r.verdict !== 'pass');
  if (problems.length > 0) {
    lines.push('세부(실패/사람 판정 필요):');
    for (const p of problems) {
      lines.push(`  [${p.ac} ${p.id}] ${p.verdict} — ${p.detail}`);
    }
  }
  return lines.join('\n');
}
