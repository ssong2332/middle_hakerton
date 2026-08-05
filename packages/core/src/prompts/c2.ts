/**
 * C2 톤 변환 + 보존 필터 + 오해 사전 경고 프롬프트 — 텍스트와 `PROMPT_VERSION`을 같은 곳에 둔다
 * (`docs/Architecture.md` Folder Structure "prompts/ # 프롬프트 텍스트 + PROMPT_VERSION 상수").
 * `packages/core/src/prompts/c1.ts`·`c4.ts`와 같은 패턴이다.
 *
 * 🔴 `PROMPT_VERSION`은 캐시 키(`llm_cache.cache_key`)에 들어간다 — 이 프롬프트(아래
 * `instruction` 문자열)를 고치면 반드시 이 값을 올린다(`docs/Architecture.md` Conventions 10).
 *
 * `apps/web/lib/llm/openai.ts`는 시스템 메시지를 따로 만들지 않고 payload 전체를 단일 user
 * 메시지의 JSON 본문으로 보낸다 — 그래서 지시문(`instruction`)을 payload 안에 담는다(`prompts/c4.ts`
 * 헤더 주석 참조).
 *
 * ## 이 프롬프트가 한 번의 호출로 산출하는 것 (`docs/Architecture.md` Data Flow ⑥)
 * `transformed`(톤 변환문) / `reason`(변환 이유 1건) / `preserved[]`(AC-006/007) /
 * `misreadRisks[]`(AC-043) — 추가 LLM 호출 없이 함께 산출한다(NFR 체감 5초 + 크레딧 제약).
 *
 * ## `docs/Tasks.md` T10 ⓐⓑⓒ 프롬프트 규칙 3종의 반영 지점
 * - ⓐ KO→EN 어미 긴급도 복원(AC-045) — `KO_EN_RULES`.
 * - ⓑ EN→KO 종결어미 레벨 고정(AC-046) — `enKoRules()`.
 * - ⓒ 날짜·숫자 비모호 정규화(AC-049) — `dateNumberRules()`(양방향 공통 — H-10 케이스가 en-ko
 *   방향에서도 날짜 정규화를 요구한다, `docs/TestCases.md` AC-046 표 H-10 "날짜 정규화(AC-049)와 교차").
 *   🔴 QA 정적 분석 후속(2026-08-05) — 연도 없는 원문(`8월 12일`, `8/8`)의 연도를 채우려면 기준
 *   연도가 필요해 `C2Payload.referenceYear`를 추가했다(아래 해당 필드 주석 참조).
 *
 * 🔴 국가·국민성 서술을 넣지 않는다 — 아래 규칙은 전부 **언어쌍(KO↔EN) 구조 규칙**이며 국적·문화를
 * 언급하지 않는다(Planning Decision #50·#6, `docs/Architecture.md` Conventions 7).
 */
import type { LanguageDirection } from '../contract';

/** 🔴 프롬프트 문구를 바꾸면 이 값을 올린다. */
export const C2_PROMPT_VERSION = 'c2-v3';

/** `contract.ts`의 `CommunicationProfile.honorificLevel`과 같은 어휘. 여기서 다시 export한다 —
 * `rules/honorific.ts`의 동명 타입은 export되지 않아(그 파일 소유 태스크가 다르다) 재사용하지 않는다. */
export type HonorificLevel = 'hapsyo' | 'haeyo';

