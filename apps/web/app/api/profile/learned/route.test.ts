/**
 * `GET /api/profile/learned` — `docs/API.md` "GET /api/profile/learned · DELETE
 * /api/profile/learned/{id}" · `docs/Tasks.md` T21. `resolveSession()`과
 * `fetchLearnedItemsDetailed()`는 모킹한다 — 실제 조회 검증은
 * `apps/web/lib/profile/storage.test.ts`의 몫이다. 여기서는 라우트 배선만 본다. AC-013, AC-014.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/auth', () => ({
  resolveSession: vi.fn(),
}));
vi.mock('../../../../lib/profile/storage', () => ({
  fetchLearnedItemsDetailed: vi.fn(),
}));

import { resolveSession } from '../../../../lib/auth';
import { fetchLearnedItemsDetailed } from '../../../../lib/profile/storage';
import { GET } from './route';

const mockResolveSession = vi.mocked(resolveSession);
const mockFetchLearnedItemsDetailed = vi.mocked(fetchLearnedItemsDetailed);

const fakeClient = { from: vi.fn() } as never;

function plainRequest(): Request {
  return new Request('http://localhost/api/profile/learned', { method: 'GET' });
}

describe('GET /api/profile/learned', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient });
  });

  it('세션 userId로 fetchLearnedItemsDetailed에 위임하고 { items } 형태로 200을 반환한다', async () => {
    mockFetchLearnedItemsDetailed.mockResolvedValue([
      {
        id: 'item-1',
        patternKey: 'emoji_removed',
        value: 'avoids',
        observedCount: 3,
        appliedAt: '2026-08-07T00:00:00Z',
      },
    ]);

    const response = await GET(plainRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockFetchLearnedItemsDetailed).toHaveBeenCalledWith(fakeClient, 'user-1');
    expect(body).toEqual({
      items: [
        {
          id: 'item-1',
          patternKey: 'emoji_removed',
          value: 'avoids',
          observedCount: 3,
          appliedAt: '2026-08-07T00:00:00Z',
        },
      ],
    });
  });

  it('학습 항목이 없으면 { items: [] }를 반환한다(AC-059 — 정상 상태)', async () => {
    mockFetchLearnedItemsDetailed.mockResolvedValue([]);

    const response = await GET(plainRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ items: [] });
  });

  it('인증되지 않은 요청은 401 AUTH_REQUIRED를 반환하고 조회를 호출하지 않는다', async () => {
    mockResolveSession.mockResolvedValue(null);

    const response = await GET(plainRequest());

    expect(response.status).toBe(401);
    expect(mockFetchLearnedItemsDetailed).not.toHaveBeenCalled();
  });
});
