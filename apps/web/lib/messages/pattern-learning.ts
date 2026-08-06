/**
 * T20 — diff 3회 반복 패턴 감지 → `profile_learned_items` 반영 (AC-012/AC-013).
 *
 * `packages/core/src/rules/pattern-detection.ts`가 순수 함수로 `pattern_key`를 분류하고
 * (`diff_records` insert 시점, `storage.ts` `insertDiffRecord` 참조), 이 파일은 그 뒤에
 * 이어지는 **DB I/O**만 담당한다: 같은 `pattern_key`가 사용자 전체에서 몇 번 나왔는지 세고
 * (`docs/Database.md` diff_records 절 G4 쿼리와 동형), 3회 이상이면만 `profile_learned_items`에
 * 쓴다. `packages/core`는 DB를 몰라야 하므로(`docs/Architecture.md` Conventions 11, AC-028) 이
 * 로직을 core 밖에 둔다 — `apps/web/app/api/messages/route.ts` 한 곳만 호출한다.
 *
 * 🔴 3 미만에서는 `profile_learned_items`에 INSERT/UPDATE 자체를 시도하지 않는다 — DB 제약
 * (`observed_count int not null check (observed_count >= 3)`,
 * `supabase/migrations/0003_profiles_dictionary_and_protocols.sql:52`)이 이미 막지만, 그
 * 제약에 기대지 않고 애플리케이션 레벨에서 먼저 걸러 불필요한 실패 요청을 만들지 않는다
 * (헤더 주석 근거: 같은 마이그레이션 파일 53~54행 "애플리케이션(T20)이 3회 미만에서는 이
 * 테이블에 INSERT/UPDATE 자체를 시도하지 않아야 한다").
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { profileValueForPattern, type DiffPatternKey } from '@cross-border/core';

/** AC-013 — "동일 수정 패턴이 3회 미만이면 프로필이 변경되지 않고, 3회 이상 반복되었을 때만". */
const LEARNING_THRESHOLD = 3;

/** `classifyDiffPattern`이 만들 수 있는 값의 집합 — 방어적 실행 시점 판정용(아래 `isDiffPatternKey`). */
const DIFF_PATTERN_KEYS: readonly DiffPatternKey[] = ['emoji_removed', 'cushion_insert'];

/**
 * `patternKey`가 `classifyDiffPattern`이 실제로 만들 수 있는 값인지 확인한다. 호출자가 넘기는
 * `patternKey`는 DB(`diff_records.pattern_key`)를 거쳐 온 `string | null`이라 타입만으로는
 * `DiffPatternKey`임이 보장되지 않는다 — 알 수 없는 값이면 학습을 적용하지 않고 `false`로
 * 안전하게 되돌린다(지어내지 않는다).
 */
function isDiffPatternKey(value: string): value is DiffPatternKey {
  return (DIFF_PATTERN_KEYS as readonly string[]).includes(value);
}

/**
 * `docs/Database.md` diff_records 절 G4 쿼리("동일 패턴 3회" 판정)를, 방금 저장된 diff 1건의
 * `pattern_key`에 한정해 다시 쓴 것 — 전체 사용자 패턴을 다 세지 않고 필요한 값 하나만 센다.
 * `GROUP BY pattern_key, recipient_identifier`로 바꾸지 않는다(Planning Decision #35/#58/#70/#75
 * — 사용자 단위 카운팅, recipient 축 금지, 같은 문서 111행).
 */
export async function countDiffRecordsForPattern(
  client: SupabaseClient,
  userId: string,
  patternKey: DiffPatternKey,
): Promise<number> {
  const { count, error } = await client
    .from('diff_records')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('pattern_key', patternKey);
  if (error) throw error;
  return count ?? 0;
}

/**
 * `profile_learned_items`에 upsert한다. **호출 전에 `observedCount >= 3`을 이미 확인했다고
 * 가정한다** — 이 함수 자신은 임계값을 다시 확인하지 않는다(그 가드는 `applyPatternLearning`
 * 한 곳에만 있다, 이중 판정으로 로직이 갈라지는 것을 막는다). `unique(user_id, pattern_key)`
 * 제약(`0003_profiles_dictionary_and_protocols.sql:57`)이 있으므로 재발 시 값·관측 횟수를
 * 갱신한다(같은 패턴이 4회, 5회로 계속 반복되면 `observed_count`도 함께 올라간다).
 */
export async function upsertProfileLearnedItem(
  client: SupabaseClient,
  userId: string,
  patternKey: DiffPatternKey,
  observedCount: number,
): Promise<void> {
  const { error } = await client.from('profile_learned_items').upsert(
    {
      user_id: userId,
      pattern_key: patternKey,
      value: profileValueForPattern(patternKey),
      observed_count: observedCount,
      applied_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,pattern_key' },
  );
  if (error) throw error;
}

/**
 * `POST /api/messages`가 diff 저장 직후 호출하는 진입점 — "이 diff로 어떤 패턴이 3회에
 * 도달해 프로필에 반영되었는가"(`docs/API.md` Response 201 `learnedApplied`)를 판정하고,
 * 필요하면 `profile_learned_items`에 쓴 뒤 반영 여부를 반환한다.
 *
 * `patternKey`가 `null`이면(분류 불가) DB를 조회하지 않고 즉시 `false`를 반환한다 — 3회
 * 판정 자체가 성립하지 않는 입력이다.
 */
export async function applyPatternLearning(
  client: SupabaseClient,
  userId: string,
  patternKey: string | null,
): Promise<boolean> {
  if (patternKey === null || !isDiffPatternKey(patternKey)) return false;

  const observedCount = await countDiffRecordsForPattern(client, userId, patternKey);
  if (observedCount < LEARNING_THRESHOLD) return false;

  await upsertProfileLearnedItem(client, userId, patternKey, observedCount);
  return true;
}
