/**
 * `POST /api/meeting-times` — `docs/API.md` "POST /api/meeting-times" · `docs/Tasks.md` T31
 * (AC-023). `findMeetingCandidates()`는 `packages/core/src/rules/meeting-times.test.ts`가
 * 이미 검증한다 — 여기서는 라우트 배선(검증 → 위임 → 응답)만 본다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/auth', () => ({
  resolveSession: vi.fn(),
}));

import { resolveSession } from '../../../lib/auth';
import { POST } from './route';

const mockResolveSession = vi.mocked(resolveSession);

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/meeting-times', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  sender: { timezone: 'Asia/Seoul', workStart: '09:00', workEnd: '18:00' },
  recipient: { timezone: 'Asia/Seoul', workStart: '14:00', workEnd: '20:00' },
  dateRange: { from: '2026-08-12', to: '2026-08-12' },
};

describe('POST /api/meeting-times — AC-023', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('인증되지 않은 요청은 401을 반환한다', async () => {
    mockResolveSession.mockResolvedValue(null);

    const response = await POST(postRequest(VALID_BODY));

    expect(response.status).toBe(401);
  });

  it('겹치는 근무시간이 있으면 200 + candidates를 반환한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });

    const response = await POST(postRequest(VALID_BODY));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.candidates.length).toBeGreaterThan(0);
    expect(body.candidates[0].senderLocal).toBe('2026-08-12 14:00');
  });

  it('겹침이 없으면 200 + 빈 배열을 반환한다(억지 후보 금지)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });

    const response = await POST(
      postRequest({
        sender: { timezone: 'Asia/Seoul', workStart: '09:00', workEnd: '12:00' },
        recipient: { timezone: 'America/Los_Angeles', workStart: '09:00', workEnd: '12:00' },
        dateRange: { from: '2026-08-12', to: '2026-08-12' },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.candidates).toEqual([]);
  });

  it('시각 형식이 HH:mm이 아니면 400을 반환한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });

    const response = await POST(
      postRequest({
        ...VALID_BODY,
        sender: { ...VALID_BODY.sender, workStart: '9am' },
      }),
    );

    expect(response.status).toBe(400);
  });

  it('workEnd가 workStart보다 이르거나 같으면 400을 반환한다(클라이언트를 믿지 않는다)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });

    const response = await POST(
      postRequest({
        ...VALID_BODY,
        sender: { timezone: 'Asia/Seoul', workStart: '18:00', workEnd: '09:00' },
      }),
    );

    expect(response.status).toBe(400);
  });

  it('dateRange.to가 dateRange.from보다 앞서면 400을 반환한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });

    const response = await POST(
      postRequest({
        ...VALID_BODY,
        dateRange: { from: '2026-08-20', to: '2026-08-12' },
      }),
    );

    expect(response.status).toBe(400);
  });
});
