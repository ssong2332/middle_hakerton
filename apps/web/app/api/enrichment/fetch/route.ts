/**
 * `POST /api/enrichment/fetch` — `docs/API.md` "POST /api/enrichment/fetch" (UX-018 Stage 1(UF-018)
 * / AC-065, AC-071). `docs/Tasks.md` T64.
 *
 * 🔴 **범위 고정(리뷰에서 반려 대상)**: 사용자가 붙여넣은 GitHub 공개 프로필 URL **1건**만
 * 조회한다 — 검색·크롤링·링크 추적·다른 URL 자동 조회 코드 경로 0개(AC-065②, 이 파일이 호출하는
 * 외부 엔드포인트는 `github-client.ts`의 2개뿐이며 둘 다 URL에서 파싱한 같은 username 기준).
 * `location`·`company` 외의 GitHub 프로필 필드는 저장하지 않는다(AC-065③) — 애초에
 * `extractProfileFields`가 두 필드만 뽑는다.
 *
 * 🔴 **스코프 갭(architect 라우팅 필요, 이 라우트가 채우지 않는다)** — `docs/Tasks.md` T64
 * 원문은 "코멘트 길이 분포/이모지 사용 빈도/응답 지연 분포"도 이 태스크가 산출한다고 적었지만,
 * `docs/Database.md` `recipient_enrichments`(T18 마이그레이션 0003)에는 그 3개 지표를 저장할
 * 컬럼이 없다 — `activity_hour_histogram`(활동 시간대)만 있다. `docs/API.md`의
 * `POST /api/enrichment/fetch` Response 200 계약도 이 3개 필드를 포함하지 않는다(측정 —
 * `docs/API.md:294`). 세 지표는 `POST /api/enrichment/observe`(T68 범위, 별도 라우트)가
 * `packages/core/src/observation/indicators.ts`로 산출하도록 이미 설계돼 있어(`docs/API.md:317`)
 * 이 라우트가 대신 만들면 판정 로직이 두 벌이 된다 — 스키마 확장 없이는 저장할 곳도 없다.
 * **이 갭은 architect에게 보고한다**(docs/UpdateRequests.md, 이 라우트를 구현하는 implementer가
 * 스키마를 임의로 넓히지 않는다). 이 라우트는 `docs/API.md`가 이미 고정한 계약 그대로
 * (location/company/활동 시간대)만 구현한다.
 */
import { z } from 'zod';
import { withApi } from '../../../../lib/http';
import { extractProfileFields, computeActivityHourHistogram, deriveTimezoneCandidates } from '@cross-border/core';
import { fetchGitHubEnrichment, parseGitHubUsername } from '../../../../lib/enrichment/github-client';
import { upsertEnrichment } from '../../../../lib/enrichment/storage';

const enrichmentFetchRequestSchema = z.object({
  recipient: z.string().min(1),
  profileUrl: z.string().min(1),
});

type EnrichmentFetchRequest = z.infer<typeof enrichmentFetchRequestSchema>;

export interface EnrichmentFetchResponse {
  location: string | null;
  company: string | null;
  activityHourHistogram: number[] | null;
  activitySampleCount: number;
  timezoneCandidates: string[];
  fetchedAt: string;
  sourceUrl: string;
}

export const POST = withApi<EnrichmentFetchRequest, EnrichmentFetchResponse>(
  { schema: enrichmentFetchRequestSchema, requireAuth: true },
  async ({ input, session }) => {
    const client = session?.client;
    if (!client) {
      throw new Error('세션에 인증된 Supabase 클라이언트가 없습니다');
    }

    // AC-065② — URL이 github.com이 아니거나 username을 뽑을 수 없으면 여기서 400, 외부 fetch
    // 자체를 시도하지 않는다.
    const username = parseGitHubUsername(input.profileUrl);

    const fetched = await fetchGitHubEnrichment(username);
    const { location, company } = extractProfileFields(fetched);
    const { histogram, sampleCount } = computeActivityHourHistogram(fetched.activityTimestamps);
    const timezoneCandidates = deriveTimezoneCandidates(location);

    const stored = await upsertEnrichment(client, {
      userId: session.userId,
      recipientIdentifier: input.recipient,
      sourceUrl: input.profileUrl,
      location,
      company,
      activityHourHistogram: histogram,
      activitySampleCount: sampleCount,
    });

    return {
      location: stored.location,
      company: stored.company,
      activityHourHistogram: stored.activityHourHistogram,
      activitySampleCount: stored.activitySampleCount,
      timezoneCandidates,
      fetchedAt: stored.fetchedAt,
      sourceUrl: stored.sourceUrl,
    };
  },
);
