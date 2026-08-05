// AC-041 사전 준비 데모 폴백 응답.
// `docs/Architecture.md` Data Flow "2) LLM 호출 3단 해석" ③ - 실패/상한초과/크레딧 소진 시
// `cacheKey` 일치분을 우선 조회하고, 없으면 해당 step의 시나리오 기본값(cacheKey 없는 항목)을 쓴다.
// `docs/DECISIONS.md` #11 - TestCases.md/DemoScript.md 시연 입력과 동일 cacheKey로 미리 계산해 담는다.
//
// 🔴 T4는 조회 메커니즘만 만든다. 실 데모 데이터(TestCases.md/DemoScript.md 시연 입력에 맞춘
// 항목)는 각 스텝의 프롬프트가 확정된 뒤 T16(API 실패·크레딧 소진 시 폴백 UI)이 채운다 —
// 지금 채우면 아직 없는 PROMPT_VERSION·cacheKey를 추측으로 만드는 것이 된다(Error Handling
// "없는 값을 지어내지 않는다").
import type { LLMStep } from '../llm/client';

export interface FallbackResponseEntry {
  /** 특정 cacheKey와 정확히 일치할 때만 쓰는 폴백(TestCases.md/DemoScript.md 시연 입력 전용). */
  cacheKey?: string;
  step: LLMStep;
  /** `LLMResponse.content`에 그대로 들어갈 원문 텍스트. */
  content: string;
}

export const FALLBACK_RESPONSES: FallbackResponseEntry[] = [];

/**
 * cacheKey 정확 일치를 우선하고, 없으면 같은 step의 시나리오 기본값(cacheKey 없는 항목)을 쓴다.
 * 아무것도 없으면 `undefined` - 호출자(`apps/web/lib/llm/openai.ts`)가 원인에 따라
 * `LLMUnavailableError`(실제 호출 실패) 또는 `QuotaExceededError`(요청 상한 초과)를 던진다
 * (`packages/core/src/llm/client.ts` `LLMClient` 실패 계약 — 2026-08-04 원인별로 분리).
 */
export function findFallbackResponse(
  step: LLMStep,
  cacheKey: string,
  entries: readonly FallbackResponseEntry[] = FALLBACK_RESPONSES,
): FallbackResponseEntry | undefined {
  const exact = entries.find((entry) => entry.cacheKey === cacheKey);
  if (exact) return exact;
  return entries.find((entry) => entry.step === step && entry.cacheKey === undefined);
}
