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
  fetchSentMessages: vi.fn(),
}));
// T20 — 3회 반복 판정(`applyPatternLearningSafe`)은 별도 모듈이라 여기서는 배선만 확인한다.
// 실제 임계값 동작(2회 미반영/3회 반영)과 내부 에러 흡수 동작은
// `lib/messages/pattern-learning.test.ts`가 검증한다.
vi.mock('../../../lib/messages/pattern-learning', () => ({
  applyPatternLearningSafe: vi.fn(),
}));

import { resolveSession } from '../../../lib/auth';
import { fetchSentMessages, insertSentMessageAndDiffRecord } from '../../../lib/messages/storage';
import { applyPatternLearningSafe } from '../../../lib/messages/pattern-learning';
import { GET, POST } from './route';

const mockResolveSession = vi.mocked(resolveSession);
const mockInsertSentMessageAndDiffRecord = vi.mocked(insertSentMessageAndDiffRecord);
const mockApplyPatternLearningSafe = vi.mocked(applyPatternLearningSafe);
const mockFetchSentMessages = vi.mocked(fetchSentMessages);

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

  // 🔴 T32(reviewer 재검토, 2026-08-10 발견·수정) — `docs/API.md:122` 서버 규칙 "CRITICAL이면
  // scheduledFor를 무시하고 NULL로 저장한다(AC-005)"가 계약에는 있었지만 실제로는 클라이언트가
  // 보낸 값을 그대로 저장하고 있었다(T14 구현 당시부터의 회귀 — 그때는 아직 T32가 검증하기 전).
  it('AC-005 — CRITICAL이면 클라이언트가 scheduledFor를 보내도 무시하고 NULL로 저장한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient });
    mockInsertSentMessageAndDiffRecord.mockResolvedValue({
      sentMessage: { id: 'msg-critical', sentAt: '2026-08-10T10:00:00Z' },
      diffRecord: { id: 'diff-critical', patternKey: null },
    });

    await POST(
      jsonRequest({ ...validBody, urgency: 'CRITICAL', scheduledFor: '2026-08-11T00:00:00Z' }),
    );

    expect(mockInsertSentMessageAndDiffRecord).toHaveBeenCalledWith(
      fakeClient,
      expect.objectContaining({ urgency: 'CRITICAL', scheduledFor: null }),
      expect.any(Function),
    );
  });

  it('NORMAL/LOW이면 클라이언트가 보낸 scheduledFor를 그대로 저장한다(대조군)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient });
    mockInsertSentMessageAndDiffRecord.mockResolvedValue({
      sentMessage: { id: 'msg-normal', sentAt: '2026-08-10T10:00:00Z' },
      diffRecord: { id: 'diff-normal', patternKey: null },
    });

    await POST(
      jsonRequest({ ...validBody, urgency: 'NORMAL', scheduledFor: '2026-08-11T00:00:00Z' }),
    );

    expect(mockInsertSentMessageAndDiffRecord).toHaveBeenCalledWith(
      fakeClient,
      expect.objectContaining({ urgency: 'NORMAL', scheduledFor: '2026-08-11T00:00:00Z' }),
      expect.any(Function),
    );
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

// T52 — `GET /api/messages`(UX-015 목록). `fetchSentMessages`는 모킹한다(쿼리 구성은
// storage.test.ts가 이미 검증) — 여기서는 배선(쿼리 파라미터 파싱 → 조회 호출 → 업무일 경과
// 계산 배선 → 응답 조합)만 본다.
function getRequest(query = ''): Request {
  return new Request(`http://localhost/api/messages${query}`, { method: 'GET' });
}

describe('GET /api/messages — T52', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("쿼리 파라미터가 없으면 replied='all'·limit=50으로 조회한다", async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient });
    mockFetchSentMessages.mockResolvedValue([]);

    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ items: [] });
    expect(mockFetchSentMessages).toHaveBeenCalledWith(fakeClient, 'user-1', 'all', 50);
  });

  it('replied=true·limit=10 쿼리를 그대로 전달한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient });
    mockFetchSentMessages.mockResolvedValue([]);

    await GET(getRequest('?replied=true&limit=10'));

    expect(mockFetchSentMessages).toHaveBeenCalledWith(fakeClient, 'user-1', 'true', 10);
  });

  it("replied가 all/true/false가 아닌 값이면 'all'로 취급한다(임의 문자열 방어)", async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient });
    mockFetchSentMessages.mockResolvedValue([]);

    await GET(getRequest('?replied=bogus'));

    expect(mockFetchSentMessages).toHaveBeenCalledWith(fakeClient, 'user-1', 'all', 50);
  });

  it('AC-044② — 미답장 건은 businessDaysElapsed/reminderSuggested를 계산해 채운다(주말만 낀 3일 경과)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient });
    // 2026-08-05(수) 발송, country=null(공휴일 데이터 없음 — 주말만 제외).
    mockFetchSentMessages.mockResolvedValue([
      {
        id: 'msg-1',
        recipient: 'boss@example.com',
        recipientCountry: null,
        recipientTimezone: null,
        finalText: 'Please confirm by tomorrow.',
        urgency: 'NORMAL',
        sentAt: '2026-08-05T00:00:00Z',
        replied: false,
        repliedMarkedAt: null,
        isReminder: false,
        mediationApplied: true,
      },
    ]);

    // 2026-08-05(수) → 2026-08-10(월) now: 목/금/월 = 업무일 3일(토/일 제외).
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T00:00:00Z'));
    let body: { items: Array<Record<string, unknown>> };
    try {
      const response = await GET(getRequest());
      body = await response.json();
    } finally {
      vi.useRealTimers();
    }

    expect(body.items[0]).toMatchObject({
      id: 'msg-1',
      businessDaysElapsed: 3,
      reminderSuggested: true,
    });
    // recipientTimezone은 응답 필드에 없다(docs/API.md:132).
    expect(body.items[0].recipientTimezone).toBeUndefined();
  });

  it('AC-044 — 답장 받은 건은 businessDaysElapsed:null·reminderSuggested:false로 응답한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient });
    mockFetchSentMessages.mockResolvedValue([
      {
        id: 'msg-2',
        recipient: 'boss@example.com',
        recipientCountry: 'KR',
        recipientTimezone: 'Asia/Seoul',
        finalText: '확인했습니다.',
        urgency: 'NORMAL',
        sentAt: '2026-08-01T00:00:00Z',
        replied: true,
        repliedMarkedAt: '2026-08-02T00:00:00Z',
        isReminder: false,
        mediationApplied: true,
      },
    ]);

    const response = await GET(getRequest());
    const body = await response.json();

    expect(body.items[0]).toMatchObject({
      id: 'msg-2',
      businessDaysElapsed: null,
      reminderSuggested: false,
    });
  });

  it('세션이 없으면 401 AUTH_REQUIRED를 반환하고 조회하지 않는다', async () => {
    mockResolveSession.mockResolvedValue(null);

    const response = await GET(getRequest());

    expect(response.status).toBe(401);
    expect(mockFetchSentMessages).not.toHaveBeenCalled();
  });
});
