/**
 * `GET / PUT /api/protocol` — `docs/API.md` "GET / PUT /api/protocol" · `docs/Tasks.md` T41/T42
 * (AC-037, AC-075). `resolveSession()`/`fetchProtocol()`/`saveProtocol()`는 모킹한다 — 쿼리
 * 구성 검증은 `apps/web/lib/protocol/storage.test.ts`의 몫. 여기서는 라우트 배선만 본다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/auth', () => ({
  resolveSession: vi.fn(),
}));
vi.mock('../../../lib/protocol/storage', () => ({
  fetchProtocol: vi.fn(),
  saveProtocol: vi.fn(),
}));

import { resolveSession } from '../../../lib/auth';
import { fetchProtocol, saveProtocol } from '../../../lib/protocol/storage';
import { GET, PUT } from './route';

const mockResolveSession = vi.mocked(resolveSession);
const mockFetchProtocol = vi.mocked(fetchProtocol);
const mockSaveProtocol = vi.mocked(saveProtocol);

function fakeClient(email = 'me@example.com') {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { email } }, error: null }) },
  } as never;
}

function getRequest(query: string): Request {
  return new Request(`http://localhost/api/protocol?${query}`, { method: 'GET' });
}

function putRequest(body: unknown): Request {
  return new Request('http://localhost/api/protocol', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const SAMPLE_RECORD = {
  pairKey: 'k',
  counterpart: 'tanaka@sakuradigital.example',
  directnessAllowed: null,
  emojiPolicy: null,
  addressForm: null,
  deadlineStyle: null,
  authorshipState: 'untouched' as const,
  updatedAt: new Date(0).toISOString(),
};

describe('GET /api/protocol — AC-037', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('세션 이메일 + counterpart 쿼리로 fetchProtocol에 위임하고 200으로 응답한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient() });
    mockFetchProtocol.mockResolvedValue(SAMPLE_RECORD);

    const response = await GET(getRequest('counterpart=tanaka@sakuradigital.example'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockFetchProtocol).toHaveBeenCalledWith(
      expect.anything(),
      'me@example.com',
      'tanaka@sakuradigital.example',
    );
    expect(body).toEqual(SAMPLE_RECORD);
  });

  it('counterpart 쿼리가 이메일 형식이 아니면 400을 반환한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient() });

    const response = await GET(getRequest('counterpart=not-an-email'));

    expect(response.status).toBe(400);
    expect(mockFetchProtocol).not.toHaveBeenCalled();
  });

  it('인증되지 않은 요청은 401을 반환한다', async () => {
    mockResolveSession.mockResolvedValue(null);

    const response = await GET(getRequest('counterpart=tanaka@sakuradigital.example'));

    expect(response.status).toBe(401);
    expect(mockFetchProtocol).not.toHaveBeenCalled();
  });
});

describe('PUT /api/protocol — AC-037', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('세션 이메일 + body로 saveProtocol에 위임하고 200으로 저장 결과를 응답한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient() });
    mockSaveProtocol.mockResolvedValue({ ...SAMPLE_RECORD, directnessAllowed: 'yes' });

    const response = await PUT(
      putRequest({ counterpart: 'tanaka@sakuradigital.example', directnessAllowed: 'yes' }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockSaveProtocol).toHaveBeenCalledWith(expect.anything(), 'me@example.com', 'user-1', {
      counterpart: 'tanaka@sakuradigital.example',
      directnessAllowed: 'yes',
    });
    expect(body.directnessAllowed).toBe('yes');
  });

  it('5번째 축(미지 키)이 있으면 400을 반환한다(축 확장 요청 거부)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient() });

    const response = await PUT(
      putRequest({ counterpart: 'tanaka@sakuradigital.example', honorificLevel: 'haeyo' }),
    );

    expect(response.status).toBe(400);
    expect(mockSaveProtocol).not.toHaveBeenCalled();
  });

  it('인증되지 않은 요청은 401을 반환한다', async () => {
    mockResolveSession.mockResolvedValue(null);

    const response = await PUT(putRequest({ counterpart: 'tanaka@sakuradigital.example' }));

    expect(response.status).toBe(401);
    expect(mockSaveProtocol).not.toHaveBeenCalled();
  });
});
