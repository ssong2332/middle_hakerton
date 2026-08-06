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
import type { DictionaryEntry } from '../pipeline';
import { LLMMalformedResponseError } from '../errors';
import { buildC2Payload, C2_PROMPT_VERSION, type HonorificLevel } from '../prompts/c2';
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
   * 인터페이스 어디에도 **존댓말 레벨에 대응하는 축이 없다**(`PairProtocol` 인터페이스
   * `contract.ts:124~133`과 `pair_protocols` 표 `Database.md:133~145` 범위에서 "honorific"·
   * "존댓말" 매치 0건 — 🔴 2026-08-05 정정: 이전 버전은 "두 파일 전체 grep, 매치 0건"이라
   * 적었으나 사실과 다르다. 파일 전체로는 `contract.ts` 5건(`honorificLevel` 필드·
   * `honorificLevelMixed` 등), `Database.md` 3건(`honorific_level`·`ko_honorific`·
   * `en_honorific`, 모두 위 두 범위 밖)이 있다 — 결론(규약에 존댓말 축 없음)은 그대로 맞지만
   * 인용 수치가 틀렸었다). AC-046②가 요구하는 "규약 우선"은 **규약 스키마 자체에 그 축이 아직
   * 설계되지 않아 지금은 표현이 불가능**하다 — T19(C3 온보딩)·T41/T42(#24 규약 UI)가 `todo`라서가
   * 아니라, 그 셋이 전부 `done`이 되어도 지금 스키마로는 이 값을 나를 자리가 없다는 것이 더
   * 근본적인 원인이다(architect 소관 — 규약에 5번째 축을 추가하는 것은 스키마 변경이며 T10의
   * 권한 밖이다).
   *
   * **판단**: 이 함수는 프로필 값만 입력받는다. 프로필도 비어 있으면(`null`) 기본값을 채우지 않고
   * `null`을 그대로 `buildC2Payload`에 전달한다 — 기본값을 채우면 "프로필 없음"과 "프로필=특정값"의
   * payload가 같아져 캐시 키가 두 상태를 구분하지 못하게 된다. 판정 근거와 절차의 단일 출처는
   * `docs/Architecture.md` Data Flow **1-a**, `docs/DECISIONS.md` #39·#40,
   * `docs/adr/0007-honorific-level-resolution-boundary.md`다.
   */
  honorificLevel: HonorificLevel | null;
  /**
   * 🔴 QA 정적 분석 후속 — 호출 시점의 기준일(ISO, `YYYY-MM-DD`). `buildC2Payload`가 여기서
   * 연도만 뽑아 payload에 싣는다(`prompts/c2.ts` `C2Payload.referenceYear` 주석 — 원문에 연도가
   * 없는 날짜(`8월 12일`, `8/8` 등)를 모델이 지어내지 않고 채울 수 있게 하는 값이자, 캐시 키
   * 무효화를 연 단위로 제한하는 설계 결정). 이 필드에 기본값을 채우지 않는다(`honorificLevel`과
   * 같은 이유는 아니다 — 이 값은 "없을 수 있는 값"이 아니라 호출자가 항상 아는 서버 현재 시각이라
   * 지어냄의 대상이 아니다. 다만 core가 시스템 시계를 직접 읽지 않는다는 기존 관례(core는 부수효과를
   * 만들지 않는다, `docs/Architecture.md` Conventions 11 "DB 조회물은 core 밖에서 조회")에 맞춰
   * 호출자(`apps/web/app/api/mediate/route.ts`)가 `new Date()`로 만들어 넘긴다.
   */
  referenceDate: string;
  /**
   * 🔴 T22 — C5 용어사전(`deps.data.dictionary`). core는 조회하지 않고 호출자가 이미 조회를
   * 마친 값을 그대로 받는다(AC-028). 생략하면 `[]`(사전 없음과 동치, `MediationData.dictionary`
   * 주석 "비어 있으면 [] 가 정상 상태") — 기본값을 둔 이유는 `buildC2Payload`와 같다(이 필드와
   * 무관한 기존 테스트 다수를 깨지 않기 위함, `prompts/c2.ts` `buildC2Payload` JSDoc 참조).
   */
  dictionary?: DictionaryEntry[];
}

