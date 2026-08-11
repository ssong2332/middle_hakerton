/**
 * #34 수신자 정보 공개 출처 보강 ① — `recipient_enrichments` 저장. 담당: [BE-B] T64.
 * `docs/Database.md` "recipient_enrichments"(스키마 이미 T18 마이그레이션 0003에 존재 —
 * `supabase/migrations/0003_profiles_dictionary_and_protocols.sql:112`, 이 태스크는 신규
 * 마이그레이션을 만들지 않는다).
 *
 * 🔴 저장 대상은 정확히 `location`·`company`·활동 시간대(+ 표본 수·출처 URL·조회 시각)뿐이다
 * (`docs/Database.md:225`) — 이 파일도 그 외 컬럼에 쓰지 않는다.
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
