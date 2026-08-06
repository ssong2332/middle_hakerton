/**
 * `llm_cache` / `llm_call_log` 저장소 접근 - `docs/CodingRules.md` Directory Rules
 * "createServiceClient() 사용처는 llm_cache·llm_call_log 2곳만"을 만족하는 유일한 경로.
 * DDL은 `docs/Database.md` "llm_cache" · "llm_call_log" 절이 단일 출처다.
 *
 * 🔴 내용 컬럼을 절대 만들지 않는다 - `llm_call_log`에는 길이(`input_chars`)만 남긴다
 * (`docs/Architecture.md` Observability "로그 금지 항목").
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LLMStep } from '@cross-border/core';

export interface CacheHit {
  response: string;
  hitCount: number;
}

export interface CacheEntryInput {
  cacheKey: string;
  step: LLMStep;
  model: string;
  promptVersion: string;
  response: string;
}

export type CallOutcome = 'live' | 'cache' | 'fallback' | 'error';

export interface CallLogEntry {
  userId: string | null;
  step: LLMStep;
  model: string;
  outcome: CallOutcome;
  latencyMs: number;
  inputChars: number;
  errorCode: string | null;
}

export async function lookupCache(
  client: SupabaseClient,
  cacheKey: string,
): Promise<CacheHit | null> {
  const { data, error } = await client
    .from('llm_cache')
    .select('response, hit_count')
    .eq('cache_key', cacheKey)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as { response: unknown; hit_count: number };
  return {
    response: typeof row.response === 'string' ? row.response : JSON.stringify(row.response),
    hitCount: row.hit_count ?? 0,
  };
}

export async function recordCacheHit(
  client: SupabaseClient,
  cacheKey: string,
  currentHitCount: number,
): Promise<void> {
  const { error } = await client
    .from('llm_cache')
    .update({ hit_count: currentHitCount + 1 })
    .eq('cache_key', cacheKey);
  if (error) throw error;
}

export async function saveCacheEntry(
  client: SupabaseClient,
  entry: CacheEntryInput,
): Promise<void> {
  const { error } = await client.from('llm_cache').upsert(
    {
      cache_key: entry.cacheKey,
      step: entry.step,
      model: entry.model,
      prompt_version: entry.promptVersion,
      response: entry.response,
      hit_count: 0,
    },
    { onConflict: 'cache_key' },
  );
  if (error) throw error;
}

export async function recordCallLog(client: SupabaseClient, entry: CallLogEntry): Promise<void> {
  const { error } = await client.from('llm_call_log').insert({
    user_id: entry.userId,
    step: entry.step,
    model: entry.model,
    outcome: entry.outcome,
    latency_ms: entry.latencyMs,
    input_chars: entry.inputChars,
    error_code: entry.errorCode,
  });
  if (error) throw error;
}

/**
 * 요청 상한 판정(AC-041)의 조회 절반 - `docs/Database.md:288~298` SQL 그대로:
 * `outcome IN ('live')` 만 카운트하고(`cache`/`fallback`은 상한을 소비하지 않는다),
 * `userId`가 주어지면 사용자·일 단위, 없으면 전역·일 단위 카운트다.
 */
export async function countLiveCallsSince(
  client: SupabaseClient,
  params: { sinceISO: string; userId?: string },
): Promise<number> {
  let query = client
    .from('llm_call_log')
    .select('id', { count: 'exact', head: true })
    .eq('outcome', 'live')
    .gt('created_at', params.sinceISO);
  if (params.userId) {
    query = query.eq('user_id', params.userId);
  }
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}
