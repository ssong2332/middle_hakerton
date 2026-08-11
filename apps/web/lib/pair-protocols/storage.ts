/**
 * T66 — 층 1 수신자 후보 목록(AC-067①). `pair_protocols`에서 **현재 사용자가 party_a/party_b
 * 중 하나인 행 전부**를 읽어 상대방(counterpart) 식별자만 뽑는다. RLS 정책
 * (`docs/Database.md` "Row Level Security" — `USING (auth.jwt()->>'email' IN (party_a,
 * party_b))`)이 이미 본인 관련 행만 반환하도록 걸러 주므로, 이 함수는 필터를 다시 걸지 않고
 * "둘 중 나와 다른 쪽"만 골라낸다.
 *
 * `pair_protocols`는 이메일 문자열로 저장되고 `auth.users`와 FK로 연결되지 않는다
 * (`docs/Database.md` `pair_protocols` 절 "상대는 미가입일 수 있으므로 FK 아님") — 그래서
 * `userId`가 아니라 `userEmail`을 받는다.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

interface PairProtocolPartyRow {
  party_a: string;
  party_b: string;
}

/**
 * 🔴 비어 있으면 `[]`를 반환한다(`dictionary/storage.ts`의 `fetchDictionaryEntries()`와 같은
 * 원칙 — 규약이 없는 사용자도 정상 상태다, AC-067④가 이 경로가 늘 동작함을 요구한다).
 */
export async function fetchCounterparts(
  client: SupabaseClient,
  userEmail: string,
): Promise<string[]> {
  const { data, error } = await client.from('pair_protocols').select('party_a, party_b');
  if (error) throw error;

  return ((data ?? []) as PairProtocolPartyRow[]).map((row) =>
    row.party_a === userEmail ? row.party_b : row.party_a,
  );
}
