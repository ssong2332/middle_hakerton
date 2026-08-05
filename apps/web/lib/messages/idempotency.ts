/**
 * Major 2(reviewer REJECTED → 수정) — `docs/API.md` Conventions "멱등성": `POST /api/messages`가
 * `Idempotency-Key` 헤더를 선택적으로 수용해 더블클릭·네트워크 재시도로 인한 중복 저장을
 * 막는다. `docs/UX.md` "Duplicate/double-click submission"(제출 컨트롤 자기 비활성화)이 이미
 * 1차 방어선이지만, 이 저장소는 그 요청이 실제로 서버에 두 번 도달하는 경합(예: 클릭 직후
 * 네트워크 재시도)까지 막는 서버 쪽 백스톱이다.
 *
 * 🔴 프로세스 메모리 한정 — 여러 서버 인스턴스 간 공유되지 않는다. 이 리포에 분산 캐시/큐
 * 인프라가 없고(`docs/CodingRules.md` "채우지 않은 칸"에도 없음), 새 의존성을 추가할 근거가
 * "더블클릭 방지"라는 좁은 목적에 비해 과하다고 판단했다 — 단일 데모 서버 프로세스 범위에서는
 * 충분하다(구현 보고서에 이 gap을 남긴다).
 */

const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000; // 5분 — 더블클릭 방지 목적, 장기 보관 불필요

interface StoredEntry {
  expiresAt: number;
  body: unknown;
}

const store = new Map<string, StoredEntry>();

function keyFor(userId: string, idempotencyKey: string): string {
  return `${userId}:${idempotencyKey}`;
}

/** 이전에 같은 (userId, idempotencyKey)로 저장된 응답이 있으면 그대로 돌려준다. 없거나 만료면 `null`. */
export function getIdempotentResponse<T>(userId: string, idempotencyKey: string): T | null {
  const key = keyFor(userId, idempotencyKey);
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return null;
  }
  return entry.body as T;
}

/** (userId, idempotencyKey) 조합으로 응답을 저장한다 — 이후 같은 조합의 재요청은 이 값을 재사용한다. */
export function saveIdempotentResponse<T>(userId: string, idempotencyKey: string, body: T): void {
  store.set(keyFor(userId, idempotencyKey), { expiresAt: Date.now() + IDEMPOTENCY_TTL_MS, body });
}
