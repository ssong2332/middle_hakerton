/**
 * `POST /api/messages` — `docs/API.md` "POST /api/messages" · `docs/Tasks.md` T14.
 * `resolveSession()`과 저장소 함수(`insertSentMessageAndDiffRecord`)는 모킹한다 — 실제 쿼리
 * 구성·보상 삭제 검증은 `apps/web/lib/messages/storage.test.ts`의 몫이다. 여기서는 라우트 배선
 * (검증 → 저장 호출 → 응답 조합 → 201, Idempotency-Key 재사용)만 본다.
 *
 * 🔴 Major 2(reviewer REJECTED → 수정) — 두 insert(`insertSentMessage`/`insertDiffRecord`)를
 * 개별 모킹하던 이전 버전은 라우트가 원자성 없이 순서대로만 호출한다는 것을 전제했다. 이제
 * 라우트는 원자성(보상 삭제)을 갖춘 단일 함수 `insertSentMessageAndDiffRecord`를 호출한다 —
 * 그 함수 내부 동작(보상 삭제)은 storage.test.ts가 이미 커버하므로 여기서는 배선만 재확인한다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/auth', () => ({
  resolveSession: vi.fn(),
}));
vi.mock('../../../lib/messages/storage', () => ({
  insertSentMessageAndDiffRecord: vi.fn(),
}));
// T20 — 3회 반복 판정(`applyPatternLearningSafe`)은 별도 모듈이라 여기서는 배선만 확인한다.
// 실제 임계값 동작(2회 미반영/3회 반영)과 내부 에러 흡수 동작은
// `lib/messages/pattern-learning.test.ts`가 검증한다.
vi.mock('../../../lib/messages/pattern-learning', () => ({
  applyPatternLearningSafe: vi.fn(),
}));

import { resolveSession } from '../../../lib/auth';
import { insertSentMessageAndDiffRecord } from '../../../lib/messages/storage';
import { applyPatternLearningSafe } from '../../../lib/messages/pattern-learning';
import { POST } from './route';

const mockResolveSession = vi.mocked(resolveSession);
const mockInsertSentMessageAndDiffRecord = vi.mocked(insertSentMessageAndDiffRecord);
const mockApplyPatternLearningSafe = vi.mocked(applyPatternLearningSafe);

const fakeClient = { from: vi.fn() } as never;

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

describe('POST /api/messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApplyPatternLearningSafe.mockResolvedValue(false);
  });

  it('AC-010/AC-012 — sent_messages·diff_records를 원자적으로 저장하고 201로 결과를 반환한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient });
    mockInsertSentMessageAndDiffRecord.mockResolvedValue({
      sentMessage: { id: 'msg-1', sentAt: '2026-08-05T10:00:00Z' },
      diffRecord: { id: 'diff-1', patternKey: null },
    });

    const response = await POST(jsonRequest(validBody));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      messageId: 'msg-1',
      diffId: 'diff-1',
      sentAt: '2026-08-05T10:00:00Z',
      patternKey: null,
      learnedApplied: false,
    });
    expect(mockInsertSentMessageAndDiffRecord).toHaveBeenCalledWith(
      fakeClient,
      expect.objectContaining({
        userId: 'user-1',
        recipientIdentifier: 'boss@example.com',
        originalText: validBody.originalText,
        finalText: validBody.finalText,
        urgency: 'NORMAL',
        channel: 'web_mock',
      }),
      expect.any(Function),
    );
    // diff_records 입력 빌더는 방금 만든 sent_messages 행의 id를 message_id로 참조해야 한다.
    const buildDiffInput = mockInsertSentMessageAndDiffRecord.mock.calls[0][2];
    expect(buildDiffInput('msg-1')).toEqual(
      expect.objectContaining({
        userId: 'user-1',
        messageId: 'msg-1',
        aiText: validBody.aiSuggestedText,
        finalText: validBody.finalText,
      }),
    );
  });

  it('필수 필드가 없으면 400 VALIDATION_FAILED를 반환하고 저장소를 호출하지 않는다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient });

    const response = await POST(jsonRequest({ ...validBody, originalText: undefined }));

    expect(response.status).toBe(400);
    expect(mockInsertSentMessageAndDiffRecord).not.toHaveBeenCalled();
  });

  it('세션이 없으면 401 AUTH_REQUIRED를 반환한다', async () => {
    mockResolveSession.mockResolvedValue(null);

    const response = await POST(jsonRequest(validBody));

    expect(response.status).toBe(401);
    expect(mockInsertSentMessageAndDiffRecord).not.toHaveBeenCalled();
  });

  // T20 — 배선 확인: applyPatternLearningSafe가 false를 돌려주면 응답도 false를 그대로 담는다.
  // 실제 3회 판정 로직은 `lib/messages/pattern-learning.test.ts`가 검증한다.
  it('applyPatternLearningSafe가 false를 반환하면 learnedApplied도 false다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient });
    mockInsertSentMessageAndDiffRecord.mockResolvedValue({
      sentMessage: { id: 'msg-2', sentAt: '2026-08-05T11:00:00Z' },
      diffRecord: { id: 'diff-2', patternKey: null },
    });
    mockApplyPatternLearningSafe.mockResolvedValue(false);

    const response = await POST(jsonRequest(validBody));
    const body = await response.json();

    expect(body.learnedApplied).toBe(false);
    expect(mockApplyPatternLearningSafe).toHaveBeenCalledWith(fakeClient, 'user-1', null);
  });

  // T20 — 배선 확인: applyPatternLearningSafe가 true(3회 도달)를 돌려주면 응답도 true를 담는다.
  it('applyPatternLearningSafe가 true를 반환하면(3회 도달) learnedApplied도 true고 patternKey를 그대로 넘긴다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient });
    mockInsertSentMessageAndDiffRecord.mockResolvedValue({
      sentMessage: { id: 'msg-2b', sentAt: '2026-08-05T11:05:00Z' },
      diffRecord: { id: 'diff-2b', patternKey: 'emoji_removed' },
    });
    mockApplyPatternLearningSafe.mockResolvedValue(true);

    const response = await POST(jsonRequest(validBody));
    const body = await response.json();

    expect(body).toMatchObject({ patternKey: 'emoji_removed', learnedApplied: true });
    expect(mockApplyPatternLearningSafe).toHaveBeenCalledWith(fakeClient, 'user-1', 'emoji_removed');
  });

  // Major 2(reviewer REJECTED → 수정) — `docs/API.md` Conventions "멱등성": `Idempotency-Key`
  // 헤더를 선택적으로 수용해 더블클릭/재시도로 인한 중복 저장을 막는다.
  it('Major 2 — 같은 Idempotency-Key로 재요청하면 저장소를 다시 호출하지 않고 첫 응답을 재사용한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient });
    mockInsertSentMessageAndDiffRecord.mockResolvedValue({
      sentMessage: { id: 'msg-3', sentAt: '2026-08-05T12:00:00Z' },
      diffRecord: { id: 'diff-3', patternKey: null },
    });

    const first = await POST(jsonRequest(validBody, { 'idempotency-key': 'dup-key-1' }));
    const firstBody = await first.json();
    const second = await POST(jsonRequest(validBody, { 'idempotency-key': 'dup-key-1' }));
    const secondBody = await second.json();

    expect(mockInsertSentMessageAndDiffRecord).toHaveBeenCalledTimes(1);
    expect(second.status).toBe(201);
    expect(secondBody).toEqual(firstBody);
  });

  it('Idempotency-Key 헤더가 없으면 매번 저장소를 새로 호출한다(기본 동작 불변)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient });
    mockInsertSentMessageAndDiffRecord
      .mockResolvedValueOnce({
        sentMessage: { id: 'msg-4', sentAt: '2026-08-05T13:00:00Z' },
        diffRecord: { id: 'diff-4', patternKey: null },
      })
      .mockResolvedValueOnce({
        sentMessage: { id: 'msg-5', sentAt: '2026-08-05T13:05:00Z' },
        diffRecord: { id: 'diff-5', patternKey: null },
      });

    await POST(jsonRequest(validBody));
    await POST(jsonRequest(validBody));

    expect(mockInsertSentMessageAndDiffRecord).toHaveBeenCalledTimes(2);
  });
});
