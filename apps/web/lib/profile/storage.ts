/**
 * T28 — C3 프로필 조회 (`profiles`, `profile_learned_items`, T18 스키마). `apps/web/app/api/
 * mediate/route.ts`가 `packages/core`의 `run()`(pipeline.ts)을 부르기 **전에** 여기서 조회를
 * 끝낸다 — core는 DB를 모른다(AC-028, `docs/Architecture.md` Conventions 11 "DB 조회는 core
 * 밖에서").
 *
 * `apps/web/lib/dictionary/storage.ts`(T22)와 같은 패턴이다: core 밖 DB I/O 전담 파일,
 * `SupabaseClient`를 인자로 받는다(생성처는 `apps/web/lib/supabase/` 한 곳뿐 —
 * `docs/CodingRules.md` Directory Rules).
 *
 * 🔴 **`profiles`는 `owner_user_id`가 아니라 `user_id`가 PK다**(`supabase/migrations/
 * 0003_profiles_dictionary_and_protocols.sql:28` — 사용자당 1행). `.eq('user_id', userId)`로
 * 스코프한다(RLS 정책 `profiles_owner`와 같은 컬럼).
 *
 * 🔴 **행이 없어도 에러가 아니다** — 아직 온보딩을 하지 않은(T19가 아직 `todo`인 계정 포함)
 * 사용자는 `profiles`에 행 자체가 없다. `.maybeSingle()`로 조회해 `data === null`을 "정상"으로
 * 다루고, `onboardingState: 'not_started'` + 스타일 4필드 전부 `null`인 기본 프로필을 반환한다
 * — 기본값·추측값으로 스타일 필드를 채우지 않는다(AC-059② "온보딩 스킵 계정도 정상 동작").
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { NotFoundError, type CommunicationProfile, type LearnedItem } from '@cross-border/core';

/** `profiles` 행 형태(스네이크 케이스) — 이 파일 안에서만 쓰는 조회 결과 타입. */
interface ProfileRow {
  onboarding_state: 'not_started' | 'skipped' | 'completed';
  directness: 'direct' | 'indirect' | null;
  emoji_preference: 'likes' | 'neutral' | 'avoids' | null;
  formality: 'high' | 'medium' | 'low' | null;
  honorific_level: 'hapsyo' | 'haeyo' | null;
}

/** 아직 `profiles`에 행이 없는 계정(온보딩 전)의 기본값 — AC-059②의 "기본값·추측값을 채우지
 * 않는다"는 스타일 4필드에만 적용된다. `onboardingState` 자체는 "아직 시작 안 함"이라는 사실이지
 * 추측이 아니다. */
const EMPTY_PROFILE: CommunicationProfile = {
  onboardingState: 'not_started',
  directness: null,
  emojiPreference: null,
  formality: null,
  honorificLevel: null,
};

/**
 * T19 — 온보딩 저장(쓰기 측). `PUT /api/profile`(`docs/API.md` "GET / PUT / DELETE /api/profile")이
 * 이 함수를 호출한다. **완료(complete)든 스킵(skip)이든 이 함수 하나로 처리한다** — 판정 분기를
 * 라우트가 아니라 여기서 한다: `onboardingState !== 'completed'`이면 스타일 4필드를 전부 `null`로
 * 저장한다(AC-059②, 기본값·추측값 금지). 재실행(④)도 같은 함수다 — `profiles`는 `user_id` PK라
 * `upsert`가 곧 "덮어쓰기"다(`apps/web/lib/demo/seed.ts` `seedProfiles`와 같은 upsert 관례).
 */
export interface SaveOnboardingProfileInput {
  onboardingState: 'completed' | 'skipped';
  directness?: 'direct' | 'indirect';
  emojiPreference?: 'likes' | 'neutral' | 'avoids';
  formality?: 'high' | 'medium' | 'low';
  honorificLevel?: 'hapsyo' | 'haeyo';
}

export interface SavedProfile extends CommunicationProfile {
  updatedAt: string;
}

/**
 * `profiles`에 `userId` 행을 upsert한다. `onboardingState: 'skipped'`면 호출부가 스타일 필드를
 * 실어 보내도 **무시하고 null로 저장한다** — 이 함수가 AC-059②의 마지막 방어선이다(호출부 실수로
 * 스킵인데 값이 섞여 들어와도 여기서 걸러진다).
 */
