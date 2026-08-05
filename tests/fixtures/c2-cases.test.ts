/**
 * `c2-cases.ts` 픽스처(53건)가 `docs/TestCases.md`(단일 출처, planner 소유) 원문과 일치하는지
 * 검사한다 — reviewer 후속 Major 6(`docs/Tasks.md` T11): "픽스처가 TestCases.md의 손 복사본이라
 * 드리프트 감지가 없다".
 *
 * 🔴 문서 전체를 파싱하지 않는다 — `| P-01 | 입력... | ... |` 형태의 표 행에서 이 픽스처가 다루는
 * ID 접두어(P·T-P·M·U·H·D, AC-047의 N-*·다른 AC의 T-U/T-E/T-G 표는 제외)만 정규식으로 뽑아
 * ID→입력 맵을 만들고, `C2_REGRESSION_CASES`와 대조한다. 판정 로직(필수 포함/금지)의 재구현이
 * 아니라 **원문 문자열 드리프트 감지**가 목적이다.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { C2_REGRESSION_CASES } from './c2-cases';

const TEST_CASES_MD_PATH = path.resolve(process.cwd(), 'docs/TestCases.md');

/** `| P-01 | 입력 텍스트 | ... |` — 이 픽스처가 다루는 ID 접두어만 매치한다.
 * `~~T-P01~~`(취소선, 중복 제외)이나 N-*, T-U*, T-E*, T-G*(다른 AC·범위 밖)는 매치하지 않는다. */
const ROW_PATTERN =
  /^\|\s*(P-\d{2}|T-P\d{2}|M-\d{2}|U-\d{2}|H-\d{2}|D-\d{2})\s*\|\s*([^|]+?)\s*\|/gm;

function parseDocInputsById(markdown: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const match of markdown.matchAll(ROW_PATTERN)) {
    result.set(match[1], match[2].trim());
  }
  return result;
}

