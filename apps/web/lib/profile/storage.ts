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
import type { CommunicationProfile, LearnedItem } from '@cross-border/core';

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
  const { data, error } = await client
    .from('profiles')
    .select('onboarding_state, directness, emoji_preference, formality, honorific_level')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return EMPTY_PROFILE;

  const row = data as ProfileRow;
  return {
    onboardingState: row.onboarding_state,
    directness: row.directness,
    emojiPreference: row.emoji_preference,
    formality: row.formality,
    honorificLevel: row.honorific_level,
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
