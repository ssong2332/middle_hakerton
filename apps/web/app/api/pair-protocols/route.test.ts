/**
 * `GET /api/pair-protocols` — `docs/API.md` "GET /api/pair-protocols" · `docs/Tasks.md` T66
 * (AC-067①). `resolveSession()`과 `fetchCounterparts()`는 모킹한다 — 쿼리 구성 검증은
 * `apps/web/lib/pair-protocols/storage.test.ts`의 몫이다. 여기서는 라우트 배선(세션 이메일
 * 확인 → 저장소 호출 → 응답 조합 → 상태 코드)만 본다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/auth', () => ({
  resolveSession: vi.fn(),
}));
vi.mock('../../../lib/pair-protocols/storage', () => ({
  fetchCounterparts: vi.fn(),
}));

import { resolveSession } from '../../../lib/auth';
import { fetchCounterparts } from '../../../lib/pair-protocols/storage';
import { GET } from './route';

const mockResolveSession = vi.mocked(resolveSession);
const mockFetchCounterparts = vi.mocked(fetchCounterparts);

function plainRequest(): Request {
  return new Request('http://localhost/api/pair-protocols', { method: 'GET' });
}

describe('GET /api/pair-protocols — AC-067①', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('세션 이메일로 fetchCounterparts에 위임하고 200으로 counterparts를 응답한다', async () => {
    const fakeClient = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { email: 'me@example.com' } }, error: null }) },
    } as never;
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient });
    mockFetchCounterparts.mockResolvedValue(['tanaka@sakuradigital.example']);

    const response = await GET(plainRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockFetchCounterparts).toHaveBeenCalledWith(fakeClient, 'me@example.com');
    expect(body).toEqual({ counterparts: ['tanaka@sakuradigital.example'] });
  });

  it('규약이 없으면 빈 배열을 응답한다(AC-067④)', async () => {
    const fakeClient = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { email: 'me@example.com' } }, error: null }) },
    } as never;
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient });
    mockFetchCounterparts.mockResolvedValue([]);

    const response = await GET(plainRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ counterparts: [] });
  });

  it('인증되지 않은 요청은 401 AUTH_REQUIRED를 반환하고 조회를 호출하지 않는다', async () => {
    mockResolveSession.mockResolvedValue(null);

    const response = await GET(plainRequest());

    expect(response.status).toBe(401);
    expect(mockFetchCounterparts).not.toHaveBeenCalled();
  });

  it('세션 클라이언트가 이메일을 확인하지 못하면 500 INTERNAL을 반환한다', async () => {
    const fakeClient = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    } as never;
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient });

    const response = await GET(plainRequest());

    expect(response.status).toBe(500);
    expect(mockFetchCounterparts).not.toHaveBeenCalled();
  });
});
