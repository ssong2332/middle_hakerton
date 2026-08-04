// C4 역번역 — 변환문을 원어로 되돌려 발신자가 스스로 검증할 수 있게 한다(AC-001).
// 담당: [BE-B] T5. `docs/Architecture.md` Data Flow ⑦ "C4 역번역 ─── backTranslation".
//
// 🔴 이 함수는 C2(T10)가 만드는 "변환문"을 받는 것을 전제로 설계됐다. C2가 아직 없는 시점
// (M1, T5)에는 호출부(Route Handler)가 원문을 그대로 넘길 수 있다 — 그 경우 이 함수는 그
// 텍스트를 있는 그대로 역번역을 시도할 뿐이며 "톤 변환 손실이 없다"를 주장하지 않는다. 호출부의
// 임시 배선은 `apps/web/app/api/mediate/route.ts` 주석을 참고.
import { z } from 'zod';
import type { LLMClient } from '../llm/client';
import type { LanguageCode, ResponseSource } from '../contract';
import { LLMMalformedResponseError } from '../errors';
import { C4_PROMPT_VERSION, buildC4Payload } from '../prompts/c4';
import { findFallbackResponse, type FallbackResponseEntry } from '../data/fallback-responses';

export interface BackTranslateInput {
  /** 역번역할 텍스트 — 정상 입력은 C2 변환 결과(`transformed`)다. */
  text: string;
  /** 역번역 결과가 나와야 할 언어 — 발신자의 원문 언어(AC-001 "원문과 나란히"). */
  targetLanguage: LanguageCode;
}

export interface BackTranslateResult {
  backTranslation: string;
  source: ResponseSource;
}

export interface RunBackTranslationDeps {
  /** 테스트 주입용. 기본값은 `findFallbackResponse`(`../data/fallback-responses`). */
  fallbackLookup?: (step: 'c4', cacheKey: string) => FallbackResponseEntry | undefined;
}

const c4ResponseSchema = z.object({
  // 🔴 없는 값을 지어내지 않는다 — 빈 문자열은 "역번역 결과 없음"이며 유효한 값이 아니다.
  backTranslation: z.string().min(1),
});

/**
 * `response.content`(또는 폴백 항목의 `content`)를 C4 스키마로 파싱한다. 실패하면 `null`
 * — 실패 시 던지지 않는 이유는 호출부가 "원 응답 실패 → 폴백 조회 → 폴백도 실패하면 던지기"
 * 순서를 조립해야 하기 때문이다(Major 1).
 */
function parseBackTranslation(content: string): string | null {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }
  const parsed = c4ResponseSchema.safeParse(raw);
  return parsed.success ? parsed.data.backTranslation : null;
}

/**
 * 🔴 이 스텝 자체는 cacheKey를 만들지 않는다 — 캐시 키는 `apps/web/lib/llm/cache-key.ts`가
 * `model`까지 포함해 만들고, 그 값은 `LLMResponse`에 실려 오지 않는다
 * (`packages/core/src/llm/client.ts` 참조). 데모 전용 exact-key 폴백 항목(`cacheKey` 필드가 있는
 * 항목)은 이미 `apps/web/lib/llm/openai.ts`의 LLMClient 레벨 폴백에서 처리된다 — 이 스텝에
 * 도달했다는 것은 이미 `{source:'live'|'cache'|'fallback'}` 응답을 받았는데 그 content가
 * step 스키마를 만족하지 못했다는 뜻이므로, 여기서는 항상 해당 step의 시나리오 기본값
 * (`cacheKey` 없는 항목)만 필요하다. 빈 문자열은 어떤 exact-key 항목과도 일치하지 않으므로
 * `findFallbackResponse`가 그 기본값으로 강등한다(`fallback-responses.test.ts` "정확히 일치하는
 * cacheKey가 없으면 시나리오 기본값을 반환한다"로 검증된 동작).
 */
const NO_STEP_CACHE_KEY = '';

/**
 * C4 역번역 스텝. `LLMClient`를 주입받는다(AC-028 — core는 구현을 모른다).
 * 🔴 `LLMClient.complete()`의 실패 계약(`llm/client.ts` 참조)을 그대로 따른다 — 폴백이 있으면
 * `source:'fallback'`으로 정상 반환되고, 없으면 `LLMUnavailableError`/`QuotaExceededError`가
 * 던져진다. 여기서 그 예외를 잡지 않는다(`docs/CodingRules.md` Error Handling "던지는 쪽 / 잡는 쪽").
 *
 * 🔴 Major 1(reviewer REJECTED → 수정) — step 레벨 스키마 검증 실패(JSON 파싱 실패 또는
 * `{ backTranslation: string }` 불만족)도 **오류보다 폴백 200이 우선**이다(`docs/API.md:48`
 * "LLM 계열은 오류 응답보다 폴백 200이 우선이다", `docs/Architecture.md` Error Handling
 * "LLM_MALFORMED → 폴백 경로 먼저 시도"). 이전에는 `apps/web/lib/llm/openai.ts`의 step-agnostic
 * 검증(JSON 파싱 가능 여부)만 통과하면 곧장 이 스텝의 필드 검증으로 넘어갔고, 여기서 실패하면
 * `findFallbackResponse()`를 부르지 않고 바로 던져 502로 직행했다 — 그 gap을 없앤다.
 *
 * @throws {LLMMalformedResponseError} 응답과 폴백 모두 유효한 JSON이 아니거나
 *   `{ backTranslation: string }` 스키마를 만족하지 않을 때. `apps/web/lib/llm/openai.ts`의
 *   step-agnostic 검증은 "JSON으로 파싱 가능한가"까지만 보므로, step별 필드 의미 검증은 이
 *   스텝이 소유한다.
 */
export async function runBackTranslation(
  input: BackTranslateInput,
  llm: LLMClient,
  deps: RunBackTranslationDeps = {},
): Promise<BackTranslateResult> {
  const fallbackLookup = deps.fallbackLookup ?? findFallbackResponse;
  const payload = buildC4Payload(input.text, input.targetLanguage);
  const response = await llm.complete('c4', C4_PROMPT_VERSION, payload);

  const backTranslation = parseBackTranslation(response.content);
  if (backTranslation !== null) {
    return { backTranslation, source: response.source };
  }

  // 🔴 Major 1 — 원 응답이 step 스키마를 만족하지 못했다. 던지기 전에 폴백을 먼저 조회한다.
  const fallback = fallbackLookup('c4', NO_STEP_CACHE_KEY);
  const fallbackBackTranslation = fallback ? parseBackTranslation(fallback.content) : null;
  if (fallbackBackTranslation !== null) {
    return { backTranslation: fallbackBackTranslation, source: 'fallback' };
  }

  throw new LLMMalformedResponseError(
    'C4 응답이 스키마 검증에 실패했고 폴백 응답도 없거나 유효하지 않습니다',
  );
}
