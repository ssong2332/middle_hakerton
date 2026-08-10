/**
 * `PATCH /api/messages/{id}` — `docs/API.md` "PATCH /api/messages/{id}" · `docs/Tasks.md` T50
 * (AC-044①, AC-024). `updateSentMessage()`는 `apps/web/lib/messages/storage.test.ts`가 이미
 * 검증한다 — 여기서는 라우트 배선(id 파싱 → 검증 → 위임 → 응답)만 본다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/auth', () => ({
  resolveSession: vi.fn(),
}));
vi.mock('../../../../lib/messages/storage', () => ({
  updateSentMessage: vi.fn(),
}));

import { NotFoundError, ValidationError } from '@cross-border/core';
import { resolveSession } from '../../../../lib/auth';
import { updateSentMessage } from '../../../../lib/messages/storage';
import { PATCH } from './route';

const mockResolveSession = vi.mocked(resolveSession);
const mockUpdate = vi.mocked(updateSentMessage);

const fakeClient = { from: vi.fn() } as never;

function patchRequest(id: string, body: unknown): Request {
  return new Request(`http://localhost/api/messages/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('PATCH /api/messages/{id} — AC-044①, AC-024', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient });
  });

  it('URL 마지막 세그먼트를 id로 파싱해 세션 userId·본문과 함께 updateSentMessage에 위임한다', async () => {
    mockUpdate.mockResolvedValue({
      id: 'msg-1',
      replied: true,
      repliedMarkedAt: '2026-08-10T10:00:00Z',
      scheduledFor: null,
    });

    const response = await PATCH(patchRequest('msg-1', { replied: true }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(fakeClient, 'user-1', 'msg-1', { replied: true });
    expect(body.replied).toBe(true);
  });

  it('scheduledFor만 보내도 위임한다', async () => {
    mockUpdate.mockResolvedValue({
      id: 'msg-2',
      replied: false,
      repliedMarkedAt: null,
      scheduledFor: '2026-08-11T00:00:00Z',
    });

    const response = await PATCH(
      patchRequest('msg-2', { scheduledFor: '2026-08-11T00:00:00Z' }),
    );

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(fakeClient, 'user-1', 'msg-2', {
      scheduledFor: '2026-08-11T00:00:00Z',
    });
  });

  it('replied·scheduledFor 둘 다 없으면 400 VALIDATION_FAILED를 반환하고 위임하지 않는다', async () => {
    const response = await PATCH(patchRequest('msg-1', {}));

    expect(response.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('대상이 없으면(NotFoundError) 404를 반환한다', async () => {
    mockUpdate.mockRejectedValue(new NotFoundError('발송 기록을 찾을 수 없습니다'));

    const response = await PATCH(patchRequest('missing-id', { replied: true }));

    expect(response.status).toBe(404);
  });

  it('AC-005 — CRITICAL 메시지의 scheduledFor 변경 시도는(ValidationError) 400을 반환한다', async () => {
    mockUpdate.mockRejectedValue(
      new ValidationError('CRITICAL 메시지는 예약 발송을 설정할 수 없습니다'),
    );

    const response = await PATCH(
      patchRequest('msg-critical', { scheduledFor: '2026-08-11T00:00:00Z' }),
    );

    expect(response.status).toBe(400);
  });

  it('인증되지 않은 요청은 401 AUTH_REQUIRED를 반환하고 위임하지 않는다', async () => {
    mockResolveSession.mockResolvedValue(null);

    const response = await PATCH(patchRequest('msg-1', { replied: true }));

    expect(response.status).toBe(401);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
