// C7 결정사항 자동 요약 — 담당: [BE-B] T26.
// `docs/Architecture.md` Data Flow / `docs/API.md` "POST /api/summary"(UX-008/UF-005)
// AC-019, AC-020, AC-038, AC-050, AC-064②④.
//
// 🔴 이 파일은 `packages/core/src/steps/c6.ts`와 동일한 패턴을 따른다(`docs/Tasks.md` T7 원문 —
// "이것과 같은 패턴을 따라라"): LLMClient 주입, zod로 step 응답 최소 검증, 실패 시 폴백 조회 후
// 없으면 `LLMMalformedResponseError`.
//
// 🔴 결정 권한 판정은 C6와 같은 `resolveAuthority()`(`rules/decision-authority.ts`)를 재사용한다
// (Planning Decision #8, AC-064④) — 별도 판정 파이프라인을 만들지 않는다. 필드 이름은 C6와 달리
// `authorityStatus`/`authorityEvidence`이며 `decisions[]`의 항목마다(행별) 붙는다(AC-064③, 이름을
// `decisionAuthority`로 통합하지 않는 이유는 `contract.ts` `SummaryResult` JSDoc 참조).
//
// 🔴 미확정 감지(AC-038, `unresolved[]`)는 LLM에게 별도로 묻지 않고 이 스텝이 파싱된
// `decisions[]`에서 `owner`/`dueDate`가 `null`인 항목을 결정적으로 골라낸다 — LLM 왕복을 늘리지
// 않고(설계 판단, C6가 4섹션+권한을 한 번에 뽑는 것과 같은 이유) 동시에 "무엇이 비었는지"가
// `decisions[]`와 항상 일치하게 보장한다(별도 LLM 필드로 물으면 두 배열이 서로 어긋날 위험이
// 생긴다).
import { z } from 'zod';
import type { LLMClient } from '../llm/client';
import type {
  DecisionItem,
  ItemAuthority,
  ResponseSource,
  SummaryResult,
  UnresolvedItem,
} from '../contract';
import { LLMMalformedResponseError } from '../errors';
import { resolveAuthority, type DecisionAuthorityStatus } from '../rules/decision-authority';
import { buildC7Payload, C7_PROMPT_VERSION } from '../prompts/c7';
import { findFallbackResponse, type FallbackResponseEntry } from '../data/fallback-responses';

export interface RunDecisionSummaryInput {
  /** 요약할 대화 스레드 원문. */
  threadText: string;
}

export type RunDecisionSummaryResult = SummaryResult;

export interface RunDecisionSummaryDeps {
  /** 테스트 주입용. 기본값은 `findFallbackResponse`(`../data/fallback-responses`). */
  fallbackLookup?: (step: 'c7', cacheKey: string) => FallbackResponseEntry | undefined;
}

const decisionAuthorityStatusSchema = z.enum(['확정', '내부 승인 필요', '검토 중', '불명']);

const c7DecisionSchema = z.object({
  decision: z.string().min(1),
  // 🔴 근거 없는 담당자·기한을 지어내지 않는다(AC-020) — 스키마는 "비어 있지 않은 문자열이거나
  // null"까지만 강제하고, null 채우기 자체는 프롬프트의 책임이다.
  owner: z.string().min(1).nullable(),
  dueDate: z.string().min(1).nullable(),
  authorityStatus: decisionAuthorityStatusSchema,
  authorityEvidence: z.string().min(1).nullable(),
});

const c7ResponseSchema = z.object({
  // 🔴 AC-020/AC-038 — 결정사항이 없는 스레드는 빈 배열이 정상값이다(오류가 아니다).
  decisions: z.array(c7DecisionSchema),
});

type ParsedC7Response = z.infer<typeof c7ResponseSchema>;
type ParsedC7Decision = z.infer<typeof c7DecisionSchema>;

/**
 * `response.content`(또는 폴백 항목의 `content`)를 C7 스키마로 파싱한다. 실패하면 `null`
 * — 실패 시 던지지 않는 이유는 `c6.ts`의 동명 함수와 같다: 호출부가 "원 응답 실패 → 폴백 조회 →
 * 폴백도 실패하면 던지기" 순서를 조립해야 한다.
 */
function parseDecisionSummary(content: string): ParsedC7Response | null {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }
  const parsed = c7ResponseSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * 🔴 `resolveAuthority()`(F1-c 불변식 2의 유일한 통로)의 `AuthorityVerdict`(`status`/`evidence`)를
 * `DecisionItem`이 쓰는 필드 이름(`authorityStatus`/`authorityEvidence`)으로 옮겨 담는다
 * (AC-064③ — C6의 `toTicketAuthority()`와 짝을 이루되 필드 이름만 다르다). 짝을 손으로 조립하지
 * 않는다 — `resolveAuthority()`가 이미 확정한 판별(`status === '불명'`)을 그대로 좁혀서 옮길
 * 뿐이다(`docs/Architecture.md` Conventions 13).
 */