describe('C2_REGRESSION_CASES ↔ docs/TestCases.md 드리프트 감지', () => {
  const docInputs = parseDocInputsById(readFileSync(TEST_CASES_MD_PATH, 'utf-8'));

  it('문서에서 53건(P-01~10 · T-P02~08 · M-01~10 · U-01~10 · H-01~10 · D-01~06)을 전부 파싱했다(파서 자가 검증)', () => {
    expect(docInputs.size).toBe(53);
  });

  it('픽스처의 각 케이스 ID가 문서에 존재하고, 입력 원문이 글자 그대로 일치한다', () => {
    const mismatches = C2_REGRESSION_CASES.flatMap((kase) => {
      const docInput = docInputs.get(kase.id);
      if (docInput === undefined) return [`${kase.id}: 문서에 없음`];
      if (docInput !== kase.input) {
        return [`${kase.id}: 문서="${docInput}" ≠ 픽스처="${kase.input}"`];
      }
      return [];
    });
    expect(mismatches).toEqual([]);
  });

  it('문서 쪽에만 있고 픽스처에는 없는 ID가 없다(픽스처가 문서 갱신을 놓치지 않았는지)', () => {
    const fixtureIds = new Set(C2_REGRESSION_CASES.map((c) => c.id));
    const docOnlyIds = [...docInputs.keys()].filter((id) => !fixtureIds.has(id));
    expect(docOnlyIds).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 reviewer 후속 Major C(`docs/Tasks.md` T11) — "픽스처 드리프트 검사가 입력만 보고 판정 기준
// (필수 포함/금지)은 안 본다"의 구현. `c2-cases.ts`의 `required`/`forbidden`(`RequiredItem[]`)은
// 문서 열의 **번역·해석 결과**(영문 리터럴/anyOf/사람 판정 태그)라 문서 원문(국문 자유 서술)과
// 바이트 단위로 비교할 수 없다(`c2-cases.ts` 헤더 주석 "필수 포함을 문자열로 판정하는 것의 한계"
// 참조). 대신 이 픽스처가 만들어질 때 읽은 문서 원문의 **스냅샷**을 문서의 현재 값과 대조한다 —
// planner가 이 열을 나중에 고치면 스냅샷과 어긋나 여기서 드리프트가 잡힌다(위 `input` 드리프트
// 검사와 같은 방식, `required`/`forbidden`이 없는 M-*·H-* 계열은 이 검사 대상이 아니다).
// ─────────────────────────────────────────────────────────────────────────────

/** P·U·D 계열 — `| ID | 입력 | 필수 포함 | 금지 |` 4열 표. */
const REQUIRED_FORBIDDEN_ROW_PATTERN =
  /^\|\s*(P-\d{2}|U-\d{2}|D-\d{2})\s*\|\s*[^|]+?\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/gm;

/** T-P 계열 — `| ID | 입력 | 보존 필수 키워드 | 통과 기준 | 비고 |` 5열 표. "금지" 열이 없어
 * `forbidden`은 항상 `null`(픽스처의 `forbidden: []`와 대응). */
const T_P_REQUIRED_ROW_PATTERN = /^\|\s*(T-P\d{2})\s*\|\s*[^|]+?\s*\|\s*([^|]+?)\s*\|/gm;

interface DocRequiredForbidden {
  required: string;
  forbidden: string | null;
}

function parseDocRequiredForbiddenById(markdown: string): Map<string, DocRequiredForbidden> {
  const result = new Map<string, DocRequiredForbidden>();
  for (const match of markdown.matchAll(REQUIRED_FORBIDDEN_ROW_PATTERN)) {
    result.set(match[1], { required: match[2].trim(), forbidden: match[3].trim() });
  }
  for (const match of markdown.matchAll(T_P_REQUIRED_ROW_PATTERN)) {
    result.set(match[1], { required: match[2].trim(), forbidden: null });
  }
  return result;
}

/** 픽스처가 `required`/`forbidden`을 해석할 때 읽은 문서 원문의 스냅샷(33건 = P 10 · T-P 7 ·
 * U 10 · D 6). `docs/TestCases.md`의 해당 셀과 글자 그대로 일치해야 한다. */
const DOC_REQUIRED_FORBIDDEN_SNAPSHOT: Record<string, DocRequiredForbidden> = {
  'P-01': { required: '금요일 / 스프린트 지연 영향 / 요청 액션', forbidden: 'when you get a chance, no rush' },
  'P-02': { required: '결제 API 장애 / 주문 전량 실패 / 즉시 확인 요청', forbidden: 'if possible, at your convenience' },
  'P-03': { required: 'Aug 12, 2026 14:00 / QA 결과 회신 / 릴리스 전', forbidden: '(없음)' },
  'P-04': { required: '200ms / 3초 / 원인 확인 요청', forbidden: '(수치 반올림·생략)' },
  'P-05': { required: '5천만원 / 3천만원 / 범위 재조정', forbidden: 'USD 환산값' },
  'P-06': { required: '3개 / 내일 오전 / 발급 요청', forbidden: 'some accounts, a few' },
  'P-07': { required: '필수(반드시) / 롤백 플랜 첨부', forbidden: 'if you can, optionally' },
  'P-08': { required: '0.3% / 12% / 어제 배포', forbidden: '(수치 생략)' },
  'P-09': { required: 'Aug 8, 2026(초안) / Aug 15, 2026(최종본)', forbidden: '8/8, 8/15 (모호 표기 잔존)' },
  'P-10': { required: '10:00 KST / 링크 별도 발송', forbidden: '(시간대 표기 누락)' },
  'T-P02': { required: '내일 오후 2시 / 회의 / 데이터', forbidden: null },
  'T-P03': { required: '배포 전 / 필수 수정', forbidden: null },
  'T-P04': { required: '예산 초과 / 승인 필요 / 진행 불가', forbidden: null },
  'T-P05': { required: '재발 방지책 / 이번 주', forbidden: null },
  'T-P06': { required: '8월 21일 / 최종 / 연장 불가', forbidden: null },
  'T-P07': { required: '테스트 환경 / 운영 미반영', forbidden: null },
  'T-P08': { required: '다수 반대 / 보류 결정', forbidden: null },
  'U-01': { required: '명시적 기한(today / EOD today) + 확인 요청 문장', forbidden: 'maybe, if possible, whenever' },
  'U-02': { required: 'tomorrow morning + 요청 문장', forbidden: 'if you can, preferably만 남기는 형태' },
  'U-03': { required: 'Friday + 배포 의존성 + 요청 문장', forbidden: 'when you get a chance (단독)' },
  'U-04': { required: 'this week + 회신 요청', forbidden: 'if you have time' },
  'U-05': { required: 'urgent 명시 + 확인 시점을 묻는 문장', forbidden: 'slightly, a bit' },
  'U-06': { required: '즉시성(now / right away) + 회신 요청', forbidden: 'by any chance' },
  'U-07': { required: 'payment API 장애 + 확인 요청', forbidden: 'sorry to bother you (과잉 사과 유지)' },
  'U-08': { required: 'today + 답변 요청', forbidden: 'I know this is a hassle' },
  'U-09': { required: '미반영 사실 + 후속 조치 요청', forbidden: 'I hate to say this' },
  'U-10': { required: 'Friday + 승인 필요 + 스프린트 영향', forbidden: 'did I miss something (자기 귀책 프레이밍 유지)' },
  'D-01': { required: 'Aug 4, 2026', forbidden: '8/4, 04/08' },
  'D-02': { required: 'Aug 4, 2026', forbidden: '2026.08.04 (그대로 노출)' },
  'D-03': { required: 'Aug 8, 2026 / Aug 15, 2026', forbidden: '8/8, 8/15' },
  'D-04': { required: '30,000,000 KRW (또는 3천만원)', forbidden: 'USD 환산값, $ 표기' },
  'D-05': { required: '200ms', forbidden: '0.2s (임의 단위 변환)' },
  'D-06': { required: 'Sep 1, 2026 10:00 KST', forbidden: '9/1, 시간대 누락' },
};

describe('C2_REGRESSION_CASES required/forbidden ↔ docs/TestCases.md 드리프트 감지(reviewer 후속 Major C)', () => {
  const docReqForbid = parseDocRequiredForbiddenById(readFileSync(TEST_CASES_MD_PATH, 'utf-8'));

  it('문서에서 33건(P-01~10 · T-P02~08 · U-01~10 · D-01~06)의 필수 포함/금지 열을 전부 파싱했다(파서 자가 검증)', () => {
    expect(docReqForbid.size).toBe(33);
  });

  it('문서의 필수 포함/금지 열 원문이 스냅샷과 글자 그대로 일치한다(드리프트가 있으면 이 테스트가 실패한다)', () => {
    const mismatches = Object.entries(DOC_REQUIRED_FORBIDDEN_SNAPSHOT).flatMap(([id, snapshot]) => {
      const current = docReqForbid.get(id);
      if (current === undefined) return [`${id}: 문서에 없음(행이 삭제되었거나 ID가 바뀜)`];
      const issues: string[] = [];
      if (current.required !== snapshot.required) {
        issues.push(`${id} 필수 포함: 문서="${current.required}" ≠ 스냅샷="${snapshot.required}"`);
      }
      if (current.forbidden !== snapshot.forbidden) {
        issues.push(`${id} 금지: 문서="${current.forbidden}" ≠ 스냅샷="${snapshot.forbidden}"`);
      }
      return issues;
    });
    expect(mismatches).toEqual([]);
  });

  it('스냅샷의 모든 ID가 픽스처(C2_REGRESSION_CASES)에도 존재한다(스냅샷이 검사 대상에서 벗어나지 않았는지)', () => {
    const fixtureIds = new Set(C2_REGRESSION_CASES.map((c) => c.id));
    const snapshotOnlyIds = Object.keys(DOC_REQUIRED_FORBIDDEN_SNAPSHOT).filter((id) => !fixtureIds.has(id));
    expect(snapshotOnlyIds).toEqual([]);
  });
});
