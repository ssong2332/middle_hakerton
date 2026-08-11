/**
 * T41/T42 — `pair_protocols` 조회·저장(AC-037, AC-075). `docs/Database.md` "pair_protocols"
 * 절 그대로 구현한다.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PairProtocol } from '@cross-border/core';
import { ConflictError } from '@cross-border/core';
import type { ProtocolPutRequest } from './schema';

/**
 * 🔴 `docs/Database.md:140`의 `pair_key` 정의("두 식별자를 소문자화 후 정렬해 X로 연결") —
 * 원문의 구분자 문자는 마크다운 렌더링에서 소실됐지만 원본 바이트는 U+0001(제어문자, "SOH")이다
 * (`sed -n '140p' docs/Database.md | cat -A`로 확인 — `^A`). 이메일 문자열에 나타날 수 없는
 * 문자라 구분자로 안전하다.
 */
const PAIR_KEY_SEPARATOR = '';

/** T65 — AC-078 링크 표시 판정(`docs/Database.md:233` SQL)이 같은 `pair_key` 계산을 재사용한다
 * (T26/T27 선례가 경고한 "같은 계산의 중복" 회피 — `apps/web/app/api/enrichment/route.ts` 참조). */
export function computePairKey(a: string, b: string): string {
  const [first, second] = [a.toLowerCase(), b.toLowerCase()].sort();
  return `${first}${PAIR_KEY_SEPARATOR}${second}`;
}

export interface ProtocolRecord {
  pairKey: string;
  counterpart: string;
  directnessAllowed: 'yes' | 'no' | null;
  emojiPolicy: 'ok' | 'avoid' | null;
  addressForm: string | null;
  deadlineStyle: string | null;
  authorshipState: 'untouched' | 'inference_draft' | 'sender_confirmed' | 'counterpart_authored';
  updatedAt: string;
}

interface PairProtocolRow {
  pair_key: string;
  party_a: string;
  party_b: string;
  directness_allowed: 'yes' | 'no' | null;
  emoji_policy: 'ok' | 'avoid' | null;
  address_form: string | null;
  deadline_style: string | null;
  authorship_state: 'untouched' | 'inference_draft' | 'sender_confirmed' | 'counterpart_authored';
  updated_at: string;
}

function rowToRecord(row: PairProtocolRow, userEmail: string): ProtocolRecord {
  const counterpart = row.party_a === userEmail ? row.party_b : row.party_a;
  return {
    pairKey: row.pair_key,
    counterpart,
    directnessAllowed: row.directness_allowed,
    emojiPolicy: row.emoji_policy,
    addressForm: row.address_form,
    deadlineStyle: row.deadline_style,
    authorshipState: row.authorship_state,
    updatedAt: row.updated_at,
  };
}

/**
 * 🔴 아직 규약이 없는 상대는 정상 상태다(UX-011 States "Empty") — 행이 없으면 예외를 던지지
 * 않고 `untouched` + 4축 전부 `null`인 기본값을 돌려준다(`dictionary/storage.ts`의
 * "없으면 빈 값" 원칙과 동일).
 */
export async function fetchProtocol(
  client: SupabaseClient,
  userEmail: string,
  counterpartEmail: string,
): Promise<ProtocolRecord> {
  const pairKey = computePairKey(userEmail, counterpartEmail);
  const { data, error } = await client
    .from('pair_protocols')
    .select('pair_key, party_a, party_b, directness_allowed, emoji_policy, address_form, deadline_style, authorship_state, updated_at')
    .eq('pair_key', pairKey)
    .maybeSingle();
  if (error) throw error;

  if (!data) {
    return {
      pairKey,
      counterpart: counterpartEmail,
      directnessAllowed: null,
      emojiPolicy: null,
      addressForm: null,
      deadlineStyle: null,
      authorshipState: 'untouched',
      updatedAt: new Date(0).toISOString(),
    };
  }
  return rowToRecord(data as PairProtocolRow, userEmail);
}

/**
 * T42 — `ProtocolRecord`(DB 조회 결과, 항상 존재)를 core의 `PairProtocol | null`(합의 없으면
 * `null` — `contract.ts` `RecipientContext.protocol` 주석 "없음이 정상이며 기본 규약을 만들어
 * 넣지 않는다")로 변환한다. `authorshipState === 'untouched'`(행이 아예 없거나 한 번도 저장된
 * 적 없음)이면 `null` — `apps/web/app/api/mediate/route.ts`가 `run()` 호출 전에 이 함수로
 * 변환한다.
 */
export function toPairProtocolOrNull(record: ProtocolRecord): PairProtocol | null {
  if (record.authorshipState === 'untouched') return null;
  return {
    directnessAllowed: record.directnessAllowed,
    emojiPolicy: record.emojiPolicy,
    addressForm: record.addressForm,
    deadlineStyle: record.deadlineStyle,
  };
}

/**
 * 🔴 저장 시 authorship_state — `docs/API.md:227` "저장 주체가 상대편이면
 * counterpart_authored, 발신자 본인이면 sender_confirmed". 이 함수(`PUT /api/protocol`)는
 * 여전히 호출자를 항상 `sender_confirmed`로 기록한다 — "상대편이 저장했는지" 판별(로그인한
 * 사용자가 `party_a`/`party_b` 중 어느 쪽인지와 무관하게, 그 저장이 실제로 상대방 계정에서
 * 왔는지 구분하는 로직)은 이 함수의 범위 밖으로 남아 있다(T41/T42 기존 갭, 이번 라운드에서
 * 건드리지 않음). `counterpart_authored`는 여전히 이 MVP 어디에서도 실제로 만들어지지 않는다.
 * **(2026-08-11, T69) Stage 4 확정 저장은 이제 존재한다 — `confirmInference()`(아래).** 그
 * 함수가 `authorship_state <> 'counterpart_authored'` 가드로 "상대가 이미 이 화면으로 직접 쓴
 * 값을 내 추론 확정이 덮으려 할 때"를 구분한다(`docs/Database.md` AC-074④ 조건부 UPDATE).
 */
