/**
 * Major 2(reviewer REJECTED → 수정) — `docs/API.md` Conventions "멱등성": "`POST /api/messages`
 * 만 `Idempotency-Key` 헤더를 선택적으로 수용(더블클릭 방지)." 서버 쪽 백스톱 — 클라이언트의
 * 자기 비활성화(`docs/UX.md` "Duplicate/double-click submission")가 이미 있지만, 네트워크
 * 재시도·경합 상황까지 막으려면 서버도 같은 키의 재요청을 다시 처리하지 않아야 한다.
 *
 * 이 저장소는 프로세스 메모리 한정이다(리포에 분산 캐시가 없다 — `docs/CodingRules.md` "채우지
 * 않은 칸"에 별도 인프라 결정이 없음) — 단일 데모 서버 프로세스 범위의 더블클릭 방지가 목적이며,
 * 여러 서버 인스턴스 간 공유는 이 구현의 범위 밖이다(구현 보고서에 명시).
 */
import { describe, expect, it } from 'vitest';
import {
  getIdempotentResponse,
  saveIdempotentResponse,
} from './idempotency';

describe('idempotency store', () => {
  it('저장된 적 없는 (userId, key) 조합은 null을 반환한다', () => {
    expect(getIdempotentResponse('user-1', 'never-seen-key')).toBeNull();
  });

  it('저장 후 같은 (userId, key)로 조회하면 저장했던 응답을 그대로 돌려준다', () => {
    saveIdempotentResponse('user-1', 'key-a', { messageId: 'msg-1', diffId: 'diff-1' });

    expect(getIdempotentResponse('user-1', 'key-a')).toEqual({
      messageId: 'msg-1',
      diffId: 'diff-1',
    });
  });

  it('같은 key라도 다른 userId면 별개로 취급한다(교차 조회 방지)', () => {
    saveIdempotentResponse('user-2', 'key-b', { messageId: 'msg-2' });

    expect(getIdempotentResponse('user-3', 'key-b')).toBeNull();
  });
});