export async function saveOnboardingProfile(
  client: SupabaseClient,
  userId: string,
  input: SaveOnboardingProfileInput,
): Promise<SavedProfile> {
  const isComplete = input.onboardingState === 'completed';
  const updatedAt = new Date().toISOString();
  const row = {
    user_id: userId,
    onboarding_state: input.onboardingState,
    directness: isComplete ? (input.directness ?? null) : null,
    emoji_preference: isComplete ? (input.emojiPreference ?? null) : null,
    formality: isComplete ? (input.formality ?? null) : null,
    honorific_level: isComplete ? (input.honorificLevel ?? null) : null,
    updated_at: updatedAt,
  };

  const { error } = await client.from('profiles').upsert(row, { onConflict: 'user_id' });
  if (error) throw error;

  return {
    onboardingState: input.onboardingState,
    directness: row.directness,
    emojiPreference: row.emoji_preference,
    formality: row.formality,
    honorificLevel: row.honorific_level,
    updatedAt,
  };
}

/**
 * `profiles`에서 `userId`의 행(있으면 1개, 없으면 0개)을 읽어 core의 `CommunicationProfile`로
 * 변환한다. 행이 없으면 `EMPTY_PROFILE`을 반환한다(AC-059②③).
 */
export async function fetchSenderProfile(
  client: SupabaseClient,
  userId: string,
): Promise<CommunicationProfile> {
  const profile = await fetchProfileWithMeta(client, userId);
  return {
    onboardingState: profile.onboardingState,
    directness: profile.directness,
    emojiPreference: profile.emojiPreference,
    formality: profile.formality,
    honorificLevel: profile.honorificLevel,
  };
}

/** T21 — `GET /api/profile`(UX-009)가 화면에 보여줄 `updatedAt`까지 포함한 확장 형태. */
export interface ProfileWithMeta extends CommunicationProfile {
  /** 행이 없으면(온보딩 전) `null` — `SavedProfile.updatedAt`과 달리 여기는 미저장 상태를
   * 표현해야 하므로 nullable이다. */
  updatedAt: string | null;
}

const EMPTY_PROFILE_WITH_META: ProfileWithMeta = { ...EMPTY_PROFILE, updatedAt: null };

/**
 * T21 — `fetchSenderProfile`과 같은 조회이지만 `updated_at`까지 select해 화면
 * (`GET /api/profile`, UX-009)에 반환한다. `fetchSenderProfile`(core 파이프라인이 쓰는 조회)은
 * 이 함수의 결과에서 `updatedAt`만 떼어내는 얇은 래퍼로 재구성했다 — 조회 쿼리를 두 곳에서
 * 따로 유지하지 않는다.
 */
