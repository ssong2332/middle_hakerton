/**
 * T41/T42 — `pair_protocols` 조회·저장(AC-037, AC-075). `docs/Database.md` "pair_protocols"
 * 절 그대로 구현한다.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PairProtocol } from '@cross-border/core';
import type { ProtocolPutRequest } from './schema';

/**
 * 🔴 `docs/Database.md:140`의 `pair_key` 정의("두 식별자를 소문자화 후 정렬해 X로 연결") —
 * 원문의 구분자 문자는 마크다운 렌더링에서 소실됐지만 원본 바이트는 U+0001(제어문자, "SOH")이다
 * (`sed -n '140p' docs/Database.md | cat -A`로 확인 — `^A`). 이메일 문자열에 나타날 수 없는
 * 문자라 구분자로 안전하다.
 */
const PAIR_KEY_SEPARATOR = '';

function computePairKey(a: string, b: string): string {
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
 * counterpart_authored, 발신자 본인이면 sender_confirmed". MVP에는 Stage 4 확정 저장
 * (`POST /api/protocol/confirm-inference`, #34/T64 P2 묶음)이 아직 없어 이 라우트로 저장하는
 * 경로는 항상 "본인이 이 화면을 열어 직접 쓰는" 경우뿐이다 — 그래서 이 함수는 호출자를 항상
 * `sender_confirmed`로 기록한다. `counterpart_authored`는 이 MVP 쓰기 경로에서는 만들어지지
 * 않는다(Stage 4 확정이 붙는 후속 라운드에서, "상대가 이미 이 화면으로 직접 쓴 값을 내
 * 추론 확정이 덮으려 할 때"를 구분하는 용도로 도입될 값 — `docs/Database.md` AC-074④
 * 조건부 UPDATE 참조). 이 판단은 구현 판단으로 남기며, 후속 라운드에서 Stage 4가 붙을 때
 * 재검토 대상이다.
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
