/**
 * `POST /api/enrichment/observe` — `docs/API.md:309` (UX-018 Stage 2) / AC-072, AC-080④,
 * AC-082. `docs/Tasks.md` T68.
 *
 * 🔴 이 라우트는 두 개의 서로 다른 저장소를 합친다 — `commentLength`/`emojiFrequency`는
 * `observation_samples`(T71, 수동 표시 + GitHub 합산 경로)에서, `activityHours`는
 * `recipient_enrichments`(T64, GitHub 전용 경로)에서 온다. `responseDelay`는 계산할 데이터가
 * 어느 테이블에도 없어 항상 `value: null`이다(`packages/core/src/observation/indicators.ts`의
 * `computeObserveIndicators()` 헤더 주석 참조 — 지표 정의가 이 리포에 두 벌 존재하는 이유도
 * 거기 있다).
 *
 * 🔴 이 라우트는 원본 글(커밋 메시지·이슈/PR 본문 등)을 읽지도 반환하지도 않는다 — 집계값만
 * 다룬다(AC-072②).
 */
import { z } from 'zod';
import { computeObserveIndicators, type ObserveIndicator } from '@cross-border/core';
import { withApi } from '../../../../lib/http';
import { getIndicatorRollupForCounterpart } from '../../../../lib/samples/storage';
import { getEnrichment } from '../../../../lib/enrichment/storage';

const observeRequestSchema = z.object({
  recipient: z.string().trim().min(1),
});

type ObserveRequest = z.infer<typeof observeRequestSchema>;

export interface ObserveResponse {
  indicators: ObserveIndicator[];
}

/** T68 — `docs/API.md:317` Response 200 `{ indicators: [...] }`. */
export const POST = withApi<ObserveRequest, ObserveResponse>(
  { schema: observeRequestSchema, requireAuth: true },
  async ({ input, session }) => {
    const client = session?.client;
    if (!client) {
      throw new Error('세션에 인증된 Supabase 클라이언트가 없습니다');
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
    return { indicators };
  },
);
