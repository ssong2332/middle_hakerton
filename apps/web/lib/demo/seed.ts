/**
 * T61 — 데모 시드 데이터 DB I/O. `./seed-data.ts`(순수 빌더)가 만든 행을 실제 Supabase
 * 테이블(`profiles`/`profile_learned_items`/`dictionary_terms`/`pair_protocols`/
 * `diff_records`)에 쓴다 — `apps/web/lib/messages/pattern-learning.ts`(T20)·
 * `apps/web/lib/dictionary/storage.ts`(T22)와 같은 "core 밖 DB I/O 전담 파일" 관례,
 * `SupabaseClient`를 인자로 받는다(생성처는 `apps/web/lib/supabase/` 한 곳뿐).
 *
 * 🔴 **실행 전제 — 이 파일은 아직 실제 Supabase 프로젝트에 실행되지 않았다.** `profiles`·
 * `profile_learned_items`·`dictionary_terms`(간접, FK 없음이지만 owner) 는 전부
 * `auth.users(id)`를 참조한다(`supabase/migrations/0003_...sql`). 즉 이 스크립트를 실제로
 * 돌리려면 **박지훈·타나카·Michael·Sarah 4개의 실제 Supabase Auth 계정**이 먼저 있어야 한다.
 * T74(AC-039)의 선례와 같은 이유로 `auth.users`에 직접 INSERT하는 경로는 만들지 않았다 —
 * 계정은 실제 회원가입 플로우(T46)로만 만들어야 하고, **계정 생성은 세션마다 사용자 재승인이
 * 필요한 행위**다(`docs/DECISIONS.md` #50 Why 열, T74 각주). 이 파일의 함수들은 그 승인이
 * 나고 4개 계정의 `user_id`(UUID)가 확보된 뒤 `seedDemoData()`에 넘기면 되도록 이미
 * 파라미터화해 두었다 — 계정이 생기기 전까지는 fake client로만 검증된 상태다(`seed.test.ts`).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildDictionaryTerms,
  buildPairProtocols,
  buildProfileRow,
  countByPatternKey,
  DEMO_IDENTIFIERS,
  DIFF_HISTORY_SOURCE,
  MICHAEL_SELF_REPORT,
  TANAKA_SELF_REPORT,
  type SelfReportInput,
} from './seed-data';
import { profileValueForPattern, type DiffPatternKey } from '@cross-border/core';

export interface DemoUserIds {
  jihoon: string;
  tanaka: string;
  michael: string;
  sarah: string;
}

export interface DemoSeedInput {
  userIds: DemoUserIds;
  /** `seed-data.ts` 헤더의 gap ① — TestCases.md에 없는 값이라 호출자가 명시적으로 채운다. */
  jihoonSelfReport: SelfReportInput;
  /** gap ② — 마찬가지. */
  sarahSelfReport: SelfReportInput;
}

/** ① 프로필 4인 — 전부 온보딩 완료 상태로 upsert한다(AC-059⑦). */
export async function seedProfiles(client: SupabaseClient, input: DemoSeedInput): Promise<void> {
  const rows = [
    buildProfileRow({ userId: input.userIds.jihoon, selfReport: input.jihoonSelfReport }),
    buildProfileRow({ userId: input.userIds.tanaka, selfReport: TANAKA_SELF_REPORT }),
    buildProfileRow({ userId: input.userIds.michael, selfReport: MICHAEL_SELF_REPORT }),
    buildProfileRow({ userId: input.userIds.sarah, selfReport: input.sarahSelfReport }),
  ];
  const { error } = await client.from('profiles').upsert(rows, { onConflict: 'user_id' });
  if (error) throw error;
}

/** ③ 용어사전 22개 — 박지훈 소유로 upsert한다(`dictionary_terms` UNIQUE(owner_user_id,
 *  entry_type, source_text)). */
export async function seedDictionaryTerms(
  client: SupabaseClient,
  jihoonUserId: string,
): Promise<void> {
  const rows = buildDictionaryTerms({ ownerUserId: jihoonUserId });
  const { error } = await client
    .from('dictionary_terms')
    .upsert(rows, { onConflict: 'owner_user_id,entry_type,source_text' });
  if (error) throw error;
}

/** ⑤ 쌍방 규약 2건 — `party_a`/`party_b`는 이메일 문자열이라 계정 존재와 무관하게 seed 가능
 *  하지만(FK 아님), 실제 로그인 계정과 identifier가 일치해야 RLS 정책(`pair_protocols_parties`)
 *  으로 조회된다 — `DEMO_IDENTIFIERS`를 그대로 쓴다. */
export async function seedPairProtocols(client: SupabaseClient): Promise<void> {
  const rows = buildPairProtocols(DEMO_IDENTIFIERS);
  const { error } = await client.from('pair_protocols').upsert(rows, { onConflict: 'pair_key' });
  if (error) throw error;
}

/** referenceRecipient(참고용, 카운팅에 안 씀) → 실제 identifier 매핑. */
function recipientIdentifierFor(reference: 'tanaka' | 'michael'): string {
  return DEMO_IDENTIFIERS[reference];
}