export async function fetchProfileWithMeta(
  client: SupabaseClient,
  userId: string,
): Promise<ProfileWithMeta> {
  const { data, error } = await client
    .from('profiles')
    .select('onboarding_state, directness, emoji_preference, formality, honorific_level, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return EMPTY_PROFILE_WITH_META;

  const row = data as ProfileRow & { updated_at: string };
  return {
    onboardingState: row.onboarding_state,
    directness: row.directness,
    emojiPreference: row.emoji_preference,
    formality: row.formality,
    honorificLevel: row.honorific_level,
    updatedAt: row.updated_at,
  };
}

/**
 * T21 — `DELETE /api/profile`(UX-009, `docs/API.md` "DELETE 프로필 값을 비우고 onboardingState
 * 를 not_started 로 되돌린다(계정은 삭제하지 않는다)"). `profiles` 행 자체는 지우지 않고(계정
 * 삭제 아님) `saveOnboardingProfile`의 스킵 경로와 같은 형태로 upsert한다 — 스타일 4필드를
 * 전부 null로, `onboarding_state`만 `not_started`로 되돌린다.
 */
export async function resetProfile(
  client: SupabaseClient,
  userId: string,
): Promise<SavedProfile> {
  const updatedAt = new Date().toISOString();
  const row = {
    user_id: userId,
    onboarding_state: 'not_started' as const,
    directness: null,
    emoji_preference: null,
    formality: null,
    honorific_level: null,
    updated_at: updatedAt,
  };

  const { error } = await client.from('profiles').upsert(row, { onConflict: 'user_id' });
  if (error) throw error;

  return {
    onboardingState: 'not_started',
    directness: null,
    emojiPreference: null,
    formality: null,
    honorificLevel: null,
    updatedAt,
  };
}

/** `profile_learned_items` 행 형태(스네이크 케이스) — `observed_count`는 select하지 않는다
 * (`MediationData.learnedItems` 계약 주석 — "행의 존재 자체가 3회 도달을 뜻한다", AC-013). */
interface LearnedItemRow {
  pattern_key: string;
  value: string;
}

/**
 * `profile_learned_items`에서 `userId` 소유 전 행을 읽어 core의 `LearnedItem[]`로 변환한다.
 * 🔴 비어 있으면 `[]`를 반환한다 — 정상 상태다(`MediationData.learnedItems` 주석과 동일 원칙,
 * AC-059).
 */
export async function fetchLearnedItems(
  client: SupabaseClient,
  userId: string,
): Promise<LearnedItem[]> {
  const { data, error } = await client
    .from('profile_learned_items')
    .select('pattern_key, value')
    .eq('user_id', userId);
  if (error) throw error;

  return ((data ?? []) as LearnedItemRow[]).map((row) => ({
    patternKey: row.pattern_key,
    value: row.value,
  }));
}

/** `profile_learned_items` 행 형태(스네이크 케이스, 화면용 — `id`/`observed_count`/`applied_at`
 * 까지 select한다). core의 `LearnedItem`(`fetchLearnedItems` 몫)과 달리 이 타입은 core가 아니라
 * `GET /api/profile/learned`(UX-009 화면) 전용이다 — `docs/API.md` "GET /api/profile/learned"
 * 응답 계약(`{ id, patternKey, value, observedCount, appliedAt }`)과 1:1로 대응한다. */
interface LearnedItemDetailRow {
  id: string;
  pattern_key: string;
  value: string;
  observed_count: number;
  applied_at: string;
}

export interface LearnedItemDetail {
  id: string;
  patternKey: string;
  value: string;
  observedCount: number;
  appliedAt: string;
}

/**
 * T21 — `GET /api/profile/learned`(UX-009). `fetchLearnedItems`와 같은 테이블·스코프
 * (`user_id`)를 읽지만 화면이 필요로 하는 `id`(삭제 대상 식별) · `observed_count` · `applied_at`
 * 까지 select한다. 🔴 비어 있으면 `[]`를 반환한다(`fetchLearnedItems`와 같은 원칙, AC-059).
 */
export async function fetchLearnedItemsDetailed(
  client: SupabaseClient,
  userId: string,
): Promise<LearnedItemDetail[]> {
  const { data, error } = await client
    .from('profile_learned_items')
    .select('id, pattern_key, value, observed_count, applied_at')
    .eq('user_id', userId);
  if (error) throw error;

  return ((data ?? []) as LearnedItemDetailRow[]).map((row) => ({
    id: row.id,
    patternKey: row.pattern_key,
    value: row.value,
    observedCount: row.observed_count,
    appliedAt: row.applied_at,
  }));
}

/**
 * T21 — `DELETE /api/profile/learned/{id}`(UX-009, `docs/API.md` "GET /api/profile/learned ·
 * DELETE /api/profile/learned/{id}" Errors "401 · 404"). `user_id`까지 함께 `.eq()`로 걸어
 * 타인 소유 행은 애초에 매치되지 않는다(RLS `profile_learned_items_owner`와 같은 경계를
 * 애플리케이션 레벨에서도 명시). 삭제된 행이 0개면(존재하지 않거나 타인 소유) `NotFoundError`
 * (404)를 던진다 — 둘 중 어느 원인인지는 구분해 노출하지 않는다(`docs/Architecture.md`
 * `NotFoundError` JSDoc "대상 없음(타인 소유 포함, RLS 결과)"과 같은 원칙).
 */
export async function deleteLearnedItem(
  client: SupabaseClient,
  userId: string,
  id: string,
): Promise<void> {
  const { data, error } = await client
    .from('profile_learned_items')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new NotFoundError('학습 항목을 찾을 수 없습니다');
  }
}