export interface RunToneTransformResult {
  transformed: string;
  /** 변환 이유 1건(`MediationResult.reason`, AC-008). */
  reason: string;
  preserved: PreservedItem[];
  misreadRisks: MisreadRisk[];
  /**
   * 🔴 T22 — AC-047②. 등록되지 않은 인물의 호칭/직급을 LLM이 원문 그대로 유지하며 자기신고한
   * 목록(`prompts/c2.ts` `dictionaryRules()`의 `unregisteredHonorifics` 필드). 호출부
   * (`apps/web/app/api/mediate/route.ts`)가 이 값을 `honorificNotRegisteredWarnings()`
   * (`rules/honorific.ts`)에 넘겨 `MediationResult.warnings[]`의 `honorificNotRegistered` 항목을
   * 만든다. 이 스텝 자신은 `Warning`(계약 타입)을 조립하지 않는다 — `honorificMixedWarning`이
   * 이미 스텝 밖(route.ts)에서 조립되는 것과 같은 경계다.
   */
  unregisteredHonorifics: string[];
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
  // 🔴 T22 — AC-047②. `.optional().default([])`인 이유: `packages/core/src/data/fallback-responses.ts`
  // 의 c2 폴백 콘텐츠와 이 스텝의 기존 테스트(`c2.test.ts`) 다수가 이 필드 없이 만들어진 JSON을
  // 그대로 쓴다 — 필드를 필수로 두면 그 데이터·테스트가 전부 "스키마 검증 실패"로 깨진다. 없는
  // 값을 지어내지 않는다는 원칙과 상충하지 않는다 — 필드 자체가 없을 때의 기본값은 "0건 보고"이며,
  // 이는 "사전에 없는 인물의 호칭이 하나도 없었다"는 것과 동치이지 근거 없는 주장을 만드는 게 아니다.
  unregisteredHonorifics: z.array(z.string()).optional().default([]),
});

type ParsedC2Response = Omit<RunToneTransformResult, 'source'>;

/**
 * 🔴 reviewer 후속 Major 3 — `preserved[]`는 LLM의 자기신고이며 스키마 검증(`c2ResponseSchema`)은
 * 각 항목의 형태(`kind`/`sourceText`/`transformedText`가 문자열인지)만 볼 뿐, `transformedText`가
 * 실제로 같은 응답의 `transformed` 안에 있는지는 교차 검증하지 않는다 — LLM이 "보존했다"고
 * 주장만 하고 실제로는 빠뜨린 항목도 스키마상으로는 유효하다. `transformed`에서 찾을 수 없는
 * 항목은 **응답에서 제외**한다(경고를 붙이는 대신 제외) — "근거 없는 보존 주장을 지어내지
 * 않는다"는 이 파일(`c2ResponseSchema` 주석 "없는 값을 지어내지 않는다")과 `contract.ts`
 * `PreservedItem`("누락된 항목은 이 배열에 넣지 않는다")의 원칙을 그대로 따른 것이다.
 * 대소문자만 무시하고 부분 문자열로 비교한다(T11 러너 `matchesRequired`의 `normalize`와 같은 근사).
 */
function filterPreservedByTransformedText(
  transformed: string,
  preserved: PreservedItem[],
): PreservedItem[] {
  const haystack = transformed.toLowerCase();
  return preserved.filter((item) => haystack.includes(item.transformedText.toLowerCase()));
}

/**
 * 🔴 T22 — `unregisteredHonorifics`도 LLM의 자기신고다. 같은 이유(`filterPreservedByTransformedText`
 * 주석 참조)로, 원문(`ORIGINAL text`, 변환 전 `input.text`)에 실제로 없는 문구를 "원문에서 유지한
 * 호칭"이라고 주장하면 그 항목을 제외한다 — 근거 없는 경고 subject를 만들지 않는다.
 */
function filterUnregisteredHonorificsByOriginalText(
  originalText: string,
  unregisteredHonorifics: string[],
): string[] {
  const haystack = originalText.toLowerCase();
  return unregisteredHonorifics.filter((subject) => haystack.includes(subject.toLowerCase()));
}

/**
 * `response.content`(또는 폴백 항목의 `content`)를 C2 스키마로 파싱한다. 실패하면 `null`
 * — 실패 시 던지지 않는 이유는 `c1.ts`·`c4.ts`의 동명 함수와 같다: 호출부가 "원 응답 실패 →
 * 폴백 조회 → 폴백도 실패하면 던지기" 순서를 조립해야 한다.
 *
 * @param originalText 🔴 T22 — 변환 전 원문. `unregisteredHonorifics` 자기신고를 원문과 교차
 *   검증하는 데만 쓴다(`filterUnregisteredHonorificsByOriginalText` 참조).
 */
function parseToneTransform(content: string, originalText: string): ParsedC2Response | null {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }
  const parsed = c2ResponseSchema.safeParse(raw);
  if (!parsed.success) return null;
  return {
    ...parsed.data,
    preserved: filterPreservedByTransformedText(parsed.data.transformed, parsed.data.preserved),
    unregisteredHonorifics: filterUnregisteredHonorificsByOriginalText(
      originalText,
      parsed.data.unregisteredHonorifics,
    ),
  };
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
  const payload = buildC2Payload(
    input.text,
    input.languageDirection,
    input.honorificLevel,
    input.referenceDate,
    input.dictionary ?? [],
  );
  const response = await llm.complete('c2', C2_PROMPT_VERSION, payload);

  const parsed = parseToneTransform(response.content, input.text);
  if (parsed !== null) {
    return { ...parsed, source: response.source };
  }

  const fallback = fallbackLookup('c2', NO_STEP_CACHE_KEY);
  const fallbackParsed = fallback ? parseToneTransform(fallback.content, input.text) : null;
  if (fallbackParsed !== null) {
    return { ...fallbackParsed, source: 'fallback' };
  }

  throw new LLMMalformedResponseError(
    'C2 응답이 스키마 검증에 실패했고 폴백 응답도 없거나 유효하지 않습니다',
  );
}
