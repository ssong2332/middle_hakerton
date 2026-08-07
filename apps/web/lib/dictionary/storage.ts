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
import { DuplicateEntryError, NotFoundError, type DictionaryEntry } from '@cross-border/core';

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

/**
 * T23 — UX-010(용어사전 관리 화면) 전용 조회 결과 타입. `fetchDictionaryEntries`(T22, C5 파이프라인
 * 전용)와 달리 `id`(수정·삭제 대상 식별)·`note`(화면 전용 메모)까지 포함한다 — `docs/API.md`
 * "GET / POST /api/dictionary" 응답 계약("엔트리 객체")과 1:1로 대응한다.
 */
export interface DictionaryEntryDetail {
  id: string;
  entryType: 'term' | 'person';
  sourceText: string;
  targetText: string | null;
  koHonorific: string | null;
  enHonorific: string | null;
  note: string | null;
}

/** `dictionary_terms` 행 형태(스네이크 케이스, 화면용 — `id`/`note`까지 select한다). */
interface DictionaryTermDetailRow {
  id: string;
  entry_type: 'term' | 'person';
  source_text: string;
  target_text: string | null;
  ko_honorific: string | null;
  en_honorific: string | null;
  note: string | null;
}

function toDetail(row: DictionaryTermDetailRow): DictionaryEntryDetail {
  return {
    id: row.id,
    entryType: row.entry_type,
    sourceText: row.source_text,
    targetText: row.target_text,
    koHonorific: row.ko_honorific,
    enHonorific: row.en_honorific,
    note: row.note,
  };
}

/**
 * T23 — `GET /api/dictionary`(UX-010 화면 조회). `fetchDictionaryEntries`와 같은 테이블·스코프
 * (`owner_user_id`)를 읽지만 화면이 필요로 하는 `id`·`note`까지 select한다. 🔴 비어 있으면 `[]`를
 * 반환한다(`fetchDictionaryEntries`와 같은 원칙, AC-015 위반 없음).
 */
export async function fetchDictionaryEntriesDetailed(
  client: SupabaseClient,
  userId: string,
): Promise<DictionaryEntryDetail[]> {
  const { data, error } = await client
    .from('dictionary_terms')
    .select('id, entry_type, source_text, target_text, ko_honorific, en_honorific, note')
    .eq('owner_user_id', userId);
  if (error) throw error;

  return ((data ?? []) as DictionaryTermDetailRow[]).map(toDetail);
}

/** `POST /api/dictionary` · `PUT /api/dictionary/{id}` 공통 입력(`docs/API.md` Request 계약). */
export interface DictionaryEntryInput {
  entryType: 'term' | 'person';
  sourceText: string;
  targetText?: string | null;
  koHonorific?: string | null;
  enHonorific?: string | null;
  note?: string | null;
}

/** `docs/UX.md` UX-010 Validation의 두 문구 — entryType별로 다르다. */
const DUPLICATE_MESSAGE: Record<'term' | 'person', string> = {
  term: '이미 등록된 용어입니다',
  person: '이미 등록된 인물입니다',
};

/**
 * `owner_user_id` + `entry_type` 스코프로 후보 행을 모두 가져온 뒤, `source_text` 비교는
 * 애플리케이션 레벨에서 `toLowerCase()` 정확 일치로 한다 — `unique(owner_user_id, entry_type,
 * source_text)`(DB 제약, 대소문자 구분)만으로는 "SLA"와 "sla"를 다른 값으로 취급해 UX.md가
 * 요구하는 대소문자 무시 중복 차단(AC-016)을 못 만족하므로 애플리케이션 레벨에서 먼저
 * 확인한다. `excludeId`가 있으면(수정 시) 자기 자신은 후보에서 제외한다.
 *
 * 🔴 C-1(리뷰 지적) — 이전에는 raw `sourceText`를 그대로 `.ilike()`에 넘겼다. postgrest-js는
 * 이를 그대로 Postgres `ILIKE` 패턴으로 전달하므로 `%`/`_`(및 PostgREST가 매핑하는 `*`)가
 * 와일드카드로 해석돼, 예를 들어 기존 엔트리 "100% 달성"이 있는 상태에서 서로 다른 값인
 * "100%"를 추가하면 `ILIKE '100%'`가 "100"으로 시작하는 모든 행에 매치되어 거짓 409가
 * 발생했다(그 값은 영원히 등록 불가). 쿼리 자체는 `source_text`로 필터링하지 않고
 * owner_user_id+entry_type로만 스코프해 후보를 가져온 뒤, 정확한 문자열 비교로 판정해
 * 와일드카드 해석 자체를 피한다.
 */
