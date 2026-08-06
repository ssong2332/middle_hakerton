// C2 보존 필터 — 마감일·수치·필수 액션 항목의 **스키마 검증** (AC-006/007).
// 담당: [BE-A] T10. `docs/Architecture.md` Folder Structure "rules/preservation.ts # C2 보존 필터".
//
// 🔴 추출 자체는 별도 LLM 호출이 아니라 C2 프롬프트(`prompts/c2.ts`)가 `steps/c2.ts`의 단일 호출
// 안에서 함께 산출한다(`docs/Architecture.md` Data Flow ⑥ "한 번의 LLM 호출로 ... preserved ...
// 함께 산출"). 이 파일은 그 산출물이 `contract.ts`의 `PreservedItem` 계약을 지키는지 **검증만**
// 한다 — LLM이 돌려준 원시 JSON을 신뢰하고 그대로 쓰기 전에 통과시켜야 하는 문 하나다.
import { z } from 'zod';
import type { PreservedItem } from '../contract';

/**
 * 🔴 빈 문자열은 "보존 실패"를 성공으로 위장한다 — `sourceText`·`transformedText` 모두 최소 1자를
 * 강제한다(`contract.ts` `PreservedItem` 주석: "빈 문자열을 넣으면 `preserved.length`로 보존
 * 건수를 세는 검증이 누락을 성공으로 집계한다").
 */
export const preservedItemSchema = z.object({
  kind: z.enum(['deadline', 'number', 'action']),
  sourceText: z.string().min(1),
  transformedText: z.string().min(1),
});

export const preservedItemsSchema = z.array(preservedItemSchema);

/**
 * 원시 값을 `PreservedItem[]`로 검증한다. 실패하면 `null` — 호출부(`steps/c2.ts`)가 "원 응답 실패
 * → 폴백 조회 → 폴백도 실패하면 던지기" 순서를 조립한다(`steps/c1.ts`·`c4.ts`와 같은 패턴).
 * 🔴 빈 배열 `[]`은 **유효한 값**이다 — 원문에 보존 대상이 없으면 정상적으로 통과한다.
 */
export function parsePreservedItems(raw: unknown): PreservedItem[] | null {
  const parsed = preservedItemsSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
