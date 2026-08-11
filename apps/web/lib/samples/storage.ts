/**
 * T71 — `observation_samples` 저장(AC-080, AC-081). `docs/Database.md` "observation_samples"
 * 절 그대로 구현한다(스키마는 T18 마이그레이션 0003에 이미 존재 —
 * `supabase/migrations/0003_profiles_dictionary_and_protocols.sql:132`, 이 태스크는 신규
 * 마이그레이션을 만들지 않는다).
 *
 * 🔴 이 파일은 **생성(INSERT)만** 담당한다 — 조회·삭제(`GET`/`DELETE /api/samples`)는 T72
 * 소관이다(`docs/API.md:384` Screen↔Endpoint 매핑이 이미 두 태스크로 나눠 놓았다).
 *
 * 🔴 G1(`docs/Database.md:245`) — 원문 텍스트 컬럼이 없다. 이 함수의 입력에도 원문 필드가
 * 없다(타입에서부터 배제) — 호출부(`apps/web/app/api/samples/route.ts`)가 이미 계산된
 * `IndicatorDeltas`만 받는다.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
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