/**
 * ② diff 히스토리 10건을 `diff_records`에 **직접** insert한다(`insertDiffRecord()`를 거치지
 * 않는다 — `seed-data.ts`의 "알려진 divergence" 주석 참조: entry 1·5는 실 분류기를 태우면
 * cushion_insert가 나오지 않는다). `message_id`는 이 시드가 만드는 대응 `sent_messages` 행이
 * 없어 전부 `null`(스키마가 nullable을 허용 — "클립보드 경로 등 발송 기록이 없을 수 있음").
 */
export async function seedDiffHistory(
  client: SupabaseClient,
  jihoonUserId: string,
): Promise<void> {
  const rows = DIFF_HISTORY_SOURCE.map((entry) => ({
    user_id: jihoonUserId,
    message_id: null,
    ai_text: entry.aiText,
    final_text: entry.finalText,
    pattern_key: entry.patternKey,
    recipient_identifier: recipientIdentifierFor(entry.referenceRecipient),
    channel: 'web' as const,
  }));
  const { error } = await client.from('diff_records').insert(rows);
  if (error) throw error;
}

const LEARNING_THRESHOLD = 3; // `apps/web/lib/messages/pattern-learning.ts`와 동일 값.

/**
 * `DIFF_HISTORY_SOURCE`에서 3회 이상 나온 pattern_key만 `profile_learned_items`에 반영한다 —
 * `pattern-learning.ts`의 `upsertProfileLearnedItem()`과 같은 쓰기 형태를 그대로 쓴다(값 계산
 * 로직을 중복 구현하지 않는다). 이 시드에서는 `countByPatternKey(DIFF_HISTORY_SOURCE)`가 이미
 * 알려진 고정값(cushion_insert=3, emoji_removed=1)이라 DB를 다시 세지 않는다.
 */
export async function applyReflectedLearning(
  client: SupabaseClient,
  jihoonUserId: string,
): Promise<void> {
  const counts = countByPatternKey(DIFF_HISTORY_SOURCE);
  const reflected = (Object.entries(counts) as [DiffPatternKey, number][]).filter(
    ([, count]) => count >= LEARNING_THRESHOLD,
  );
  if (reflected.length === 0) return;

  const rows = reflected.map(([patternKey, observedCount]) => ({
    user_id: jihoonUserId,
    pattern_key: patternKey,
    value: profileValueForPattern(patternKey),
    observed_count: observedCount,
    applied_at: new Date().toISOString(),
  }));
  const { error } = await client
    .from('profile_learned_items')
    .upsert(rows, { onConflict: 'user_id,pattern_key' });
  if (error) throw error;
}

/**
 * ⑥ "학습 전" 스냅샷 — 박지훈의 diff 히스토리·반영 항목을 지워 diff=0 상태로 되돌린다.
 * `profiles` 행(자기신고)은 건드리지 않는다 — 그래야 "학습 전 = 자기신고는 있음 + diff 0건"
 * (TestCases.md:265, ⚠️ 스킵 상태와 다르다)이 성립한다.
 *
 * **토글 메커니즘 선택(구현 판단, architect 미지정)**: PRD Planning Decision #76이 "스냅샷
 * 또는 토글, 수단은 architect·implementer 판단"이라고 위임했다. 별도 "박지훈(학습후)" 계정을
 * 만드는 대신, **같은 계정을 이 함수와 `applyJihoonLearningHistory()`로 오가며 재현**하는
 * 쪽을 골랐다 — TestCases.md:261-268이 "같은 발신자(박지훈)"를 명시하기 때문이다(계정을
 * 분리하면 "같은 사람"이 아니게 된다). 데모 운영자가 시연 직전 원하는 상태로 전환해 쓴다.
 */
export async function resetJihoonToPreLearningState(
  client: SupabaseClient,
  jihoonUserId: string,
): Promise<void> {
  const { error: diffError } = await client
    .from('diff_records')
    .delete()
    .eq('user_id', jihoonUserId);
  if (diffError) throw diffError;

  const { error: learnedError } = await client
    .from('profile_learned_items')
    .delete()
    .eq('user_id', jihoonUserId);
  if (learnedError) throw learnedError;
}

/** ⑥ "학습 후" 스냅샷 — diff 10건 + 반영 항목을 다시 채운다. */
export async function applyJihoonLearningHistory(
  client: SupabaseClient,
  jihoonUserId: string,
): Promise<void> {
  await seedDiffHistory(client, jihoonUserId);
  await applyReflectedLearning(client, jihoonUserId);
}

/**
 * 전체 시드 진입점 — ①③⑤를 먼저 채우고(계정 4개 존재 전제), 기본 상태는 **"학습 후"**로 둔다
 * (완충 삽입 3회 반영 + 이모지 제거 1회 미반영이 둘 다 화면에서 확인 가능한 상태가 기본값).
 * 장면 5-(a) "학습 전"을 보여줄 때는 `resetJihoonToPreLearningState()`를 별도로 호출한다.
 */
export async function seedDemoData(client: SupabaseClient, input: DemoSeedInput): Promise<void> {
  await seedProfiles(client, input);
  await seedDictionaryTerms(client, input.userIds.jihoon);
  await seedPairProtocols(client);
  await applyJihoonLearningHistory(client, input.userIds.jihoon);
}
