/**
 * `POST /api/protocol/confirm-inference` — `docs/API.md:229` · `docs/Tasks.md` T69 (AC-074).
 * `confirmInference()`는 모킹한다 — 가드 로직 검증은
 * `apps/web/lib/protocol/storage.test.ts`의 몫. 여기서는 라우트 배선 + 409 매핑만 본다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError } from '@cross-border/core';

vi.mock('../../../../lib/auth', () => ({
  resolveSession: vi.fn(),
}));
vi.mock('../../../../lib/protocol/storage', () => ({
  confirmInference: vi.fn(),
}));

import { resolveSession } from '../../../../lib/auth';
import { confirmInference } from '../../../../lib/protocol/storage';
import { POST } from './route';

const mockResolveSession = vi.mocked(resolveSession);
const mockConfirmInference = vi.mocked(confirmInference);

function fakeClient(email = 'me@example.com') {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { email } }, error: null }) },
  } as never;
}

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/protocol/confirm-inference', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const SAMPLE_RECORD = {
  pairKey: 'k',
  counterpart: 'tanaka@sakuradigital.example',
  directnessAllowed: null,
  emojiPolicy: 'ok' as const,
  addressForm: null,
  deadlineStyle: null,
  authorshipState: 'sender_confirmed' as const,
  updatedAt: '2026-08-11T00:00:00.000Z',
};

describe('POST /api/protocol/confirm-inference — AC-074', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('세션 이메일 + body로 confirmInference에 위임하고 200으로 저장 결과를 응답한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient() });
    mockConfirmInference.mockResolvedValue(SAMPLE_RECORD);

    const response = await POST(
      postRequest({ counterpart: 'tanaka@sakuradigital.example', emojiPolicy: 'ok' }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockConfirmInference).toHaveBeenCalledWith(expect.anything(), 'me@example.com', 'user-1', {
      counterpart: 'tanaka@sakuradigital.example',
      emojiPolicy: 'ok',
    });
    expect(body.authorshipState).toBe('sender_confirmed');
  });

  it('상대가 이미 규약을 직접 작성했으면 409 CONFLICT_PROTOCOL_AUTHORED를 반환한다(AC-074④)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient() });
    mockConfirmInference.mockRejectedValue(new ConflictError('상대가 이미 이 규약을 직접 작성해 확정할 수 없습니다'));

    const response = await POST(
      postRequest({ counterpart: 'tanaka@sakuradigital.example', emojiPolicy: 'ok' }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe('CONFLICT_PROTOCOL_AUTHORED');
  });

  it('5번째 축(미지 키)이 있으면 400을 반환한다(축 확장 요청 거부)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient() });

    const response = await POST(
      postRequest({ counterpart: 'tanaka@sakuradigital.example', honorificLevel: 'haeyo' }),
    );

    expect(response.status).toBe(400);
    expect(mockConfirmInference).not.toHaveBeenCalled();
  });

  it('인증되지 않은 요청은 401을 반환한다', async () => {
    mockResolveSession.mockResolvedValue(null);

    const response = await POST(postRequest({ counterpart: 'tanaka@sakuradigital.example' }));

    expect(response.status).toBe(401);
    expect(mockConfirmInference).not.toHaveBeenCalled();
  });
});
