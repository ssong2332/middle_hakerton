/**
 * `GET / PUT / DELETE /api/enrichment` — T65(UX-018 Stage 1 재표시 + AC-078 링크 표시 판정 +
 * 타임존 확정 저장 + 데이터 최소화 삭제). `docs/API.md:299`는 **PUT/DELETE만** 명시하고 있다.
 *
 * 🔴 **GET은 이 문서화된 계약에 없는 라우트다(architect 라우팅 필요, docs/API.md 갱신 필요)** —
 * `PUT`(확정 저장)·`DELETE`(삭제)는 있는데 그 값을 화면이 처음 읽어올 방법(`GET`)이 계약에
 * 없다. `docs/Database.md:227`의 AC-078 SQL(`recipient_enrichments`+`pair_protocols` 조회)도
 * 실행할 자리가 필요하고, UX-018 Stage 1의 "재조회 없이 이전 저장값을 다시 보여준다" 상태도
 * 이 데이터가 있어야 성립한다 — `POST /api/enrichment/fetch`(T64)는 매번 실제 GitHub 조회를
 * 강제해 AC-065②("사용자의 붙여넣기 행위 하나뿐"이 트리거)와 충돌한다. `PUT`/`DELETE`의 대칭
 * 짝(같은 리소스의 읽기 경로)이라는 점에서 새 기능이 아니라 기존에 승인된 두 쓰기 엔드포인트의
 * 자연스러운 보완으로 판단해 이 라운드에서 함께 구현했다 — `docs/API.md`에 `GET`을 정식으로
 * 등재하는 것은 architect 몫이며 이 파일은 그 문서를 직접 고치지 않는다.
 */
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  NotFoundError,
  ValidationError,
  deriveActivityTimeCandidate,
  deriveTimezoneCandidates,
} from '@cross-border/core';
import { withApi } from '../../../lib/http';
import { computePairKey } from '../../../lib/protocol/storage';
import {
  deleteEnrichment,
  getEnrichment,
  updateEnrichment,
  type StoredEnrichmentFull,
} from '../../../lib/enrichment/storage';

async function resolveUserEmail(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.email) {
    throw new Error('세션에서 사용자 이메일을 확인할 수 없습니다');
  }
  return data.user.email;
}

/**
 * `docs/Database.md:227` AC-078 SQL 그대로 — `pair_protocols`에 이 상대와의 행이 있거나,
 * `recipient_enrichments`에 `location`/`company`/`activity_timezone_confirmed` 중 하나라도
 * 있으면 링크를 숨긴다(`showEnrichmentLink = NOT (있음)`).
 */
async function computeShowEnrichmentLink(
  client: SupabaseClient,
  userEmail: string,
  recipient: string,
  enrichment: StoredEnrichmentFull | null,
): Promise<boolean> {
  const pairKey = computePairKey(userEmail, recipient);
  const { data, error } = await client
    .from('pair_protocols')
    .select('pair_key')
    .eq('pair_key', pairKey)
    .maybeSingle();
  if (error) throw error;
  const hasProtocol = data !== null;
  const hasEnrichmentInfo =
    enrichment !== null &&
    (enrichment.location !== null ||
      enrichment.company !== null ||
      enrichment.activityTimezoneConfirmed !== null);
  return !(hasProtocol || hasEnrichmentInfo);
}

export interface EnrichmentGetResponse {
  location: string | null;
  company: string | null;
  activityHourHistogram: number[] | null;
  activitySampleCount: number | null;
  activityTimezoneConfirmed: string | null;
  timezoneCandidates: string[];
  activityTimeCandidate: string | null;
  fetchedAt: string | null;
  sourceUrl: string | null;
  showEnrichmentLink: boolean;
}

const enrichmentGetQuerySchema = z.object({
  recipient: z.string().trim().min(1),
});

/** T65 — Stage 1 재표시 + AC-078 판정. 저장된 행이 없어도(아직 조회한 적 없는 상대) 정상
 * 상태다 — `showEnrichmentLink`만 계산해 돌려주고 나머지 필드는 "미등록"에 대응하는 `null`이다. */
