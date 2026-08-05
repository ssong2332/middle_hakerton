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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getIdempotentResponse,
  saveIdempotentResponse,
  getIdempotencyStoreSize,
  clearIdempotencyStoreForTesting,
  IDEMPOTENCY_TTL_MS,
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

  // Minor(사용자 지시 유지보수 라운드) — TTL 만료 분기(`entry.expiresAt < Date.now()`)를 실제로
  // 실패시키는 테스트가 없었다(mutation testing 관점: 그 분기를 통째로 지워도 기존 테스트는
  // 전부 green으로 남는다). TTL 만료 후 ① null이 반환되는지, ② 그 사이 같은 키로 다시 저장하면
  // (재처리) 새 값으로 실제로 갱신되는지까지 확인한다 — "만료됐다고 보고되지만 실제로는 재처리가
  // 막혀 있다" 같은 절반짜리 구현을 잡아내기 위함이다.
  describe('TTL 만료', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('TTL 경과 직전까지는 저장된 응답을 그대로 반환한다', () => {
      const start = 1_700_000_000_000;
      vi.setSystemTime(start);
      saveIdempotentResponse('user-ttl', 'key-ttl', { messageId: 'first' });

      vi.setSystemTime(start + IDEMPOTENCY_TTL_MS - 1);
      expect(getIdempotentResponse('user-ttl', 'key-ttl')).toEqual({ messageId: 'first' });
    });

    it('TTL 경과 후 조회하면 null을 반환하고, 재저장하면(재처리) 새 값으로 실제 갱신된다', () => {
      const start = 1_700_000_100_000;
      vi.setSystemTime(start);
      saveIdempotentResponse('user-ttl', 'key-ttl-2', { messageId: 'first' });

      vi.setSystemTime(start + IDEMPOTENCY_TTL_MS + 1);
      expect(getIdempotentResponse('user-ttl', 'key-ttl-2')).toBeNull();

      // 재처리 허용 확인 — 같은 (userId, key)로 다시 저장하면 이전 값이 아니라 새 값이 조회돼야
      // 한다. "만료 판정은 하지만 실제로는 옛 값이 계속 반환된다" 같은 결함을 이 단언이 잡는다.
      saveIdempotentResponse('user-ttl', 'key-ttl-2', { messageId: 'second' });
      expect(getIdempotentResponse('user-ttl', 'key-ttl-2')).toEqual({ messageId: 'second' });
    });
  });

  // Minor(사용자 지시 유지보수 라운드) — `saveIdempotentResponse`는 쓰기 시점에 정리를 하지
  // 않아서, 성공한 전송 1건당 절대 다시 읽히지 않는 항목 1개가 프로세스 수명 동안 계속 쌓였다
  // (재시도분은 read 시점에 정리되지만 성공분은 read가 다시 일어나지 않는다). 저장 시점에도
  // 만료 항목을 정리해 무한정 누적을 막는다 — read를 한 번도 호출하지 않고 저장만 반복해도
  // 순증분이 늘지 않아야 한다.
  describe('쓰기 시점 정리(sweep)', () => {
    beforeEach(() => {
      // 이 파일의 다른 테스트가 (모듈 레벨로 공유되는) store에 남긴 항목과 섞이지 않도록
      // 격리한다 — 이 describe만 정확한 크기 단언을 하기 때문에 필요하다.
      clearIdempotencyStoreForTesting();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('만료된 항목을 read로 조회한 적이 없어도, 다음 저장(쓰기) 시점에 정리되어 순증분이 늘지 않는다', () => {
      const start = 5_000_000_000_000;
      vi.setSystemTime(start);

      saveIdempotentResponse('user-sweep', 'key-sweep-old', { messageId: 'old' });
      expect(getIdempotencyStoreSize()).toBe(1);

      vi.setSystemTime(start + IDEMPOTENCY_TTL_MS + 1);
      // read(getIdempotentResponse)를 호출하지 않고 바로 저장한다 — 이미 있는 read 시점 정리가
      // 아니라 "쓰기 시점 정리"가 실제로 동작하는지를 검증한다.
      saveIdempotentResponse('user-sweep', 'key-sweep-new', { messageId: 'new' });

      // old 항목이 쓰기 시점에 정리됐다면, new 1건만 남아야 한다(정리가 없다면 old+new 2건).
      expect(getIdempotencyStoreSize()).toBe(1);
    });
  });
});
