/**
 * `POST /api/enrichment/suggest` — `docs/API.md:321` (UX-018 Stage 3, LLM 호출 있음) / AC-073.
 * `docs/Tasks.md` T68.
 *
 * 🔴 **이 라우트는 이모지 축(`emojiPolicy`) 하나만 제안한다** — AC-073①이 요구하는 4축(직설
 * 허용/이모지/호칭/마감 표현) 중 나머지 3축을 만들지 않는 이유:
 * ⓐ `docs/API.md:317` `POST /api/enrichment/observe`가 제공하는 지표는 `commentLength`/
 *    `emojiFrequency`/`responseDelay`/`activityHours` 4개뿐이고, 이 응답 계약(key가 리터럴
 *    유니온으로 고정)에는 "완곡 표현 빈도"·"호명 방식"·"기한 언급 방식" 같은 T71/AC-080④의
 *    확장 지표를 실을 자리가 없다.
 * ⓑ `commentLength`(코멘트 길이)로 `directnessAllowed`(직설성)를 추론하는 것은 이 프로젝트가
 *    이미 명시적으로 금지한 억지 매핑이다(`docs/Tasks.md` T70 원문 "짧은 코멘트가 직설을
 *    뜻하지 않는다 — 바쁘거나 영어가 제2언어일 수 있다", AC-083③ "억지 매핑을 만들지 않는다"와
 *    같은 원칙). `responseDelay`(응답 지연)로 `deadlineStyle`(마감 표현)을 추론하는 것도 같은
 *    이유로 배제했다(원 AC-079② "마감 표현↔응답 지연: 간접·약함").
 * ⓒ `addressForm`(호칭)은 애초에 대응하는 관측 지표가 없다(AC-079② "호칭: 대응 지표 없음").
 * 근거 없는 제안 항목을 만들면 AC-073③("근거 없는 제안 항목 0건")을 어기므로, 방어 가능한
 * 이모지 축만 남긴다 — 나머지는 이 계약(`POST /api/enrichment/observe`)이 확장되거나 T70처럼
 * 별도 지표원을 계약에 편입하는 architect 결정이 있어야 늘릴 수 있다(`packages/core/src/steps/
 * suggest.ts` 헤더 주석 참조).
 *
 * 🔴 표본 임계값은 AC-077/AC-082의 기존 상수를 그대로 쓴다(④, 새 임계값을 만들지 않는다) —
 * `MANUAL_STYLE_SUGGESTION_SAMPLE_THRESHOLD`(3, 두 임계값 중 더 낮은 쪽)를 하한으로 쓴다.
 * `emojiFrequency`는 이미 `observe`에서 두 출처를 합산한 단일 값이라, T70(개별 축 존재 여부
 * 판정)과 달리 여기서는 "이 합산값 자체가 신뢰할 만한가"를 묻는 문제라 더 낮은 임계값 하나로
 * 충분성을 판단한다(구현 판단 — Database.md에 정확한 합산 판정 공식이 없다, T70 착수 전 조사
 * 참조).
 */
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeObserveIndicators,
  runStyleSuggestion,
  MANUAL_STYLE_SUGGESTION_SAMPLE_THRESHOLD,
  type StyleSuggestion,
} from '@cross-border/core';
import { withApi } from '../../../../lib/http';
import { createLLMClient } from '../../../../lib/llm/create-client';
import { getIndicatorRollupForCounterpart } from '../../../../lib/samples/storage';
import { getEnrichment } from '../../../../lib/enrichment/storage';
import { fetchProtocol } from '../../../../lib/protocol/storage';

const suggestRequestSchema = z.object({
  recipient: z.string().trim().min(1),
});

type SuggestRequest = z.infer<typeof suggestRequestSchema>;

async function resolveUserEmail(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.email) {
    throw new Error('세션에서 사용자 이메일을 확인할 수 없습니다');
  }
  return data.user.email;
}

export type SuggestResponse =
  | { suggestions: StyleSuggestion[]; source: string }
  | { suggestions: []; insufficientSample: true; requiredSampleCount: number; currentSampleCount: number }
  | { suggestions: []; protocolAlreadyAuthored: true };

/** T68 — `docs/API.md:329-331` Response 200(3가지 형태). */
export const POST = withApi<SuggestRequest, SuggestResponse>(
  { schema: suggestRequestSchema, requireAuth: true },
  async ({ input, session }) => {
    const client = session?.client;
    if (!client) {
      throw new Error('세션에 인증된 Supabase 클라이언트가 없습니다');
    }

    // 🔴 AC-037/AC-074④ — 상대가 이미 규약을 직접 작성했으면 생성 자체를 건너뛴다.
    const userEmail = await resolveUserEmail(client);
    const protocolRecord = await fetchProtocol(client, userEmail, input.recipient);
    if (protocolRecord.authorshipState === 'counterpart_authored') {
      return { suggestions: [], protocolAlreadyAuthored: true };
    }

    const [rollup, enrichment] = await Promise.all([
      getIndicatorRollupForCounterpart(client, session.userId, input.recipient),
      getEnrichment(client, session.userId, input.recipient),
    ]);
    const indicators = computeObserveIndicators({
      manual: {
        sampleCount: rollup.manual.sampleCount,
        sentenceCountSum: rollup.manual.sentenceCount,
        emojiCountSum: rollup.manual.emojiCount,
      },
      github: {
        sampleCount: rollup.github.sampleCount,
        sentenceCountSum: rollup.github.sentenceCount,
        emojiCountSum: rollup.github.emojiCount,
      },
      activityHourHistogram: enrichment?.activityHourHistogram ?? null,
      activitySampleCount: enrichment?.activitySampleCount ?? 0,
    });
    const emojiFrequency = indicators.find((indicator) => indicator.key === 'emojiFrequency');

    // 🔴 AC-073⑤ — 표본이 임계값 미만이면 전체를 보류한다(일부 축만 추측으로 채우지 않는다).
    if (!emojiFrequency || emojiFrequency.value === null || emojiFrequency.sampleCount < MANUAL_STYLE_SUGGESTION_SAMPLE_THRESHOLD) {
      return {
        suggestions: [],
        insufficientSample: true,
        requiredSampleCount: MANUAL_STYLE_SUGGESTION_SAMPLE_THRESHOLD,
        currentSampleCount: emojiFrequency?.sampleCount ?? 0,
      };
    }

    const llm = await createLLMClient(session.userId);
    const result = await runStyleSuggestion(
      { emojiFrequency: emojiFrequency.value, sampleCount: emojiFrequency.sampleCount },
      llm,
    );
    return { suggestions: result.suggestions, source: result.source };
  },
);