export const GET = withApi<undefined, EnrichmentGetResponse>({ requireAuth: true }, async ({ request, session }) => {
  const client = session?.client;
  if (!client) {
    throw new Error('세션에 인증된 Supabase 클라이언트가 없습니다');
  }
  const url = new URL(request.url);
  const parsed = enrichmentGetQuerySchema.safeParse({ recipient: url.searchParams.get('recipient') });
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? '올바르지 않은 요청입니다');
  }
  const userEmail = await resolveUserEmail(client);
  const enrichment = await getEnrichment(client, session.userId, parsed.data.recipient);
  const showEnrichmentLink = await computeShowEnrichmentLink(client, userEmail, parsed.data.recipient, enrichment);

  if (!enrichment) {
    return {
      location: null,
      company: null,
      activityHourHistogram: null,
      activitySampleCount: null,
      activityTimezoneConfirmed: null,
      timezoneCandidates: [],
      activityTimeCandidate: null,
      fetchedAt: null,
      sourceUrl: null,
      showEnrichmentLink,
    };
  }
  return {
    location: enrichment.location,
    company: enrichment.company,
    activityHourHistogram: enrichment.activityHourHistogram,
    activitySampleCount: enrichment.activitySampleCount,
    activityTimezoneConfirmed: enrichment.activityTimezoneConfirmed,
    timezoneCandidates: deriveTimezoneCandidates(enrichment.location),
    activityTimeCandidate: deriveActivityTimeCandidate(enrichment.activityHourHistogram),
    fetchedAt: enrichment.fetchedAt,
    sourceUrl: enrichment.sourceUrl,
    showEnrichmentLink,
  };
});

const enrichmentPutRequestSchema = z.object({
  recipient: z.string().trim().min(1),
  location: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  activityTimezoneConfirmed: z.string().nullable().optional(),
  sourceUrl: z.string().optional(),
  activityHourHistogram: z.array(z.number()).nullable().optional(),
});

type EnrichmentPutRequest = z.infer<typeof enrichmentPutRequestSchema>;

/** T65 — `docs/API.md:305` PUT. 부분 업데이트이며(`updateEnrichment` 참조), 이 화면이 실제로
 * 쓰는 것은 `activityTimezoneConfirmed`뿐이다(AC-065④/AC-071③ — 사용자가 후보 중 하나를 명시
 * 선택했을 때만 호출된다). 행이 없으면 404 — `POST /api/enrichment/fetch`(T64)가 먼저 행을
 * 만들어야 한다(`docs/API.md:307` Errors "404"). */
export const PUT = withApi<EnrichmentPutRequest, StoredEnrichmentFull>(
  { schema: enrichmentPutRequestSchema, requireAuth: true },
  async ({ input, session }) => {
    const client = session?.client;
    if (!client) {
      throw new Error('세션에 인증된 Supabase 클라이언트가 없습니다');
    }
    const existing = await getEnrichment(client, session.userId, input.recipient);
    if (!existing) {
      throw new NotFoundError('먼저 프로필 URL을 조회해야 확정할 수 있습니다');
    }
    return updateEnrichment(client, {
      userId: session.userId,
      recipientIdentifier: input.recipient,
      ...(input.location !== undefined ? { location: input.location } : {}),
      ...(input.company !== undefined ? { company: input.company } : {}),
      ...(input.activityTimezoneConfirmed !== undefined
        ? { activityTimezoneConfirmed: input.activityTimezoneConfirmed }
        : {}),
      ...(input.sourceUrl !== undefined ? { sourceUrl: input.sourceUrl } : {}),
      ...(input.activityHourHistogram !== undefined
        ? { activityHourHistogram: input.activityHourHistogram }
        : {}),
    });
  },
);

const enrichmentDeleteQuerySchema = z.object({
  recipient: z.string().trim().min(1),
});

/** T65 — `docs/API.md:299` DELETE(데이터 최소화 컨트롤). 행이 없어도 404를 던지지 않는다(삭제는
 * 멱등 — `deleteEnrichment` 헤더 주석 참조, "이미 지워진 것"과 "원래 없던 것"을 구분할 이유가
 * 없다). */
export const DELETE = withApi<undefined, { deleted: true }>({ requireAuth: true }, async ({ request, session }) => {
  const client = session?.client;
  if (!client) {
    throw new Error('세션에 인증된 Supabase 클라이언트가 없습니다');
  }
  const url = new URL(request.url);
  const parsed = enrichmentDeleteQuerySchema.safeParse({ recipient: url.searchParams.get('recipient') });
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? '올바르지 않은 요청입니다');
  }
  await deleteEnrichment(client, session.userId, parsed.data.recipient);
  return { deleted: true };
});
