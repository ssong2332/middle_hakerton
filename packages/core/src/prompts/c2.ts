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
 * - ⓒ 날짜·숫자 비모호 정규화(AC-049) — `DATE_NUMBER_RULES`(양방향 공통 — H-10 케이스가 en-ko
 *   방향에서도 날짜 정규화를 요구한다, `docs/TestCases.md` AC-046 표 H-10 "날짜 정규화(AC-049)와 교차").
 *
 * 🔴 국가·국민성 서술을 넣지 않는다 — 아래 규칙은 전부 **언어쌍(KO↔EN) 구조 규칙**이며 국적·문화를
 * 언급하지 않는다(Planning Decision #50·#6, `docs/Architecture.md` Conventions 7).
 */
import type { LanguageDirection } from '../contract';

/** 🔴 프롬프트 문구를 바꾸면 이 값을 올린다. */
export const C2_PROMPT_VERSION = 'c2-v1';

/** `contract.ts`의 `CommunicationProfile.honorificLevel`과 같은 어휘. 여기서 다시 export한다 —
 * `rules/honorific.ts`의 동명 타입은 export되지 않아(그 파일 소유 태스크가 다르다) 재사용하지 않는다. */
export type HonorificLevel = 'hapsyo' | 'haeyo';

/**
 * 🔴 프로필·규약 어디에도 값이 없을 때 en-ko 변환이 쓰는 기본 존댓말 레벨.
 *
 * ## 왜 필요한가
 * AC-046①("한 메시지 안의 종결어미 레벨 혼용이 0건")은 **개인화 여부와 무관하게 항상** 요구된다
 * — 프로필이 비어 있어도 출력 자체는 하나의 레지스터로 일관되어야 한다. 이것은 "빈 프로필을
 * 추측으로 채운다"(AC-059 금지 대상)와는 다르다 — 발신자의 성향을 추정하는 것이 아니라, 시스템이
 * 어떤 경우에도 선택해야 하는 **출력 레지스터의 기본값**이다.
 *
 * ## 왜 `haeyo`(해요체)인가 (implementer 판단 — `docs/Tasks.md` T10 "판단 과정과 대안들을
 * 보고서에 남겨라" 반영)
 * 대안: `hapsyo`(합쇼체, 더 격식 있음) vs `haeyo`(해요체, 정중하되 덜 위계적). 현대 한국어
 * 업무 채팅(Slack 등)에서 해요체가 합쇼체보다 넓게 쓰이는 기본 정중체이고, 합쇼체는 상급자·격식
 * 문서 맥락에 더 치우친다 — 상대와의 관계가 전혀 알려지지 않은 상태(cold start)에서 과도한
 * 위계를 함의하지 않는 쪽을 기본값으로 택했다. 🔴 **이 판단은 측정되지 않았다(추정)** — 사용자
 * 스팟체크 또는 T35 리허설에서 재확인이 필요하면 이 상수만 바꾸면 된다(한 곳에 격리됨).
 */
export const DEFAULT_HONORIFIC_LEVEL: HonorificLevel = 'haeyo';

export interface C2Payload {
  instruction: string;
  text: string;
  languageDirection: LanguageDirection;
  /** en-ko 방향에서만 의미가 있다. ko-en 방향에도 항상 실어 보낸다 — payload 형태를 방향별로
   * 분기하지 않는 편이 캐시 키 계산·스키마를 단순하게 유지한다. */
  honorificLevel: HonorificLevel;
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

/** ⓑ EN→KO 종결어미 레벨 고정(AC-046). */
function enKoRules(honorificLevel: HonorificLevel): string {
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

/** ⓒ 날짜·숫자 비모호 형식 정규화(AC-049). 방향 공통. */
const DATE_NUMBER_RULES =
  'Normalize every date to an unambiguous written form in the output language (e.g. "Aug 4, 2026" ' +
  'for English output, "2026년 8월 4일" for Korean output) but NEVER change the underlying date, time, ' +
  'or numeric value itself. Keep currency amounts and measurement units exactly as written in the ' +
  'original — never convert currencies or units on your own (e.g. do not turn KRW into USD, or ms ' +
  'into seconds).';

/**
 * C2 톤 변환 요청 payload를 만든다.
 *
 * @param text 변환할 원문.
 * @param languageDirection 변환 방향(`ko-en` | `en-ko`).
 * @param honorificLevel en-ko 방향에서 적용할 존댓말 레벨. 호출부가 `sender.profile.honorificLevel`이
 *   `null`이면 `DEFAULT_HONORIFIC_LEVEL`로 미리 채워 넘긴다(이 함수는 그 판단을 하지 않는다).
 */
export function buildC2Payload(
  text: string,
  languageDirection: LanguageDirection,
  honorificLevel: HonorificLevel,
): C2Payload {
  const directionRules = languageDirection === 'ko-en' ? KO_EN_RULES : enKoRules(honorificLevel);
  const instruction = [
    'You are transforming the tone of a cross-border professional work message while preserving ' +
      'what must not be lost, and separately flagging phrases the recipient could misread. Do not ' +
      'invent facts that are not in the original.',
    PRESERVATION_AND_MISREAD_RULE,
    directionRules,
    DATE_NUMBER_RULES,
    RESPONSE_FORMAT_RULE,
  ].join(' ');

  return { instruction, text, languageDirection, honorificLevel };
}
