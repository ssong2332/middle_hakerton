/**
 * #34 수신자 정보 공개 출처 보강 ①② — `recipient_enrichments` 저장. 담당: [BE-B] T64 / [FE] T65.
 * `docs/Database.md` "recipient_enrichments"(스키마 이미 T18 마이그레이션 0003에 존재 —
 * `supabase/migrations/0003_profiles_dictionary_and_protocols.sql:112`, 이 태스크는 신규
 * 마이그레이션을 만들지 않는다).
 *
 * 🔴 저장 대상은 정확히 `location`·`company`·활동 시간대(+ 표본 수·출처 URL·조회 시각·확정
 * 타임존)뿐이다(`docs/Database.md:225`) — 이 파일도 그 외 컬럼에 쓰지 않는다.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface UpsertEnrichmentInput {
  userId: string;
  recipientIdentifier: string;
  sourceUrl: string;
  location: string | null;
  company: string | null;
  activityHourHistogram: number[] | null;
  activitySampleCount: number;
}

export interface StoredEnrichment {
  location: string | null;
  company: string | null;
  activityHourHistogram: number[] | null;
  activitySampleCount: number;
  fetchedAt: string;
  sourceUrl: string;
}

interface StoredEnrichmentRow {
  location: string | null;
  company: string | null;
  activity_hour_histogram: number[] | null;
  activity_sample_count: number;
  fetched_at: string;
  source_url: string;
}

/** T65 — `GET /api/enrichment` 재조회용(Stage 1 redisplay + AC-078 판정 입력). `activity_timezone_
 * confirmed`까지 포함한 전체 행 — `StoredEnrichment`(T64, `POST /fetch` 응답 전용)과 다른 shape다. */
export interface StoredEnrichmentFull extends StoredEnrichment {
  activityTimezoneConfirmed: string | null;
}

interface StoredEnrichmentFullRow extends StoredEnrichmentRow {
  activity_timezone_confirmed: string | null;
}

const FULL_ROW_COLUMNS =
  'location, company, activity_hour_histogram, activity_sample_count, activity_timezone_confirmed, fetched_at, source_url';

function fullRowToRecord(row: StoredEnrichmentFullRow): StoredEnrichmentFull {
  return {
    location: row.location,
    company: row.company,
    activityHourHistogram: row.activity_hour_histogram,
    activitySampleCount: row.activity_sample_count,
    activityTimezoneConfirmed: row.activity_timezone_confirmed,
    fetchedAt: row.fetched_at,
    sourceUrl: row.source_url,
  };
}

/**
 * `(owner_user_id, recipient_identifier)` UNIQUE 제약을 그대로 upsert 키로 쓴다 — 같은 상대에
 * 대해 다시 붙여넣으면 이전 조회 결과를 덮어쓴다(AC-065⑥ "출처와 조회 시각을 화면에 표시"가
 * 매번 최신 조회를 반영해야 하므로 자연스러운 동작이다). `activity_timezone_confirmed`는 이
 * 함수가 건드리지 않는다 — 사용자가 확정하기 전까지는(T65) 손대지 않는 필드다.
 */
export async function upsertEnrichment(
  client: SupabaseClient,
  input: UpsertEnrichmentInput,
): Promise<StoredEnrichment> {
  const fetchedAt = new Date().toISOString();
  const { data, error } = await client
    .from('recipient_enrichments')
    .upsert(
      {
        owner_user_id: input.userId,
        recipient_identifier: input.recipientIdentifier,
        source_url: input.sourceUrl,
        location: input.location,
        company: input.company,
        activity_hour_histogram: input.activityHourHistogram,
        activity_sample_count: input.activitySampleCount,
        fetched_at: fetchedAt,
      },
      { onConflict: 'owner_user_id,recipient_identifier' },
    )
    .select('location, company, activity_hour_histogram, activity_sample_count, fetched_at, source_url')
    .single();
  if (error) throw error;

  const row = data as StoredEnrichmentRow;
  return {
    location: row.location,
    company: row.company,
    activityHourHistogram: row.activity_hour_histogram,
    activitySampleCount: row.activity_sample_count,
    fetchedAt: row.fetched_at,
    sourceUrl: row.source_url,
  };
}