export interface C2Payload {
  instruction: string;
  text: string;
  languageDirection: LanguageDirection;
  /** en-ko 방향에서만 의미가 있다. ko-en 방향에도 항상 실어 보낸다 — payload 형태를 방향별로
   * 분기하지 않는 편이 캐시 키 계산·스키마를 단순하게 유지한다.
   * 🔴 프로필이 비어 있으면(`skipped`·미응답) `null` — 기본 레벨을 채우지 않는다(`docs/Architecture.md`
   * Data Flow 1-a, DECISIONS #40, ADR-0007). 기본값을 채우면 "프로필 없음"과 "프로필=특정값"의
   * payload가 같아져 캐시 키가 두 상태를 구분하지 못하게 된다. */
  honorificLevel: HonorificLevel | null;
  /**
   * 🔴 QA 정적 분석 후속 — 기준 연도(`YYYY`, 예: "2026"). `docs/TestCases.md` P-03/P-09/D-01/
   * D-03/D-06의 "필수 포함"이 연도를 요구하는데(예: "Aug 12, 2026"), 원문에는 연도가 없다
   * (`8월 12일`, `8/8` 등 월/일뿐). 이 값이 없으면 "원문에 없는 사실을 지어내지 마라"(위
   * instruction 첫 문장)와 "연도를 채워라"가 동시에 성립할 수 없다 — 모델이 연도를 채우려면
   * 지어내야 한다. `buildC2Payload`가 `referenceDate`(전체 ISO 날짜, 호출자의 "오늘")에서
   * **연도만** 뽑아 여기 싣는다.
   *
   * **연도만 싣고 전체 날짜(`referenceDate`)를 payload에 싣지 않는 이유(캐시 키 설계 결정)**:
   * cacheKey는 `sha256(model ∥ promptVersion ∥ step ∥ canonicalJSON(payload))`다
   * (`docs/Architecture.md` Data Flow "2) LLM 호출 3단 해석"). payload에 실리는 값이 그대로
   * 캐시 무효화 단위가 된다 — 전체 날짜(`YYYY-MM-DD`)를 실으면 **매일** 캐시가 깨진다. 그런데
   * 위 5건이 요구하는 것은 전부 "연도"뿐이다(월/일/시각은 원문에 이미 있다 — 8월 12일/14시,
   * 8/8, 8/4, 9/1 10시 등). "오늘이 정확히 며칠인지"는 어느 케이스도 요구하지 않는다(`today`류
   * 상대 표현은 AC-045 케이스라 리터럴 "today"만 요구하며 실제 날짜 계산이 필요 없다,
   * `docs/TestCases.md:88` U-01). 따라서 **연 단위 무효화**(실용적 — 데모 리허설·발표는 같은 해
   * 안에서 일어난다, `docs/Architecture.md` "폴백 경로" 항목)로 캐시 키 설계 원칙과 이 요구사항이
   * 동시에 성립한다. */
  referenceYear: string;
}

const RESPONSE_FORMAT_RULE =
  'Respond with JSON only, matching exactly this shape: {"transformed": "<the rewritten message, ' +
  'same overall meaning as the original>", "reason": "<one sentence, in the same language as the ' +
  'transformed text, explaining what changed and why>", "preserved": [{"kind": "deadline" | ' +
  '"number" | "action", "sourceText": "<exact phrase from the ORIGINAL text>", "transformedText": ' +
  '"<the corresponding phrase actually present in your transformed text>"}], "misreadRisks": ' +
  '[{"quote": "<phrase from the ORIGINAL text>", "misreading": "<the likely misunderstanding>", ' +
  '"evidence": "<why you judged it that way>"}]}. If there are no preserved items, return ' +
  '"preserved": []. If there is no real misread risk, return "misreadRisks": [] — never invent an ' +
  'item without a real basis. Do not add any text outside the JSON object.';

const PRESERVATION_AND_MISREAD_RULE =
  'Step 1 — before rewriting, find every deadline, number, and required action explicitly stated ' +
  'in the original text and lock their meaning and value; these become the "preserved" list. ' +
  'Step 2 — rewrite the message tone only; every locked item from step 1 must still be present ' +
  '(in meaning/value, not necessarily the exact same words) in the rewritten text — never drop, ' +
  'round, or soften a deadline, a number, or a required action while adjusting tone. ' +
  'Step 3 — separately, look at the ORIGINAL text and identify phrases the recipient could ' +
  'genuinely misread (e.g. a request phrased so it reads as optional, an opinion that could be ' +
  'mistaken for a final decision, an ambiguous reaction). Only report a risk when you can point to ' +
  'the specific quoted phrase and explain the evidence — do not report a risk for a plain, ' +
  'unambiguous statement of fact.';

/** ⓐ KO→EN 어미 긴급도 복원(AC-045). */
const KO_EN_RULES =
  'The original is Korean; produce English. Korean sentence endings and adverbs (e.g. "혹시 ~ ' +
  '가능하실까요?", "가급적", "되도록이면") often carry urgency and a request that a literal, word-for-word ' +
  'translation would lose. Restore that into an explicit deadline (if one is implied or stated) and ' +
  'an explicit action-request sentence in the English output. Do NOT add softening hedges that are ' +
  'not present in the original — do not introduce "maybe", "if possible", or "whenever you get a ' +
  'chance" on your own. Cushioning/apologetic phrases in the original (e.g. "바쁘신 와중에 죄송하지만") ' +
  'should be condensed to at most one apology sentence in the English output — keep the politeness ' +
  'but do not let it bury or replace the actual request.';

/**
 * ⓑ EN→KO 종결어미 레벨 고정(AC-046).
 *
 * 🔴 `honorificLevel === null`(프로필이 비어 있음·`skipped`·미응답)일 때는 특정 레벨을 지정하지
 * 않는다 — `docs/Architecture.md` Data Flow **1-a** 판정표 행 3(DECISIONS #40, ADR-0007 D2)이
 * 단일 출처다. 대신 "하나의 일관된 종결어미 레벨을 끝까지 유지하라"는 일관성 지시만 싣는다.
 * AC-046①("한 메시지 안의 혼용 0건")의 판정 단위는 "한 메시지 안"이라 이 지시만으로 충족된다 —
 * 메시지 **간** 레벨이 달라지는 것은 AC-046이 금지하지 않는다.
 */
