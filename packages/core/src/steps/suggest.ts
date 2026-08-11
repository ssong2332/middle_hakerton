/**
 * #34 단계 2 — 협업 스타일 초안 제안(AC-073). `docs/Tasks.md` T68. `packages/core/src/steps/c6.ts`와
 * 같은 패턴(LLMClient 주입, zod로 step 응답 검증, 실패 시 폴백 조회 후 없으면
 * `LLMMalformedResponseError`).
 *
 * 🔴 **이 파일은 이모지 축 하나만 다룬다** — 나머지 3축(직설/호칭/마감 표현)을 만들지 않는
 * 이유는 `apps/web/app/api/enrichment/suggest/route.ts` 헤더 주석 참조(요약: `docs/API.md:317`
 * `POST /api/enrichment/observe`가 제공하는 지표 4개 중 이모지만 그 축을 방어 가능하게
 * 뒷받침하고, "코멘트 길이→직설성"·"응답 지연→마감 표현"은 이 프로젝트가 이미 금지한 억지
 * 매핑이며, 호칭은 애초에 대응 지표가 없다). AC-073③ "근거 없는 제안 항목 0건"을 지키는
 * 유일한 방법이 이 스코프 축소다.
 */
import { z } from 'zod';
import type { LLMClient } from '../llm/client';
import type { ResponseSource } from '../contract';
import { LLMMalformedResponseError } from '../errors';
import { buildSuggestPayload, SUGGEST_PROMPT_VERSION } from '../prompts/suggest';
import { findFallbackResponse, type FallbackResponseEntry } from '../data/fallback-responses';

export interface StyleSuggestion {
  axis: 'emojiPolicy';
  value: 'ok' | 'avoid';
  evidence: { indicatorKey: 'emojiFrequency'; observedValue: number };
  evidenceCount: number;
}

export interface SuggestStyleResult {
  suggestions: StyleSuggestion[];
  source: ResponseSource;
}

export interface SuggestStyleInput {
  /** `POST /api/enrichment/observe`의 `emojiFrequency` 지표 값(코멘트당 평균 이모지 개수). */
  emojiFrequency: number;
  /** 그 값을 산출한 표본 수 — `docs/API.md:329`의 `evidenceCount`로 그대로 실린다(호출부가
   * 이미 임계값 이상임을 확인했다는 전제, AC-073⑤는 route.ts가 소유). */
  sampleCount: number;
}

export interface SuggestStyleDeps {
  fallbackLookup?: (step: 'suggest', cacheKey: string) => FallbackResponseEntry | undefined;
}

const suggestResponseSchema = z.object({
  emojiPolicy: z.enum(['ok', 'avoid']),
  rationale: z.string().min(1),
});

type ParsedSuggestResponse = z.infer<typeof suggestResponseSchema>;

function parseSuggestResponse(content: string): ParsedSuggestResponse | null {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }
  const parsed = suggestResponseSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function buildResult(
  parsed: ParsedSuggestResponse,
  input: SuggestStyleInput,
  source: ResponseSource,
): SuggestStyleResult {
  return {
    suggestions: [
      {
        axis: 'emojiPolicy',
        value: parsed.emojiPolicy,
        evidence: { indicatorKey: 'emojiFrequency', observedValue: input.emojiFrequency },
        evidenceCount: input.sampleCount,
      },
    ],
    source,
  };
}

/** 🔴 이 스텝 자체는 cacheKey를 만들지 않는다 — `c6.ts`의 동명 상수와 같은 이유. */
const NO_STEP_CACHE_KEY = '';

/**
 * 협업 스타일(이모지 축) 제안 스텝. `LLMClient`를 주입받는다(AC-028).
 *
 * 🔴 **폴백이면 제안하지 않는다** — 폴백 콘텐츠는 고정 문자열이라(`data/fallback-responses.ts`)
 * 실제 관측값(`input.emojiFrequency`)을 반영한 판정을 만들 수 없다. 다른 스텝(c1/c2/c4/c6/c7)의
 * 폴백이 "실제 입력을 본 적이 없다는 사실만 말한다"는 원칙을 따르듯, 이 스텝의 폴백은
 * `suggestions: []`(근거 없는 제안을 절대 만들지 않는다 — AC-073③)로 반환한다. 호출부는 이
 * 빈 배열을 `insufficientSample`(표본 부족)과 혼동하지 않는다 — `source: 'fallback'`으로 구분된다.
 *
 * @throws {LLMMalformedResponseError} 응답과 폴백 모두 유효한 JSON이 아니거나 스키마를 만족하지
 *   않을 때.
 */
export async function runStyleSuggestion(
  input: SuggestStyleInput,
  llm: LLMClient,
  deps: SuggestStyleDeps = {},
): Promise<SuggestStyleResult> {
  const fallbackLookup = deps.fallbackLookup ?? findFallbackResponse;
  const payload = buildSuggestPayload(input.emojiFrequency, input.sampleCount);
  const response = await llm.complete('suggest', SUGGEST_PROMPT_VERSION, payload);

  const parsed = parseSuggestResponse(response.content);
  if (parsed !== null) {
    return buildResult(parsed, input, response.source);
  }

  const fallback = fallbackLookup('suggest', NO_STEP_CACHE_KEY);
  if (fallback) {
    // 폴백 콘텐츠 자체가 이 스텝 전용 스키마(emojiPolicy/rationale)를 만족하지 않아도(그 값은
    // "suggestions: []"라는 사실만 전달하는 용도라 스키마가 다르다), 폴백이 존재한다는 사실
    // 자체로 "제안 없음"을 반환한다 — 근거 없는 emojiPolicy 값을 지어내지 않는다.
    return { suggestions: [], source: 'fallback' };
  }

  throw new LLMMalformedResponseError(
    'suggest 응답이 스키마 검증에 실패했고 폴백 응답도 없습니다',
  );
}