/**
 * T65 — `GET /api/enrichment?recipient=`(Stage 1 재표시 + AC-078 판정 입력)을 위한 조회. 행이
 * 없으면(아직 한 번도 조회한 적 없는 상대) `null` — `protocol/storage.ts`의 `fetchProtocol()`과
 * 달리 여기서는 기본값 객체를 만들어 돌려주지 않는다. AC-078의 "정보가 하나도 없음" 판정은
 * 호출부(`route.ts`)가 `null` 자체로 이미 판정할 수 있어 빈 shape을 지어낼 이유가 없다.
 */
export async function getEnrichment(
  client: SupabaseClient,
  userId: string,
  recipientIdentifier: string,
): Promise<StoredEnrichmentFull | null> {
  const { data, error } = await client
    .from('recipient_enrichments')
    .select(FULL_ROW_COLUMNS)
    .eq('owner_user_id', userId)
    .eq('recipient_identifier', recipientIdentifier)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return fullRowToRecord(data as StoredEnrichmentFullRow);
}

export interface UpdateEnrichmentInput {
  userId: string;
  recipientIdentifier: string;
  sourceUrl?: string;
  location?: string | null;
  company?: string | null;
  activityHourHistogram?: number[] | null;
  activitySampleCount?: number;
  activityTimezoneConfirmed?: string | null;
}

/**
 * T65 — `PUT /api/enrichment`(`docs/API.md:305` 계약 — `{ recipient, location?, company?,
 * activityTimezoneConfirmed?, sourceUrl?, activityHourHistogram? }`). 부분 업데이트다 —
 * `input`에 없는 필드는 건드리지 않는다(Postgres `ON CONFLICT DO UPDATE`는 SET 절에 나열된
 * 컬럼만 갱신하므로, upsert 페이로드에 없는 키는 기존 값을 그대로 둔다). 이 화면의 주 용도는
 * `activityTimezoneConfirmed` 확정 저장뿐이다(AC-065④/AC-071③ — 자동 확정 금지, 사용자가
 * 명시적으로 고른 값만 이 경로로 들어온다).
 *
 * 🔴 `docs/API.md:307` Errors에 404가 있다 — 이 라우트는 존재하지 않는 행을 새로 만들지 않는다
 * (행은 `POST /api/enrichment/fetch`가 먼저 만든다). 호출부(`route.ts`)가 `getEnrichment()`로
 * 먼저 존재를 확인하고 없으면 `NotFoundError`를 던진다 — 이 함수 자체는 그 검사를 하지 않는다
 * (호출부 책임, `protocol/storage.ts`의 조회/저장 분리 선례와 같은 형태).
 */
export async function updateEnrichment(
  client: SupabaseClient,
  input: UpdateEnrichmentInput,
): Promise<StoredEnrichmentFull> {
  const payload: Record<string, unknown> = {
    owner_user_id: input.userId,
    recipient_identifier: input.recipientIdentifier,
  };
  if (input.sourceUrl !== undefined) payload.source_url = input.sourceUrl;
  if (input.location !== undefined) payload.location = input.location;
  if (input.company !== undefined) payload.company = input.company;
  if (input.activityHourHistogram !== undefined) payload.activity_hour_histogram = input.activityHourHistogram;
  if (input.activitySampleCount !== undefined) payload.activity_sample_count = input.activitySampleCount;
  if (input.activityTimezoneConfirmed !== undefined) {
    payload.activity_timezone_confirmed = input.activityTimezoneConfirmed;
  }

  const { data, error } = await client
    .from('recipient_enrichments')
    .upsert(payload, { onConflict: 'owner_user_id,recipient_identifier' })
    .select(FULL_ROW_COLUMNS)
    .single();
  if (error) throw error;
  return fullRowToRecord(data as StoredEnrichmentFullRow);
}

/**
 * T65 — `DELETE /api/enrichment?recipient=`(UX-018 Secondary Actions "데이터 최소화 컨트롤" —
 * URL을 지우고 이전에 저장된 보강 정보를 제거). 행이 없어도 에러를 던지지 않는다(삭제는 멱등)
 * — 존재 여부 검사는 호출부가 404 응답 여부를 결정할 때만 필요하다.
 */
export async function deleteEnrichment(
  client: SupabaseClient,
  userId: string,
  recipientIdentifier: string,
): Promise<void> {
  const { error } = await client
    .from('recipient_enrichments')
    .delete()
    .eq('owner_user_id', userId)
    .eq('recipient_identifier', recipientIdentifier);
  if (error) throw error;
}
