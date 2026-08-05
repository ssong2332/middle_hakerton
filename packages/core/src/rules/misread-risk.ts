// 오해 사전 경고 — 3요소(quote/misreading/evidence)의 **스키마 검증** (AC-043).
// 담당: [BE-A] T10. `docs/Architecture.md` Folder Structure "rules/misread-risk.ts # AC-043".
//
// 🔴 산출 자체는 별도 LLM 호출이 아니라 C2 프롬프트(`prompts/c2.ts`)가 `steps/c2.ts`의 단일 호출
// 안에서 `preserved[]`·`transformed`와 함께 산출한다(Planning Decision #49). 이 파일은 그 산출물이
// `contract.ts`의 `MisreadRisk` 계약(3요소 전부 필수)을 지키는지 **검증만** 한다.
import { z } from 'zod';
import type { MisreadRisk } from '../contract';

/**
 * 🔴 3요소(quote/misreading/evidence) 중 하나라도 비어 있으면 "근거 없는 위험"이 통과한다
 * (`contract.ts` `MisreadRisk` 주석: "셋 중 하나라도 optional이면 근거 없는 위험이 타입을
 * 통과한다"). 전부 최소 1자를 강제한다.
 */
export const misreadRiskSchema = z.object({
  quote: z.string().min(1),
  misreading: z.string().min(1),
  evidence: z.string().min(1),
});

export const misreadRisksSchema = z.array(misreadRiskSchema);

/**
 * 원시 값을 `MisreadRisk[]`로 검증한다. 실패하면 `null` — 호출부(`steps/c2.ts`)가 폴백 순서를
 * 조립한다(`steps/c1.ts`·`c4.ts`와 같은 패턴).
 * 🔴 빈 배열 `[]`은 **유효한 값**이다(AC-043②) — 근거가 없으면 위험을 지어내지 않는다.
 */
export function parseMisreadRisks(raw: unknown): MisreadRisk[] | null {
  const parsed = misreadRisksSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
