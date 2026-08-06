// C1 긴급도 분류 — 입력 메시지의 긴급도를 CRITICAL/NORMAL/LOW 3단계로 판정하고 판단 근거
// 문장을 반환한다(AC-003). 담당: [BE-A] T7. `docs/Architecture.md` Data Flow ① "C1 분류".
//
// 🔴 이 파일은 `packages/core/src/steps/c4.ts`(T5, runBackTranslation)와 동일한 패턴을 따른다
// (`docs/Tasks.md` T7 원문 — "이것과 같은 패턴을 따라라"): LLMClient 주입, zod로 step 응답
// 최소 검증, 실패 시 폴백 조회 후 없으면 `LLMMalformedResponseError`.
import { z } from 'zod';
import type { LLMClient } from '../llm/client';
import type { ResponseSource, UrgencyLevel } from '../contract';
import { LLMMalformedResponseError } from '../errors';
import { C1_PROMPT_VERSION, buildC1Payload } from '../prompts/c1';
import { findFallbackResponse, type FallbackResponseEntry } from '../data/fallback-responses';

export interface ClassifyUrgencyInput {
  /** 긴급도를 판정할 원문. */
  text: string;
}

export interface ClassifyUrgencyResult {
  urgency: UrgencyLevel;
  /** 그 등급으로 판정한 근거 문장(AC-003) — 사용자가 override할 판단 재료다(`contract.ts` 주석). */
  reason: string;
  source: ResponseSource;
}

export interface RunUrgencyClassificationDeps {
  /** 테스트 주입용. 기본값은 `findFallbackResponse`(`../data/fallback-responses`). */
  fallbackLookup?: (step: 'c1', cacheKey: string) => FallbackResponseEntry | undefined;
}

const c1ResponseSchema = z.object({
  urgency: z.enum(['CRITICAL', 'NORMAL', 'LOW']),
  // 🔴 없는 값을 지어내지 않는다 — 빈 문자열은 "근거 없음"이며 유효한 값이 아니다(AC-003).
  reason: z.string().min(1),
});

/**
 * `response.content`(또는 폴백 항목의 `content`)를 C1 스키마로 파싱한다. 실패하면 `null`
 * — 실패 시 던지지 않는 이유는 `c4.ts`의 `parseBackTranslation`과 같다: 호출부가 "원 응답 실패
 * → 폴백 조회 → 폴백도 실패하면 던지기" 순서를 조립해야 한다.
 */
function parseUrgencyClassification(
  content: string,
): { urgency: UrgencyLevel; reason: string } | null {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }
  const parsed = c1ResponseSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * 🔴 `c4.ts`의 `NO_STEP_CACHE_KEY`와 같은 이유 — 이 스텝은 cacheKey를 만들지 않는다. 데모 전용
 * exact-key 폴백 항목은 이미 `apps/web/lib/llm/openai.ts`의 LLMClient 레벨에서 처리되므로,
 * 여기 도달했다는 것은 시나리오 기본값(cacheKey 없는 항목)만 필요하다는 뜻이다.
 */
const NO_STEP_CACHE_KEY = '';

/**
 * C1 긴급도 분류 스텝. `LLMClient`를 주입받는다(AC-028 — core는 구현을 모른다).
 * 🔴 `LLMClient.complete()`의 실패 계약(`llm/client.ts` 참조)을 그대로 따른다 — 폴백이 있으면
 * `source:'fallback'`으로 정상 반환되고, 없으면 `LLMUnavailableError`/`QuotaExceededError`가
 * 던져진다. 여기서 그 예외를 잡지 않는다(`docs/CodingRules.md` Error Handling "던지는 쪽 / 잡는 쪽").
 *
 * 🔴 step 레벨 스키마 검증 실패(JSON 파싱 실패 또는 `{urgency, reason}` 불만족)도 **오류보다
 * 폴백 200이 우선**이다(`docs/API.md:48`, `c4.ts`의 Major 1과 동일 원칙) — 원 응답이 스키마를
 * 만족하지 못하면 던지기 전에 먼저 폴백을 조회한다.
 *
 * @throws {LLMMalformedResponseError} 응답과 폴백 모두 유효한 JSON이 아니거나
 *   `{ urgency: 'CRITICAL'|'NORMAL'|'LOW', reason: string }` 스키마를 만족하지 않을 때.
 */
export async function runUrgencyClassification(
  input: ClassifyUrgencyInput,
  llm: LLMClient,
  deps: RunUrgencyClassificationDeps = {},
): Promise<ClassifyUrgencyResult> {
  const fallbackLookup = deps.fallbackLookup ?? findFallbackResponse;
  const payload = buildC1Payload(input.text);
  const response = await llm.complete('c1', C1_PROMPT_VERSION, payload);

  const parsed = parseUrgencyClassification(response.content);
  if (parsed !== null) {
    return { ...parsed, source: response.source };
  }

  const fallback = fallbackLookup('c1', NO_STEP_CACHE_KEY);
  const fallbackParsed = fallback ? parseUrgencyClassification(fallback.content) : null;
  if (fallbackParsed !== null) {
    return { ...fallbackParsed, source: 'fallback' };
  }

  throw new LLMMalformedResponseError(
    'C1 응답이 스키마 검증에 실패했고 폴백 응답도 없거나 유효하지 않습니다',
  );
}
