// C6 하소연 → 태스크 티켓 변환 + 게이트 판정 — 담당: [BE-B] T24.
// `docs/Architecture.md` Data Flow ⑧ / `docs/API.md` "POST /api/ticket" · "POST /api/mediate"
// Response 200(`ticketOption`) / AC-017, AC-018, AC-050, AC-058, AC-062, AC-064.
//
// 🔴 이 파일은 `packages/core/src/steps/c1.ts`·`c2.ts`·`c4.ts`와 동일한 패턴을 따른다
// (`docs/Tasks.md` T7 원문 — "이것과 같은 패턴을 따라라"): LLMClient 주입, zod로 step 응답 최소
// 검증, 실패 시 폴백 조회 후 없으면 `LLMMalformedResponseError`.
//
// 이 파일이 내보내는 것 두 가지(서로 다른 소비처):
// ① `runTicketConversion` — `POST /api/ticket`(UX-007)이 쓰는 실제 4섹션 변환 + 결정 권한 판정.
//    LLM을 1회 호출한다(AC-017/018/050/062/064).
// ② `assessEmotionalSignal` — `POST /api/mediate`(UX-004)가 `ticketOption` 게이트(AC-058, F1-a)를
//    산출할 때 쓰는 **순수 함수**. `docs/adr/0005-c6-ticket-gate-field.md` Follow-up #2가 "판정을
//    어디서 산출하는지는 구현 판단"이라 명시하고 "추가 LLM 호출을 만들지 않는다"는 제약
//    (`docs/Architecture.md` Data Flow ⑥ "추가 호출 금지", NFR 체감 5초)만 못 박았다 — 그래서
//    `runTicketConversion`(LLM 1회 호출)을 게이트에 재사용하지 않고, 결정적·테스트 가능한 키워드
//    휴리스틱으로 별도 구현했다. `docs/TestCases.md` T-E01~T-E04가 이 함수의 기대값이다.
import { z } from 'zod';
import type { LLMClient } from '../llm/client';
import type { ResponseSource, TicketAuthority, TicketOptionBasis, TicketResult } from '../contract';
import { LLMMalformedResponseError } from '../errors';
import { resolveAuthority, type DecisionAuthorityStatus } from '../rules/decision-authority';
import { buildC6Payload, C6_PROMPT_VERSION } from '../prompts/c6';
import { findFallbackResponse, type FallbackResponseEntry } from '../data/fallback-responses';

export interface RunTicketConversionInput {
  /** 하소연/불만이 섞인 원문. */
  text: string;
}

export type RunTicketConversionResult = TicketResult;

export interface RunTicketConversionDeps {
  /** 테스트 주입용. 기본값은 `findFallbackResponse`(`../data/fallback-responses`). */
  fallbackLookup?: (step: 'c6', cacheKey: string) => FallbackResponseEntry | undefined;
}

const decisionAuthorityStatusSchema = z.enum(['확정', '내부 승인 필요', '검토 중', '불명']);

const c6ResponseSchema = z.object({
  sections: z.object({
    // 🔴 없는 값을 지어내지 않는다 — 그러나 근거가 없을 때도 빈 문자열이 아니라 "없음"이라는
    // 유효한 문자열이 항상 있어야 한다(AC-062). 스키마는 "비어 있지 않은 문자열"까지만 강제하고,
    // "없음" 채우기 자체는 프롬프트의 책임이다.
    problem: z.string().min(1),
    impact: z.string().min(1),
    request: z.string().min(1),
    concernLevel: z.string().min(1),
  }),
  decisionAuthority: decisionAuthorityStatusSchema,
  decisionAuthorityEvidence: z.string().min(1).nullable(),
});

type ParsedC6Response = z.infer<typeof c6ResponseSchema>;

/**
 * `response.content`(또는 폴백 항목의 `content`)를 C6 스키마로 파싱한다. 실패하면 `null`
 * — 실패 시 던지지 않는 이유는 `c1.ts`·`c2.ts`·`c4.ts`의 동명 함수와 같다: 호출부가 "원 응답 실패
 * → 폴백 조회 → 폴백도 실패하면 던지기" 순서를 조립해야 한다.
 */
function parseTicketConversion(content: string): ParsedC6Response | null {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }
  const parsed = c6ResponseSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * 🔴 `resolveAuthority()`(F1-c 불변식 2의 유일한 통로)의 `AuthorityVerdict`(`status`/`evidence`)를
 * `TicketResult`가 쓰는 필드 이름(`decisionAuthority`/`decisionAuthorityEvidence`)으로 옮겨 담는다
 * (AC-064③ — 두 이름은 다르지만 판정 로직은 공유한다). 짝을 손으로 조립하지 않는다 —
 * `resolveAuthority()`가 이미 확정한 판별(`status === '불명'`)을 그대로 좁혀서 옮길 뿐이다
 * (`docs/Architecture.md` Conventions 13).
 */
function toTicketAuthority(status: DecisionAuthorityStatus, evidence: string | null): TicketAuthority {
  const verdict = resolveAuthority(status, evidence);
  if (verdict.status === '불명') {
    return { decisionAuthority: '불명', decisionAuthorityEvidence: verdict.evidence };
  }
  return { decisionAuthority: verdict.status, decisionAuthorityEvidence: verdict.evidence };
}

function buildResult(parsed: ParsedC6Response, source: ResponseSource): RunTicketConversionResult {
  return {
    sections: parsed.sections,
    source,
    ...toTicketAuthority(parsed.decisionAuthority, parsed.decisionAuthorityEvidence),
  };
}

