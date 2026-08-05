// C2 톤 변환 + 보존 필터 + 오해 사전 경고 — 보존 대상(마감일·수치·필수 액션)을 먼저 추출해
// 고정한 뒤 톤만 변환하고, 같은 호출 안에서 오해 사전 경고(`misreadRisks[]`)를 함께 산출한다
// (AC-006/007/043). 담당: [BE-A] T10. `docs/Architecture.md` Data Flow ⑥.
//
// 🔴 이 파일은 `packages/core/src/steps/c1.ts`·`c4.ts`와 동일한 패턴을 따른다(`docs/Tasks.md` T7
// 원문 — "이것과 같은 패턴을 따라라"가 T10에도 그대로 적용된다): LLMClient 주입, zod로 step 응답
// 최소 검증(스키마는 `rules/preservation.ts`·`rules/misread-risk.ts`에서 가져온다), 실패 시 폴백
// 조회 후 없으면 `LLMMalformedResponseError`.
import { z } from 'zod';
import type { LLMClient } from '../llm/client';
import type { LanguageDirection, MisreadRisk, PreservedItem, ResponseSource } from '../contract';
import { LLMMalformedResponseError } from '../errors';
import {
  buildC2Payload,
  C2_PROMPT_VERSION,
  DEFAULT_HONORIFIC_LEVEL,
  type HonorificLevel,
} from '../prompts/c2';
import { preservedItemsSchema } from '../rules/preservation';
import { misreadRisksSchema } from '../rules/misread-risk';
import { findFallbackResponse, type FallbackResponseEntry } from '../data/fallback-responses';

export interface RunToneTransformInput {
  /** 톤 변환할 원문. */
  text: string;
  /** 변환 방향. ko-en이면 AC-045 규칙, en-ko이면 AC-046 규칙이 프롬프트에 실린다. */
  languageDirection: LanguageDirection;
  /**
   * 🔴 발신자 C3 프로필의 존댓말 레벨(`sender.profile.honorificLevel`, `contract.ts`). ko-en
   * 방향에서는 프롬프트가 이 값을 쓰지 않는다(영어 출력에는 합쇼체/해요체 구분이 없다).
   *
   * ## 🔴 쌍방 규약(#24 `PairProtocol`) 우선 규칙(AC-046②)을 구현하지 않은 이유
   * AC-046②는 "적용 레벨은 C3 프로필을 따르되, 해당 상대의 쌍방 규약이 있으면 규약이
   * 우선한다"를 요구한다(Planning Decision #26). 그런데 2026-08-05 measured로
   * `docs/Database.md` `pair_protocols`의 4축(`directness_allowed`/`emoji_policy`/
   * `address_form`/`deadline_style`)과 `packages/core/src/contract.ts`의 `PairProtocol`
   * 인터페이스 어디에도 **존댓말 레벨에 대응하는 축이 없다**(두 파일 전체 grep, "honorific"·
   * "존댓말" 매치 0건). AC-046②가 요구하는 "규약 우선"은 **규약 스키마 자체에 그 축이 아직
   * 설계되지 않아 지금은 표현이 불가능**하다 — T19(C3 온보딩)·T41/T42(#24 규약 UI)가 `todo`라서가
   * 아니라, 그 셋이 전부 `done`이 되어도 지금 스키마로는 이 값을 나를 자리가 없다는 것이 더
   * 근본적인 원인이다(architect 소관 — 규약에 5번째 축을 추가하는 것은 스키마 변경이며 T10의
   * 권한 밖이다).
   *
   * **판단**: 이 함수는 프로필 값만 입력받는다. 프로필도 비어 있으면(`null`) `DEFAULT_HONORIFIC_LEVEL`
   * (`prompts/c2.ts`)을 쓴다 — 이것은 "빈 프로필을 추측으로 채우는" AC-059 위반이 아니다: 발신자의
   * 개인 성향을 지어내는 것이 아니라, AC-046①("한 메시지 안의 혼용 0건")이 개인화 여부와 무관하게
   * 항상 요구하는 **출력 레지스터의 기본값**이다. 규약에 존댓말 축이 추가되면(별도 architect
   * 결정) 이 함수에 override 파라미터를 추가한다.
   */
  honorificLevel: HonorificLevel | null;
}

export interface RunToneTransformResult {
  transformed: string;
  /** 변환 이유 1건(`MediationResult.reason`, AC-008). */
  reason: string;
  preserved: PreservedItem[];
  misreadRisks: MisreadRisk[];
  source: ResponseSource;
}