function toItemAuthority(status: DecisionAuthorityStatus, evidence: string | null): ItemAuthority {
  const verdict = resolveAuthority(status, evidence);
  if (verdict.status === '불명') {
    return { authorityStatus: '불명', authorityEvidence: verdict.evidence };
  }
  return { authorityStatus: verdict.status, authorityEvidence: verdict.evidence };
}

function toDecisionItem(parsed: ParsedC7Decision): DecisionItem {
  return {
    decision: parsed.decision,
    owner: parsed.owner,
    dueDate: parsed.dueDate,
    ...toItemAuthority(parsed.authorityStatus, parsed.authorityEvidence),
  };
}

/** 어떤 필드가 비었는지(AC-038) — `owner`/`dueDate`가 `null`인 필드만 담는다. */
function missingFieldsFor(item: DecisionItem): ('owner' | 'dueDate')[] {
  const missing: ('owner' | 'dueDate')[] = [];
  if (item.owner === null) missing.push('owner');
  if (item.dueDate === null) missing.push('dueDate');
  return missing;
}

/**
 * 🔴 AC-038 — 파싱된 `decisions[]`에서 담당자·기한이 하나라도 비어 있는 항목만 골라낸다(이 파일
 * 헤더 주석 "미확정 감지" 참조). LLM에게 별도로 묻지 않는다.
 */
function toUnresolved(decisions: DecisionItem[]): UnresolvedItem[] {
  return decisions
    .map((item) => ({ decision: item.decision, missingFields: missingFieldsFor(item) }))
    .filter((item) => item.missingFields.length > 0);
}

function buildResult(parsed: ParsedC7Response, source: ResponseSource): RunDecisionSummaryResult {
  const decisions = parsed.decisions.map(toDecisionItem);
  return {
    decisions,
    unresolved: toUnresolved(decisions),
    source,
  };
}

/**
 * 🔴 이 스텝 자체는 cacheKey를 만들지 않는다 — `c1.ts`·`c2.ts`·`c4.ts`·`c6.ts`의
 * `NO_STEP_CACHE_KEY`와 같은 이유(해당 파일들의 동명 상수 주석 참조).
 */
const NO_STEP_CACHE_KEY = '';

/**
 * C7 결정사항 요약 스텝. `LLMClient`를 주입받는다(AC-028 — core는 구현을 모른다).
 * 🔴 `LLMClient.complete()`의 실패 계약(`llm/client.ts` 참조)을 그대로 따른다 — 폴백이 있으면
 * `source:'fallback'`으로 정상 반환되고, 없으면 `LLMUnavailableError`/`QuotaExceededError`가
 * 던져진다. 여기서 그 예외를 잡지 않는다(`docs/CodingRules.md` Error Handling "던지는 쪽 / 잡는 쪽").
 *
 * 🔴 step 레벨 스키마 검증 실패(JSON 파싱 실패 또는 decisions·authorityStatus 스키마 불만족)도
 * **오류보다 폴백 200이 우선**이다(`docs/API.md:48`, `c1.ts`·`c2.ts`·`c4.ts`·`c6.ts`와 동일 원칙)
 * — 원 응답이 스키마를 만족하지 못하면 던지기 전에 먼저 폴백을 조회한다.
 *
 * @throws {LLMMalformedResponseError} 응답과 폴백 모두 유효한 JSON이 아니거나 스키마를 만족하지
 *   않을 때.
 */
export async function runDecisionSummary(
  input: RunDecisionSummaryInput,
  llm: LLMClient,
  deps: RunDecisionSummaryDeps = {},
): Promise<RunDecisionSummaryResult> {
  const fallbackLookup = deps.fallbackLookup ?? findFallbackResponse;
  const payload = buildC7Payload(input.threadText);
  const response = await llm.complete('c7', C7_PROMPT_VERSION, payload);

  const parsed = parseDecisionSummary(response.content);
  if (parsed !== null) {
    return buildResult(parsed, response.source);
  }

  const fallback = fallbackLookup('c7', NO_STEP_CACHE_KEY);
  const fallbackParsed = fallback ? parseDecisionSummary(fallback.content) : null;
  if (fallbackParsed !== null) {
    return buildResult(fallbackParsed, 'fallback');
  }

  throw new LLMMalformedResponseError(
    'C7 응답이 스키마 검증에 실패했고 폴백 응답도 없거나 유효하지 않습니다',
  );
}
