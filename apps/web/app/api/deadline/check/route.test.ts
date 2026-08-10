/**
 * `POST /api/deadline/check` — `docs/API.md` "POST /api/deadline/check" · `docs/Tasks.md` T39
 * (AC-036, AC-057, AC-005). `checkDeadlineFeasibility()`는
 * `packages/core/src/rules/deadline-negotiation.test.ts`가 이미 검증한다 — 여기서는 라우트
 * 배선(검증 → CRITICAL 게이트 → 위임 → 응답)만 본다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/auth', () => ({
  resolveSession: vi.fn(),
}));

import { resolveSession } from '../../../../lib/auth';
import { POST } from './route';

const mockResolveSession = vi.mocked(resolveSession);

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/deadline/check', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_RECIPIENT = {
  timezone: 'Asia/Seoul',
  workStart: '09:00',
  workEnd: '18:00',
  country: 'KR',
};

describe('POST /api/deadline/check — AC-036, AC-057, AC-005', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('인증되지 않은 요청은 401을 반환한다', async () => {
    mockResolveSession.mockResolvedValue(null);

    const response = await POST(
      postRequest({ urgency: 'NORMAL', neededBy: '2026-03-16T01:00:00Z', recipient: VALID_RECIPIENT }),
    );

    expect(response.status).toBe(401);
  });

  it('CRITICAL이면 400이 아니라 200 + skipped를 반환하고 counterOffers는 항상 빈 배열이다(AC-005)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });

    const response = await POST(
      postRequest({ urgency: 'CRITICAL', neededBy: '2026-02-17T01:00:00Z', recipient: VALID_RECIPIENT }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.skipped).toBe('critical_immediate');
    expect(body.feasible).toBe(true);
    expect(body.counterOffers).toEqual([]);
  });

  it('NORMAL + 실현 가능 → feasible true, skipped 필드가 없다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });

    const response = await POST(
      postRequest({ urgency: 'NORMAL', neededBy: '2026-03-16T01:00:00Z', recipient: VALID_RECIPIENT }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.feasible).toBe(true);
    expect(body.skipped).toBeUndefined();
  });

  it('LOW + 공휴일과 겹침 → feasible false + counterOffers 최소 1개(AC-036b)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });

    const response = await POST(
      postRequest({ urgency: 'LOW', neededBy: '2026-02-17T01:00:00Z', recipient: VALID_RECIPIENT }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.feasible).toBe(false);
    expect(body.counterOffers.length).toBeGreaterThanOrEqual(1);
  });

  it('타임존이 알 수 없는 IANA 값이면 400을 반환한다(T31 선례와 동일한 계약)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });

    const response = await POST(
      postRequest({
        urgency: 'NORMAL',
        neededBy: '2026-03-16T01:00:00Z',
        recipient: { ...VALID_RECIPIENT, timezone: 'Not/AZone' },
      }),
    );

    expect(response.status).toBe(400);
  });

  it('neededBy가 올바른 날짜/시각 형식이 아니면 400을 반환한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });

    const response = await POST(
      postRequest({ urgency: 'NORMAL', neededBy: 'not-a-date', recipient: VALID_RECIPIENT }),
    );

    expect(response.status).toBe(400);
  });

  it('근무 종료가 시작보다 이르거나 같으면 400을 반환한다(클라이언트를 믿지 않는다)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });

    const response = await POST(
      postRequest({
        urgency: 'NORMAL',
        neededBy: '2026-03-16T01:00:00Z',
        recipient: { ...VALID_RECIPIENT, workStart: '18:00', workEnd: '09:00' },
      }),
    );

    expect(response.status).toBe(400);
  });

  it('recipient.country를 생략해도 400이 아니다 — 공휴일 배제 없이 근무시간만으로 판정한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    const recipientWithoutCountry = {
      timezone: VALID_RECIPIENT.timezone,
      workStart: VALID_RECIPIENT.workStart,
      workEnd: VALID_RECIPIENT.workEnd,
    };

    const response = await POST(
      postRequest({
        urgency: 'NORMAL',
        neededBy: '2026-03-16T01:00:00Z',
        recipient: recipientWithoutCountry,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.feasible).toBe(true);
  });
});