export interface RunToneTransformDeps {
  /** 테스트 주입용. 기본값은 `findFallbackResponse`(`../data/fallback-responses`). */
  fallbackLookup?: (step: 'c2', cacheKey: string) => FallbackResponseEntry | undefined;
}

const c2ResponseSchema = z.object({
  // 🔴 없는 값을 지어내지 않는다 — 빈 문자열은 "변환 결과 없음"이며 유효한 값이 아니다.
  transformed: z.string().min(1),
  reason: z.string().min(1),
  preserved: preservedItemsSchema,
  misreadRisks: misreadRisksSchema,
});

type ParsedC2Response = Omit<RunToneTransformResult, 'source'>;

/**
 * `response.content`(또는 폴백 항목의 `content`)를 C2 스키마로 파싱한다. 실패하면 `null`
 * — 실패 시 던지지 않는 이유는 `c1.ts`·`c4.ts`의 동명 함수와 같다: 호출부가 "원 응답 실패 →
 * 폴백 조회 → 폴백도 실패하면 던지기" 순서를 조립해야 한다.
 */
function parseToneTransform(content: string): ParsedC2Response | null {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }
  const parsed = c2ResponseSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * 🔴 `c1.ts`·`c4.ts`의 `NO_STEP_CACHE_KEY`와 같은 이유 — 이 스텝은 cacheKey를 만들지 않는다.
 * 데모 전용 exact-key 폴백 항목은 이미 `apps/web/lib/llm/openai.ts`의 LLMClient 레벨에서
 * 처리되므로, 여기 도달했다는 것은 시나리오 기본값(cacheKey 없는 항목)만 필요하다는 뜻이다.
 */
const NO_STEP_CACHE_KEY = '';

/**
 * C2 톤 변환 스텝. `LLMClient`를 주입받는다(AC-028 — core는 구현을 모른다).
 * 🔴 `LLMClient.complete()`의 실패 계약(`llm/client.ts` 참조)을 그대로 따른다 — 폴백이 있으면
 * `source:'fallback'`으로 정상 반환되고, 없으면 `LLMUnavailableError`/`QuotaExceededError`가
 * 던져진다. 여기서 그 예외를 잡지 않는다(`docs/CodingRules.md` Error Handling "던지는 쪽 / 잡는 쪽").
 *
 * 🔴 step 레벨 스키마 검증 실패(JSON 파싱 실패 또는 `{transformed, reason, preserved,
 * misreadRisks}` 불만족)도 **오류보다 폴백 200이 우선**이다(`docs/API.md:48`, `c1.ts`·`c4.ts`의
 * Major 1과 동일 원칙) — 원 응답이 스키마를 만족하지 못하면 던지기 전에 먼저 폴백을 조회한다.
 *
 * 🔴 **추가 LLM 호출을 만들지 않는다** — `preserved[]`·`misreadRisks[]`는 `transformed`·`reason`과
 * 같은 응답 안에서 함께 파싱된다(NFR 체감 5초 + 크레딧 제약, `docs/Architecture.md` Data Flow ⑥).
 *
 * @throws {LLMMalformedResponseError} 응답과 폴백 모두 유효한 JSON이 아니거나
 *   `{ transformed: string, reason: string, preserved: PreservedItem[], misreadRisks: MisreadRisk[] }`
 *   스키마를 만족하지 않을 때.
 */
export async function runToneTransform(
  input: RunToneTransformInput,
  llm: LLMClient,
  deps: RunToneTransformDeps = {},
): Promise<RunToneTransformResult> {
  const fallbackLookup = deps.fallbackLookup ?? findFallbackResponse;
  const honorificLevel = input.honorificLevel ?? DEFAULT_HONORIFIC_LEVEL;
  const payload = buildC2Payload(input.text, input.languageDirection, honorificLevel);
  const response = await llm.complete('c2', C2_PROMPT_VERSION, payload);

  const parsed = parseToneTransform(response.content);
  if (parsed !== null) {
    return { ...parsed, source: response.source };
  }

  const fallback = fallbackLookup('c2', NO_STEP_CACHE_KEY);
  const fallbackParsed = fallback ? parseToneTransform(fallback.content) : null;
  if (fallbackParsed !== null) {
    return { ...fallbackParsed, source: 'fallback' };
  }

  throw new LLMMalformedResponseError(
    'C2 응답이 스키마 검증에 실패했고 폴백 응답도 없거나 유효하지 않습니다',
  );
}
