/**
 * `GET /api/feedback` — `docs/API.md` "GET /api/feedback" · `docs/Tasks.md` T33 (AC-025,
 * AC-070). `fetchRepliedMessages()`/`summarizeFeedback()`는 각각
 * `apps/web/lib/messages/storage.test.ts`·`packages/core/src/rules/feedback-summary.test.ts`가
 * 이미 검증한다 — 여기서는 라우트 배선(세션 확인 → 조회 → 계산 위임 → 응답)만 본다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/auth', () => ({
  resolveSession: vi.fn(),
}));
vi.mock('../../../lib/messages/storage', () => ({
  fetchRepliedMessages: vi.fn(),
}));

import { resolveSession } from '../../../lib/auth';
import { fetchRepliedMessages } from '../../../lib/messages/storage';
import { GET } from './route';

const mockResolveSession = vi.mocked(resolveSession);
const mockFetchRepliedMessages = vi.mocked(fetchRepliedMessages);

const fakeClient = { from: vi.fn() } as never;

function plainRequest(): Request {
  return new Request('http://localhost/api/feedback', { method: 'GET' });
}

describe('GET /api/feedback — AC-025, AC-070', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient });
  });

  it('세션 userId로 fetchRepliedMessages를 호출하고 그 결과를 summarizeFeedback으로 계산해 200으로 응답한다', async () => {
    mockFetchRepliedMessages.mockResolvedValue([
      { id: 'm1', sentAt: '2026-08-10T00:00:00Z', repliedMarkedAt: '2026-08-10T02:00:00Z', mediationApplied: true },
      { id: 'm2', sentAt: '2026-08-10T00:00:00Z', repliedMarkedAt: '2026-08-10T10:00:00Z', mediationApplied: false },
    ]);

    const response = await GET(plainRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockFetchRepliedMessages).toHaveBeenCalledWith(fakeClient, 'user-1');
    expect(body.withMediation).toEqual({ count: 1, medianHours: 2 });
    expect(body.withoutMediation).toEqual({ count: 1, medianHours: 10 });
    expect(body.items).toHaveLength(2);
  });

  it('답장 마킹된 건이 하나도 없으면 두 그룹 모두 count 0, medianHours null을 응답한다(표본 0을 지어내지 않는다)', async () => {
    mockFetchRepliedMessages.mockResolvedValue([]);

    const response = await GET(plainRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      withMediation: { count: 0, medianHours: null },
      withoutMediation: { count: 0, medianHours: null },
      items: [],
    });
  });

  it('감정 분류 관련 필드가 응답에 없다(AC-070②③)', async () => {
    mockFetchRepliedMessages.mockResolvedValue([
      { id: 'm1', sentAt: '2026-08-10T00:00:00Z', repliedMarkedAt: '2026-08-10T02:00:00Z', mediationApplied: true },
    ]);

    const response = await GET(plainRequest());
    const body = await response.json();

    expect(JSON.stringify(body)).not.toMatch(/sentiment|emotion|감정/i);
  });

  it('인증되지 않은 요청은 401 AUTH_REQUIRED를 반환하고 조회를 호출하지 않는다', async () => {
    mockResolveSession.mockResolvedValue(null);

    const response = await GET(plainRequest());

    expect(response.status).toBe(401);
    expect(mockFetchRepliedMessages).not.toHaveBeenCalled();
  });
});
