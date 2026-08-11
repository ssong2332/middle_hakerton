/**
 * T71/T72 — `observation_samples` 저장·조회·삭제(AC-080, AC-081). `docs/Database.md`
 * "observation_samples" 절 그대로 구현한다(스키마는 T18 마이그레이션 0003에 이미 존재 —
 * `supabase/migrations/0003_profiles_dictionary_and_protocols.sql:132`, 신규 마이그레이션 없음).
 *
 * 🔴 T71이 생성(INSERT)을, T72가 조회·삭제(`GET`/`DELETE /api/samples`)를 이 파일에 함께
 * 담는다(`docs/API.md:384` Screen↔Endpoint 매핑이 두 태스크로 나눈 것은 API 경로 소유일 뿐,
 * 저장소 파일은 리소스당 1개 관례 — `protocol/storage.ts`가 `fetchProtocol`/`saveProtocol`을
 * 한 파일에 두는 것과 같다).
 *
 * 🔴 G1(`docs/Database.md:245`) — 원문 텍스트 컬럼이 없다. 이 파일의 어떤 함수도 원문 필드를
 * 받거나 반환하지 않는다(타입에서부터 배제) — `listSamples()`가 반환하는 것도 집계값
 * (`indicatorContribution` = 저장된 `indicator_deltas` 그대로)뿐이다(AC-081②).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { NotFoundError } from '@cross-border/core';
import type { IndicatorDeltas } from '@cross-border/core';

export interface InsertSampleInput {
  userId: string;
  counterpartIdentifier: string;
  source: 'manual' | 'github';
  indicatorDeltas: IndicatorDeltas;
  /** `docs/API.md:339` Request의 `collectedAt` — 사용자가 실제로 "표본에 추가"를 누른 시점.
   * 생략하면 DB 기본값(`default now()`)에 맡긴다(정책 우회에 쓰이는 필드가 아니라 단순 표시용
   * 타임스탬프라 클라이언트 값을 그대로 신뢰한다 — `POST /api/messages`의 `scheduledFor`처럼
   * 서버가 강제로 덮어써야 하는 필드와는 성격이 다르다). */
  collectedAt?: string;
}

export interface StoredSample {
  id: string;
  counterpartIdentifier: string;
  source: 'manual' | 'github';
  collectedAt: string;
}

interface StoredSampleRow {
  id: string;
  counterpart_identifier: string;
  source: 'manual' | 'github';
  collected_at: string;
}

/** AC-080⑤ — `source`를 표본마다 반드시 남긴다(T71은 항상 `'manual'`을 넘긴다). */
export async function insertSample(
  client: SupabaseClient,
  input: InsertSampleInput,
): Promise<StoredSample> {
  const { data, error } = await client
    .from('observation_samples')
    .insert({
      owner_user_id: input.userId,
      counterpart_identifier: input.counterpartIdentifier,
      source: input.source,
      indicator_deltas: input.indicatorDeltas,
      ...(input.collectedAt !== undefined ? { collected_at: input.collectedAt } : {}),
    })
    .select('id, counterpart_identifier, source, collected_at')
    .single();
  if (error) throw error;

  const row = data as StoredSampleRow;
  return {
    id: row.id,
    counterpartIdentifier: row.counterpart_identifier,
    source: row.source,
    collectedAt: row.collected_at,
  };
}

export interface CounterpartSampleSummary {
  counterpart: string;
  total: number;
  bySource: { manual: number; github: number };
}

export interface SampleListItem {
  id: string;
  counterpart: string;
  source: 'manual' | 'github';
  collectedAt: string;
  indicatorContribution: IndicatorDeltas;
}

export interface SamplesOverview {
  counterparts: CounterpartSampleSummary[];
  samples: SampleListItem[];
}

interface SampleRow {
  id: string;
  counterpart_identifier: string;
  source: 'manual' | 'github';
  indicator_deltas: IndicatorDeltas;
  collected_at: string;
}

/**
 * T72 — `docs/API.md:341` Response(GET) 200. 상대별 롤업(`counterparts`)과 전체 표본 목록
 * (`samples`)을 한 번에 반환한다(쿼리 파라미터가 계약에 없다 — 화면(카운터파트 목록/상세)이
 * 각자 필요한 부분만 클라이언트에서 필터링한다). 🔴 `docs/Database.md:255` "지표는 어디에도
 * 캐시하지 않고 조회 시점에 집계한다" — SQL `GROUP BY` 대신 매 호출마다 전체 행을 읽어 JS에서
 * 롤업한다(표본 규모가 상대당 수십 건이라 비용이 무의미하다는 그 문서의 판단을 그대로 따른다).
 */
export async function listSamples(client: SupabaseClient, userId: string): Promise<SamplesOverview> {
  const { data, error } = await client
    .from('observation_samples')
    .select('id, counterpart_identifier, source, indicator_deltas, collected_at')
    .eq('owner_user_id', userId)
    .order('collected_at', { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as SampleRow[];
  const samples: SampleListItem[] = rows.map((row) => ({
    id: row.id,
    counterpart: row.counterpart_identifier,
    source: row.source,
    collectedAt: row.collected_at,
    indicatorContribution: row.indicator_deltas,
  }));

  const summaryByCounterpart = new Map<string, CounterpartSampleSummary>();
  for (const row of rows) {
    const existing = summaryByCounterpart.get(row.counterpart_identifier);
    const summary = existing ?? {
      counterpart: row.counterpart_identifier,
      total: 0,
      bySource: { manual: 0, github: 0 },
    };
    summary.total += 1;
    summary.bySource[row.source] += 1;
    summaryByCounterpart.set(row.counterpart_identifier, summary);
  }

  return { counterparts: [...summaryByCounterpart.values()], samples };
}

/**
 * T72 — `docs/API.md:345` `DELETE /api/samples/{id}`. `owner_user_id`까지 함께 조건에 걸어
 * 타인 소유 행은 애초에 매치되지 않는다(`dictionary/storage.ts`의 `deleteDictionaryEntry()`와
 * 같은 패턴). 삭제된 행이 없으면(존재하지 않거나 이미 삭제됨) `NotFoundError` — 조용히
 * no-op하지 않는다(`docs/UX.md:915` "Stale or already-deleted data" 패턴).
 *
 * 🔴 `docs/Database.md:254` "삭제 시 재계산: ... 지표는 어디에도 캐시하지 않고 조회 시점에
 * 집계한다" — 이 함수는 행 삭제만 하고 별도 재계산을 수행하지 않는다. 재계산은 저장된 캐시가
 * 없으므로 자동으로 이뤄진다: 삭제 다음 `listSamples()` 호출이 남은 행만 다시 롤업한다
 * (AC-081④는 이 무상태 설계로 저절로 성립한다 — "삭제 후 재계산"을 별도 구현할 필요가 없다).
 */
export async function deleteSample(
  client: SupabaseClient,
  userId: string,
  sampleId: string,
): Promise<void> {
  const { data, error } = await client
    .from('observation_samples')
    .delete()
    .eq('id', sampleId)
    .eq('owner_user_id', userId)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new NotFoundError('표본을 찾을 수 없습니다');
  }
}