function enKoRules(honorificLevel: HonorificLevel | null): string {
  if (honorificLevel === null) {
    return (
      'The original is English; produce Korean. The sender has no recorded honorific preference, ' +
      'so do NOT assume or guess a specific register. Instead, pick ONE sentence-final honorific ' +
      'register — either 합쇼체 (-습니다/-습니까/-십시오) or 해요체 (-아요/-어요/-네요/-예요) — and use that ' +
      'SAME register consistently for every sentence in the output. Do not mix the two registers ' +
      'within one message, and do not switch registers between sentences even for emphasis or a ' +
      'quoted phrase.'
    );
  }
  const label =
    honorificLevel === 'hapsyo'
      ? '합쇼체 (sentence endings like -습니다/-습니까/-십시오)'
      : '해요체 (sentence endings like -아요/-어요/-네요/-예요)';
  return (
    `The original is English; produce Korean. Use a SINGLE consistent sentence-final honorific ` +
    `register for every sentence in the output: ${label}. Do not mix the two registers within one ` +
    'message, and do not switch registers between sentences even for emphasis or a quoted phrase.'
  );
}

/**
 * ⓒ 날짜·숫자 비모호 형식 정규화(AC-049). 방향 공통.
 *
 * 🔴 QA 정적 분석 후속 — `referenceYear`가 없던 이전 버전은 예시 문구에 "2026"을 하드코딩해
 * 두고 실제 기준 연도를 알려주는 필드가 없었다(payload에 `referenceDate`/`currentDate` 류
 * grep 0건이었다) — 원문에 연도가 없는 케이스(P-03/P-09/D-01/D-03/D-06)에서 모델이 연도를
 * 채우려면 지어내야 하는데 "지어내지 마라"는 지시와 모순됐다. 이제 실제 기준 연도를 명시한다.
 */
function dateNumberRules(referenceYear: string): string {
  return (
    `The reference year is ${referenceYear} — treat it as the current year "today". Normalize ` +
    'every date to an unambiguous written form in the output language (e.g. ' +
    `"Aug 4, ${referenceYear}" for English output, "${referenceYear}년 8월 4일" for Korean output) ` +
    'but NEVER change the underlying date, time, or numeric value itself. If the original date has ' +
    `no year written, fill in ${referenceYear} — do NOT guess a different year and do NOT drop the ` +
    'year from the output. If the original text itself states a year, keep that stated year instead ' +
    'of the reference year. Keep currency amounts and measurement units exactly as written in the ' +
    'original — never convert currencies or units on your own (e.g. do not turn KRW into USD, or ms ' +
    'into seconds).'
  );
}

/**
 * C2 톤 변환 요청 payload를 만든다.
 *
 * @param text 변환할 원문.
 * @param languageDirection 변환 방향(`ko-en` | `en-ko`).
 * @param honorificLevel en-ko 방향에서 적용할 존댓말 레벨. `sender.profile.honorificLevel`을 그대로
 *   받는다 — 프로필이 비어 있으면(`null`) 이 함수도 기본값을 채우지 않고 `null`을 그대로 payload에
 *   싣는다(`docs/Architecture.md` Data Flow 1-a, DECISIONS #40, ADR-0007).
 * @param referenceDate 호출 시점의 기준일(ISO, `YYYY-MM-DD` — 호출자의 "오늘", 보통
 *   `new Date().toISOString().slice(0, 10)`). 이 함수는 **연도만** 뽑아 payload에 싣는다
 *   (`C2Payload.referenceYear` 주석 — 캐시 키 무효화를 연 단위로 제한하기 위함).
 */
export function buildC2Payload(
  text: string,
  languageDirection: LanguageDirection,
  honorificLevel: HonorificLevel | null,
  referenceDate: string,
): C2Payload {
  const referenceYear = referenceDate.slice(0, 4);
  const directionRules = languageDirection === 'ko-en' ? KO_EN_RULES : enKoRules(honorificLevel);
  const instruction = [
    'You are transforming the tone of a cross-border professional work message while preserving ' +
      'what must not be lost, and separately flagging phrases the recipient could misread. Do not ' +
      'invent facts that are not in the original.',
    PRESERVATION_AND_MISREAD_RULE,
    directionRules,
    dateNumberRules(referenceYear),
    RESPONSE_FORMAT_RULE,
  ].join(' ');

  return { instruction, text, languageDirection, honorificLevel, referenceYear };
}