async function hasDuplicate(
  client: SupabaseClient,
  userId: string,
  entryType: 'term' | 'person',
  sourceText: string,
  excludeId?: string,
): Promise<boolean> {
  const { data, error } = await client
    .from('dictionary_terms')
    .select('id, source_text')
    .eq('owner_user_id', userId)
    .eq('entry_type', entryType);
  if (error) throw error;

  const normalized = sourceText.toLowerCase();
  const rows = (data ?? []) as { id: string; source_text: string }[];
  const matches = rows.filter((row) => row.source_text.toLowerCase() === normalized);
  return excludeId ? matches.some((row) => row.id !== excludeId) : matches.length > 0;
}

/**
 * T23 — `POST /api/dictionary`(UX-010 추가). 중복(대소문자 무시)이면 `DuplicateEntryError`(409)를
 * 던지고 insert하지 않는다(AC-016). `owner_user_id`를 명시적으로 실어 보낸다(RLS와 같은 경계를
 * 애플리케이션 레벨에서도 지킨다 — 파일 헤더 주석과 같은 원칙).
 */
export async function createDictionaryEntry(
  client: SupabaseClient,
  userId: string,
  input: DictionaryEntryInput,
): Promise<DictionaryEntryDetail> {
  if (await hasDuplicate(client, userId, input.entryType, input.sourceText)) {
    throw new DuplicateEntryError(DUPLICATE_MESSAGE[input.entryType]);
  }

  const { data, error } = await client
    .from('dictionary_terms')
    .insert({
      owner_user_id: userId,
      entry_type: input.entryType,
      source_text: input.sourceText,
      target_text: input.targetText ?? null,
      ko_honorific: input.koHonorific ?? null,
      en_honorific: input.enHonorific ?? null,
      note: input.note ?? null,
    })
    .select('id, entry_type, source_text, target_text, ko_honorific, en_honorific, note')
    .single();
  if (error) throw error;

  return toDetail(data as DictionaryTermDetailRow);
}

/**
 * T23 — `PUT /api/dictionary/{id}`(UX-010 수정). `id` + `owner_user_id` 둘 다로 스코프해 타인
 * 소유 행은 애초에 매치되지 않는다(`deleteLearnedItem`과 같은 경계). 중복 검사는 자기 자신을
 * 제외한다(값을 바꾸지 않고 저장해도 "자기 자신과의 중복"으로 오탐하지 않는다).
 */
export async function updateDictionaryEntry(
  client: SupabaseClient,
  userId: string,
  id: string,
  input: DictionaryEntryInput,
): Promise<DictionaryEntryDetail> {
  if (await hasDuplicate(client, userId, input.entryType, input.sourceText, id)) {
    throw new DuplicateEntryError(DUPLICATE_MESSAGE[input.entryType]);
  }

  const { data, error } = await client
    .from('dictionary_terms')
    .update({
      entry_type: input.entryType,
      source_text: input.sourceText,
      target_text: input.targetText ?? null,
      ko_honorific: input.koHonorific ?? null,
      en_honorific: input.enHonorific ?? null,
      note: input.note ?? null,
    })
    .eq('id', id)
    .eq('owner_user_id', userId)
    .select('id, entry_type, source_text, target_text, ko_honorific, en_honorific, note');
  if (error) throw error;

  const rows = (data ?? []) as DictionaryTermDetailRow[];
  if (rows.length === 0) {
    throw new NotFoundError('용어를 찾을 수 없습니다');
  }
  return toDetail(rows[0]);
}

/**
 * T23 — `DELETE /api/dictionary/{id}`(UX-010 삭제). `deleteLearnedItem`(T21)과 같은 패턴 —
 * `id`·`owner_user_id` 둘 다로 스코프해 삭제하고, 삭제된 행이 0개면(존재하지 않거나 타인 소유)
 * 구분해 노출하지 않는 `NotFoundError`(404)를 던진다.
 */
export async function deleteDictionaryEntry(
  client: SupabaseClient,
  userId: string,
  id: string,
): Promise<void> {
  const { data, error } = await client
    .from('dictionary_terms')
    .delete()
    .eq('id', id)
    .eq('owner_user_id', userId)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new NotFoundError('용어를 찾을 수 없습니다');
  }
}
