/**
 * #34 단계 2 — 협업 스타일 초안 제안 프롬프트(AC-073). `packages/core/src/prompts/c6.ts`와 같은
 * 패턴(텍스트 + `PROMPT_VERSION`을 같은 곳에 둔다). `docs/Tasks.md` T68.
 *
 * 🔴 이 프롬프트는 **이모지 축 하나만** 다룬다 — `apps/web/app/api/enrichment/suggest/route.ts`
 * 헤더 주석이 설명하는 스코프 결정(직설·호칭·마감 표현 3축은 근거가 없거나 억지 매핑이라 이
 * 라운드에서 만들지 않는다, AC-073③의 "근거 없는 제안 0건"을 지키기 위한 판단)을 그대로 따른다.
 *
 * 🔴 관측값(`emojiFrequency`)에서 `emojiPolicy`(ok/avoid) 자체를 계산하는 것은 사실 결정적
 * 규칙(예: 평균값이 0보다 크면 'ok')으로도 가능하지만, `docs/API.md:322` 계약이 이 라우트를
 * "LLM 호출 있음"으로 이미 고정해뒀다 — 이 프롬프트는 그 계약을 따르되, **LLM이 실제로 만드는
 * 것은 근거 문장(자연어 설명)뿐이고 판정 자체(ok/avoid)도 LLM에 맡긴다**(수치 임계값을 이
 * 파일이 새로 지어내지 않기 위해 — 그 값이 필요했다면 architect가 constants.ts에 상수를 정의해야
 * 한다는 원칙, T64/T70의 "임계값을 지어내지 않는다" 판단과 같은 방향).
 */

/** 🔴 프롬프트 문구를 바꾸면 이 값을 올린다. */
export const SUGGEST_PROMPT_VERSION = 'suggest-v1';

export interface SuggestPayload {
  instruction: string;
  emojiFrequency: number;
  sampleCount: number;
}

const RESPONSE_FORMAT_RULE =
  'Respond with JSON only, matching exactly this shape: {"emojiPolicy": "ok" | "avoid", ' +
  '"rationale": "<one sentence, in Korean, explaining the suggestion in terms of the observed ' +
  'value only — e.g. \'이모지를 코멘트당 평균 0.3개 사용했습니다 → 이모지 사용 허용 쪽으로 ' +
  '제안합니다\'>"}. Do not add any text outside the JSON object.';

const TASK_RULE =
  'You are given only one observed, aggregate fact about a person\'s public communication style: ' +
  'the average number of emojis per message/comment they wrote (never the messages themselves — ' +
  'you have no access to raw text and must not invent or assume any). Based solely on this number, ' +
  'suggest whether a collaboration protocol with this person should set "emoji usage" to "ok" ' +
  '(emoji use is acceptable) or "avoid" (emoji use should be avoided) — a low or zero average ' +
  'suggests "avoid", a clearly nonzero average suggests "ok". Do not infer anything about the ' +
  'person\'s personality, mood, nationality, or professionalism — this is a factual frequency ' +
  'observation only, not a character judgment.';

/**
 * suggest 요청 payload를 만든다.
 *
 * @param emojiFrequency `POST /api/enrichment/observe`의 `emojiFrequency` 지표 값(코멘트당 평균
 *   이모지 개수).
 * @param sampleCount 그 값을 산출한 표본 수(관측 사실을 있는 그대로 함께 전달 — LLM이 표본 규모를
 *   무시하고 과신하지 않도록 컨텍스트로 준다).
 */
export function buildSuggestPayload(emojiFrequency: number, sampleCount: number): SuggestPayload {
  const instruction = [TASK_RULE, RESPONSE_FORMAT_RULE].join(' ');
  return { instruction, emojiFrequency, sampleCount };
}
