/**
 * T22 — C5 용어사전 조회 (`dictionary_terms`, T18 스키마). `apps/web/app/api/mediate/route.ts`
 * 가 `packages/core`의 `runToneTransform()`을 부르기 **전에** 여기서 조회를 끝낸다 —
 * core는 DB를 모른다(AC-028, `docs/Architecture.md` Conventions 11 "DB 조회는 core 밖에서").
 *
 * `apps/web/lib/messages/pattern-learning.ts`(T20)와 같은 패턴이다: core 밖 DB I/O 전담 파일,
 * `SupabaseClient`를 인자로 받는다(생성처는 `apps/web/lib/supabase/` 한 곳뿐 —
 * `docs/CodingRules.md` Directory Rules).
 *
 * 🔴 `owner_user_id`로 스코프한다(`docs/Database.md` `dictionary_terms` 절 "MVP는 사용자 스코프로
 * 확정한다") — RLS 정책(`dictionary_terms_owner`)도 같은 컬럼을 쓰지만, 애플리케이션 레벨에서도
 * 명시적으로 `.eq()`를 걸어 어떤 쿼리가 스코프를 빠뜨렸는지 코드만 보고 알 수 있게 한다.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DictionaryEntry } from '@cross-border/core';

/** `dictionary_terms` 행 형태(스네이크 케이스) — 이 파일 안에서만 쓰는 조회 결과 타입. */
interface DictionaryTermRow {
  entry_type: 'term' | 'person';
  source_text: string;
  target_text: string | null;
  ko_honorific: string | null;
  en_honorific: string | null;
}

/**
 * `dictionary_terms`에서 `userId` 소유 전 행을 읽어 core의 `DictionaryEntry[]`로 변환한다.
 * 🔴 비어 있으면 `[]`를 반환한다 — 사전 미등록 사용자도 정상 상태다(`MediationData.dictionary`
 * 주석 "비어 있으면 [] 가 정상 상태", AC-015 위반 없음). 기본 엔트리를 만들어 채우지 않는다.
 *
 * `id`·`note`·`created_at`은 화면 전용 컬럼이라 select하지 않는다(`docs/Database.md`
 * `dictionary_terms` 절 — "id·note는 화면용이라 [계약에] 넣지 않는다"와 같은 경계를 조회 쿼리
 * 레벨에서도 지킨다).
 */
export async function fetchDictionaryEntries(
  client: SupabaseClient,
  userId: string,
): Promise<DictionaryEntry[]> {
  const { data, error } = await client
    .from('dictionary_terms')
    .select('entry_type, source_text, target_text, ko_honorific, en_honorific')
    .eq('owner_user_id', userId);
  if (error) throw error;

  return ((data ?? []) as DictionaryTermRow[]).map((row) => ({
    entryType: row.entry_type,
    sourceText: row.source_text,
    targetText: row.target_text,
    koHonorific: row.ko_honorific,
    enHonorific: row.en_honorific,
  }));
}