export async function saveProtocol(
  client: SupabaseClient,
  userEmail: string,
  userId: string,
  body: ProtocolPutRequest,
): Promise<ProtocolRecord> {
  const pairKey = computePairKey(userEmail, body.counterpart);
  const [partyA, partyB] = [userEmail.toLowerCase(), body.counterpart.toLowerCase()].sort();

  const { data, error } = await client
    .from('pair_protocols')
    .upsert(
      {
        pair_key: pairKey,
        party_a: partyA,
        party_b: partyB,
        directness_allowed: body.directnessAllowed ?? null,
        emoji_policy: body.emojiPolicy ?? null,
        address_form: body.addressForm ?? null,
        deadline_style: body.deadlineStyle ?? null,
        authorship_state: 'sender_confirmed',
        last_written_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'pair_key' },
    )
    .select('pair_key, party_a, party_b, directness_allowed, emoji_policy, address_form, deadline_style, authorship_state, updated_at')
    .single();
  if (error) throw error;

  return rowToRecord(data as PairProtocolRow, userEmail);
}

const PROTOCOL_SELECT_COLUMNS =
  'pair_key, party_a, party_b, directness_allowed, emoji_policy, address_form, deadline_style, authorship_state, updated_at';

/**
 * T69 — `POST /api/protocol/confirm-inference`(UX-018 Stage 4, AC-074). `docs/Database.md:166`
 * "AC-074④ 경합 방어 — 조건부 UPDATE (이 형태를 유지한다)"의 `WHERE authorship_state <>
 * 'counterpart_authored'` 가드를 그대로 구현한다 — 사전 검사가 아니라 원자적 방어(Stage 3~4
 * 사이 경합).
 *
 * 🔴 **행이 아예 없을 때(`untouched`, 아직 아무도 저장한 적 없는 상대)는 조건부 UPDATE의
 * 영향 행이 0이 되어 위 가드와 구분이 안 된다** — `saveProtocol()`처럼 `upsert()` 하나로 처리할
 * 수 없는 이유가 이것이다(upsert는 이 조건부 WHERE를 표현하지 못한다). 그래서 ① 조건부 UPDATE
 * 시도 → ② 0행이면 행 존재 여부를 다시 읽어 ③ 존재하면(=counterpart_authored였다는 뜻) 409,
 * 존재하지 않으면 INSERT로 새로 만든다. ②~③ 사이의 아주 좁은 경합(같은 pair_key로 동시에 최초
 * confirm 두 건)은 남아 있다 — AC-074④가 실제로 요구하는 경합(상대가 이미 쓴 값을 내 확정이
 * 덮는 경우)은 ①의 조건부 UPDATE로 완전히 막히므로 다루지 않는다(구현 판단, 후속 라운드 재검토
 * 대상).
 */
export async function confirmInference(
  client: SupabaseClient,
  userEmail: string,
  userId: string,
  body: ProtocolPutRequest,
): Promise<ProtocolRecord> {
  const pairKey = computePairKey(userEmail, body.counterpart);
  const [partyA, partyB] = [userEmail.toLowerCase(), body.counterpart.toLowerCase()].sort();
  const now = new Date().toISOString();

  const { data: updated, error: updateError } = await client
    .from('pair_protocols')
    .update({
      directness_allowed: body.directnessAllowed ?? null,
      emoji_policy: body.emojiPolicy ?? null,
      address_form: body.addressForm ?? null,
      deadline_style: body.deadlineStyle ?? null,
      authorship_state: 'sender_confirmed',
      last_written_by: userId,
      updated_at: now,
    })
    .eq('pair_key', pairKey)
    .neq('authorship_state', 'counterpart_authored')
    .select(PROTOCOL_SELECT_COLUMNS)
    .maybeSingle();
  if (updateError) throw updateError;
  if (updated) return rowToRecord(updated as PairProtocolRow, userEmail);

  const { data: existing, error: existsError } = await client
    .from('pair_protocols')
    .select('pair_key')
    .eq('pair_key', pairKey)
    .maybeSingle();
  if (existsError) throw existsError;
  if (existing) {
    // 행은 있는데 조건부 UPDATE가 0행이었다 — 남은 유일한 경우는 counterpart_authored였다는 것.
    throw new ConflictError('상대가 이미 이 규약을 직접 작성해 확정할 수 없습니다');
  }

  const { data: inserted, error: insertError } = await client
    .from('pair_protocols')
    .insert({
      pair_key: pairKey,
      party_a: partyA,
      party_b: partyB,
      directness_allowed: body.directnessAllowed ?? null,
      emoji_policy: body.emojiPolicy ?? null,
      address_form: body.addressForm ?? null,
      deadline_style: body.deadlineStyle ?? null,
      authorship_state: 'sender_confirmed',
      last_written_by: userId,
      updated_at: now,
    })
    .select(PROTOCOL_SELECT_COLUMNS)
    .single();
  if (insertError) throw insertError;

  return rowToRecord(inserted as PairProtocolRow, userEmail);
}
