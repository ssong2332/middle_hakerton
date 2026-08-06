/**
 * 🔴 Reviewer Major(REJECTED → 수정) 회귀 테스트 — `POST /api/messages` 배선 테스트
 * (`route.test.ts`)는 `lib/messages/pattern-learning`을 통째로 모킹해 `applyPatternLearningSafe`가
 * 항상 정상 반환한다고 가정한다. 그래서는 "내부(`applyPatternLearning`/`countDiffRecordsForPattern`
 * 등)가 실제로 던졌을 때도 라우트가 여전히 201을 반환하고, 발송이 이미 커밋된 뒤 멱등성 캐시까지
 * 정상적으로 쓰이는가"를 증명하지 못한다.
 *
 * 이 파일은 `pattern-learning` 모듈을 모킹하지 않고 **실제 `applyPatternLearningSafe`**를 그대로
 * 태운다. 대신 `session.client`로 넘기는 Supabase 페이크가 `diff_records` 카운트 쿼리에서 에러를
 * 던지게 만들어(`countDiffRecordsForPattern`이 `if (error) throw error`로 재던지는 지점,
 * `lib/messages/pattern-learning.ts`), `applyPatternLearningSafe`의 내부 catch가 실제로 그 예외를
 * 흡수하는지 라우트 레벨에서 확인한다.
 *
 * 수정 전(버그): 이 경로에서 `applyPatternLearning`을 직접 호출했으므로 예외가 라우트까지
 * 전파되어 `withApi()`가 500으로 변환했다 — `insertSentMessageAndDiffRecord`는 이미 커밋됐지만
 * `saveIdempotentResponse`는 아직 실행되지 않은 상태라, 클라이언트가 같은 `Idempotency-Key`로
 * 재시도하면 캐시 미스로 저장소가 다시 호출되어 중복 발송이 될 수 있었다.
 * 수정 후: `applyPatternLearningSafe`가 예외를 잡아 `learnedApplied: false`로 안전하게 반환하므로
 * 라우트는 201을 반환하고, 그 응답이 멱등성 캐시에도 정상적으로 저장된다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/auth', () => ({
  resolveSession: vi.fn(),
}));
vi.mock('../../../lib/messages/storage', () => ({
  insertSentMessageAndDiffRecord: vi.fn(),
}));
// 🔴 이 테스트 파일만 pattern-learning을 모킹하지 않는다 — 실제 catch 동작을 검증하는 것이 목적.

import { resolveSession } from '../../../lib/auth';
import { insertSentMessageAndDiffRecord } from '../../../lib/messages/storage';
import { clearIdempotencyStoreForTesting } from '../../../lib/messages/idempotency';
import { POST } from './route';

const mockResolveSession = vi.mocked(resolveSession);
const mockInsertSentMessageAndDiffRecord = vi.mocked(insertSentMessageAndDiffRecord);

/**
 * `applyPatternLearning` → `countDiffRecordsForPattern`이 `diff_records` 쿼리에서 즉시 던지도록
 * 만드는 최소 페이크. `pattern-learning.ts`의 실제 체이닝(`.select().eq().eq()` → `then`)을
 * 흉내낸다(`lib/messages/pattern-learning.test.ts`의 페이크와 동형).
 */
function createThrowingSupabaseClient() {
  return {
    from: (table: string) => {
      if (table !== 'diff_records') {
        throw new Error(`unexpected table in this fake: ${table}`);
      }
      const chain = {
        eq: () => chain,
        // `countDiffRecordsForPattern`은 `await client.from(...).select(...).eq().eq()`가
        // `{ count, error }`를 반환한다고 가정하고 `if (error) throw error`로 재던진다
        // (`lib/messages/pattern-learning.ts`). 여기서 그 error 필드를 채워 실제 재던지기
        // 경로를 그대로 탄다(`lib/messages/pattern-learning.test.ts`의 countError 페이크와 동형).
        then: (resolve: (result: { count: number | null; error: unknown }) => unknown) =>
          resolve({ count: null, error: { message: 'supabase diff_records count query failed' } }),
      };
      return { select: () => chain };
    },
  } as never;
}

function jsonRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/messages', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  });
}

const validBody = {
  originalText: '내일까지 확인 부탁드립니다.',
  finalText: 'Please confirm by tomorrow.',
  aiSuggestedText: 'Please confirm by tomorrow.',
  urgency: 'NORMAL',
  recipient: 'boss@example.com',
  recipientCountry: null,
  recipientTimezone: null,
  channel: 'web_mock',
  scheduledFor: null,
  mediationApplied: true,
};

describe('POST /api/messages — applyPatternLearning이 내부에서 던져도 발송 성공/멱등성이 지켜진다', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearIdempotencyStoreForTesting();
  });

  it('diff_records 카운트 쿼리가 던져도 500이 아니라 201을 반환하고 learnedApplied: false다', async () => {
    const throwingClient = createThrowingSupabaseClient();
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: throwingClient });
    mockInsertSentMessageAndDiffRecord.mockResolvedValue({
      sentMessage: { id: 'msg-throw-1', sentAt: '2026-08-06T10:00:00Z' },
      diffRecord: { id: 'diff-throw-1', patternKey: 'emoji_removed' },
    });

    const response = await POST(jsonRequest(validBody));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      messageId: 'msg-throw-1',
      patternKey: 'emoji_removed',
      learnedApplied: false,
    });
  });

  it('발송이 이미 커밋된 뒤 학습 단계가 던져도 멱등성 캐시가 정상적으로 쓰여, 같은 키로 재시도하면 저장소를 다시 호출하지 않는다', async () => {
    const throwingClient = createThrowingSupabaseClient();
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: throwingClient });
    mockInsertSentMessageAndDiffRecord.mockResolvedValue({
      sentMessage: { id: 'msg-throw-2', sentAt: '2026-08-06T10:05:00Z' },
      diffRecord: { id: 'diff-throw-2', patternKey: 'emoji_removed' },
    });

    const first = await POST(jsonRequest(validBody, { 'idempotency-key': 'retry-key-1' }));
    expect(first.status).toBe(201);
    expect(mockInsertSentMessageAndDiffRecord).toHaveBeenCalledTimes(1);

    // 수정 전 버그였다면: 학습 단계 예외가 saveIdempotentResponse 실행 전에 500으로 라우트를
    // 끊어, 이 두 번째 호출이 캐시 미스로 저장소를 다시 호출해(중복 발송) 카운트가 2가 됐을 것.
    const second = await POST(jsonRequest(validBody, { 'idempotency-key': 'retry-key-1' }));
    expect(second.status).toBe(201);
    expect(mockInsertSentMessageAndDiffRecord).toHaveBeenCalledTimes(1);

    const secondBody = await second.json();
    expect(secondBody).toMatchObject({ messageId: 'msg-throw-2', learnedApplied: false });
  });
});