/**
 * 🔴 이 스텝 자체는 cacheKey를 만들지 않는다 — `c1.ts`·`c2.ts`·`c4.ts`의 `NO_STEP_CACHE_KEY`와
 * 같은 이유(해당 파일들의 동명 상수 주석 참조).
 */
const NO_STEP_CACHE_KEY = '';

/**
 * C6 티켓 변환 스텝. `LLMClient`를 주입받는다(AC-028 — core는 구현을 모른다).
 * 🔴 `LLMClient.complete()`의 실패 계약(`llm/client.ts` 참조)을 그대로 따른다 — 폴백이 있으면
 * `source:'fallback'`으로 정상 반환되고, 없으면 `LLMUnavailableError`/`QuotaExceededError`가
 * 던져진다. 여기서 그 예외를 잡지 않는다(`docs/CodingRules.md` Error Handling "던지는 쪽 / 잡는 쪽").
 *
 * 🔴 step 레벨 스키마 검증 실패(JSON 파싱 실패 또는 4섹션·decisionAuthority 스키마 불만족)도
 * **오류보다 폴백 200이 우선**이다(`docs/API.md:48`, `c1.ts`·`c2.ts`·`c4.ts`와 동일 원칙) — 원
 * 응답이 스키마를 만족하지 못하면 던지기 전에 먼저 폴백을 조회한다.
 *
 * @throws {LLMMalformedResponseError} 응답과 폴백 모두 유효한 JSON이 아니거나 스키마를 만족하지
 *   않을 때.
 */
export async function runTicketConversion(
  input: RunTicketConversionInput,
  llm: LLMClient,
  deps: RunTicketConversionDeps = {},
): Promise<RunTicketConversionResult> {
  const fallbackLookup = deps.fallbackLookup ?? findFallbackResponse;
  const payload = buildC6Payload(input.text);
  const response = await llm.complete('c6', C6_PROMPT_VERSION, payload);

  const parsed = parseTicketConversion(response.content);
  if (parsed !== null) {
    return buildResult(parsed, response.source);
  }

  const fallback = fallbackLookup('c6', NO_STEP_CACHE_KEY);
  const fallbackParsed = fallback ? parseTicketConversion(fallback.content) : null;
  if (fallbackParsed !== null) {
    return buildResult(fallbackParsed, 'fallback');
  }

  throw new LLMMalformedResponseError(
    'C6 응답이 스키마 검증에 실패했고 폴백 응답도 없거나 유효하지 않습니다',
  );
}

/**
 * AC-058 — `POST /api/mediate`가 `ticketOption` 게이트(F1-a, `rules/ticket-gate.ts`의
 * `ticketOptionFrom()`이 소비하는 `TicketOptionBasis`)를 산출할 때 쓰는 **순수·결정적** 감정
 * 신호 판정. LLM을 호출하지 않는다(추가 호출 금지 — 이 파일 헤더 주석 참조) — 대조군
 * (`signal_absent`)과 감정형(`signal_present`)을 `docs/TestCases.md` T-E01~T-E04로 재현 가능하게
 * 유지하기 위한 설계 결정이다.
 *
 * 🔴 감정 점수·라벨을 만들지 않는다(`docs/adr/0005-c6-ticket-gate-field.md`의 배제 근거와 동일) —
 * 이 함수는 3값 enum만 반환하고, 그 값 자체도 응답 payload에 자연어로 노출되지 않는다
 * (`ticketOptionFrom`이 `basis`를 내부 상태로만 유지한다).
 *
 * `'undetermined'`는 판정 근거를 전혀 얻을 수 없는 퇴화 입력(공백뿐인 텍스트)에 대한 fail-closed
 * 값이다 — 정상 입력에서는 항상 `signal_present`/`signal_absent` 중 하나를 반환한다.
 *
 * @param text `POST /api/mediate`가 받은 변환 전 원문(`input.text`).
 */
export function assessEmotionalSignal(text: string): TicketOptionBasis {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return 'undetermined';
  }
  const haystack = trimmed.toLowerCase();
  const present = EMOTIONAL_SIGNAL_MARKERS.some((marker) => haystack.includes(marker));
  return present ? 'signal_present' : 'signal_absent';
}

/**
 * 🔴 `docs/TestCases.md` T-E01~T-E04에서 역산한 키워드 휴리스틱(구현 판단 — ADR-0005 Follow-up
 * #2가 "판정을 어디서 산출하는지는 구현 판단"이라 명시). 감정 강도(비난 톤·반복성 불만·좌절 표현)
 * 를 가리키는 표지 문구만 담는다 — 단순 정보 요청("확인 부탁드립니다" 류, T-E03 대조군)은 걸리지
 * 않아야 한다. 전부 소문자로 저장해 `assessEmotionalSignal`의 `toLowerCase()` 비교와 맞춘다.
 */
const EMOTIONAL_SIGNAL_MARKERS: readonly string[] = [
  // 한국어 — 좌절/불만/비난 표지.
  '답답',
  '짜증',
  '화가 나',
  '화나',
  '불만',
  '억울',
  '황당',
  '너무하',
  '어이없',
  '이해가 안',
  '한두 번',
  '한두번',
  '명백히',
  '그쪽 실수',
  '저번에도',
  '또 이러',
  // 영어 — 같은 축(좌절/반복성 비난)의 표지.
  'frustrat',
  'unacceptable',
  'ridiculous',
  'again and again',
  'not the first time',
  'clearly your fault',
  'annoying',
];
