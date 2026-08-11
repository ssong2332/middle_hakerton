/**
 * `GET / PUT / DELETE /api/enrichment` — T65(AC-065, AC-071, AC-072, AC-078). `resolveSession()`/
 * `getEnrichment()`/`updateEnrichment()`/`deleteEnrichment()`는 모킹한다 — 쿼리 구성 검증은
 * `apps/web/lib/enrichment/storage.test.ts`의 몫. 여기서는 라우트 배선 + AC-078 판정만 본다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/auth', () => ({
  resolveSession: vi.fn(),
}));
vi.mock('../../../lib/enrichment/storage', () => ({
  getEnrichment: vi.fn(),
  updateEnrichment: vi.fn(),
  deleteEnrichment: vi.fn(),
}));

import { resolveSession } from '../../../lib/auth';
import { deleteEnrichment, getEnrichment, updateEnrichment } from '../../../lib/enrichment/storage';
import { DELETE, GET, PUT } from './route';

const mockResolveSession = vi.mocked(resolveSession);
const mockGetEnrichment = vi.mocked(getEnrichment);
const mockUpdateEnrichment = vi.mocked(updateEnrichment);
const mockDeleteEnrichment = vi.mocked(deleteEnrichment);

function fakeClient(options: { email?: string; hasProtocol?: boolean } = {}) {
  const email = options.email ?? 'me@example.com';
  const hasProtocol = options.hasProtocol ?? false;
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { email } }, error: null }) },
    from(table: string) {
      if (table !== 'pair_protocols') throw new Error(`unexpected table: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: hasProtocol ? { pair_key: 'k' } : null,
              error: null,
            }),
          }),
        }),
      };
    },
  } as never;
}

function getRequest(query: string): Request {
  return new Request(`http://localhost/api/enrichment?${query}`, { method: 'GET' });
}

function putRequest(body: unknown): Request {
  return new Request('http://localhost/api/enrichment', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function deleteRequest(query: string): Request {
  return new Request(`http://localhost/api/enrichment?${query}`, { method: 'DELETE' });
}

const EMPTY_ROW = {
  location: null,
  company: null,
  activityHourHistogram: null,
  activitySampleCount: 0,
  activityTimezoneConfirmed: null,
  fetchedAt: '2026-08-11T00:00:00Z',
  sourceUrl: 'https://github.com/octocat',
};

describe('GET /api/enrichment — AC-065⑥/AC-071/AC-078', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('행이 없으면(아직 조회한 적 없음) 전부 null이고 showEnrichmentLink는 규약·보강 정보가 없으니 true다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient({ hasProtocol: false }) });
    mockGetEnrichment.mockResolvedValue(null);

    const response = await GET(getRequest('recipient=boss@example.com'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      location: null,
      company: null,
      activityHourHistogram: null,
      activitySampleCount: null,
      activityTimezoneConfirmed: null,
      timezoneCandidates: [],
      activityTimeCandidate: null,
      fetchedAt: null,
      sourceUrl: null,
      showEnrichmentLink: true,
    });
  });

  it('location/company/activityTimezoneConfirmed 중 하나라도 있으면 showEnrichmentLink는 false다(AC-078④)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient({ hasProtocol: false }) });
    mockGetEnrichment.mockResolvedValue({ ...EMPTY_ROW, location: 'Seoul, Korea' });

    const response = await GET(getRequest('recipient=boss@example.com'));
    const body = await response.json();

    expect(body.showEnrichmentLink).toBe(false);
    expect(body.location).toBe('Seoul, Korea');
    expect(body.timezoneCandidates).toEqual(['Asia/Seoul']);
  });

  it('쌍방 규약이 있으면 보강 정보가 비어 있어도 showEnrichmentLink는 false다(AC-078②)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient({ hasProtocol: true }) });
    mockGetEnrichment.mockResolvedValue(null);

    const response = await GET(getRequest('recipient=boss@example.com'));
    const body = await response.json();

    expect(body.showEnrichmentLink).toBe(false);
  });

  it('activityHourHistogram이 있으면 activityTimeCandidate를 함께 산출한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient() });
    const histogram = new Array<number>(24).fill(0);
    histogram[9] = 30;
    mockGetEnrichment.mockResolvedValue({ ...EMPTY_ROW, activityHourHistogram: histogram, activitySampleCount: 30 });

    const response = await GET(getRequest('recipient=boss@example.com'));
    const body = await response.json();

    expect(body.activityTimeCandidate).toBe('UTC 09:00–10:00');
  });

  it('recipient 쿼리가 비어 있으면 400을 반환한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient() });

    const response = await GET(getRequest('recipient='));

    expect(response.status).toBe(400);
    expect(mockGetEnrichment).not.toHaveBeenCalled();
  });

  it('인증되지 않은 요청은 401을 반환한다', async () => {
    mockResolveSession.mockResolvedValue(null);

    const response = await GET(getRequest('recipient=boss@example.com'));

    expect(response.status).toBe(401);
    expect(mockGetEnrichment).not.toHaveBeenCalled();
  });
});

describe('PUT /api/enrichment — AC-065④/AC-071③', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('행이 이미 있으면 확정 타임존을 저장한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient() });
    mockGetEnrichment.mockResolvedValue(EMPTY_ROW);
    mockUpdateEnrichment.mockResolvedValue({ ...EMPTY_ROW, activityTimezoneConfirmed: 'Asia/Seoul' });

    const response = await PUT(
      putRequest({ recipient: 'boss@example.com', activityTimezoneConfirmed: 'Asia/Seoul' }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockUpdateEnrichment).toHaveBeenCalledWith(expect.anything(), {
      userId: 'user-1',
      recipientIdentifier: 'boss@example.com',
      activityTimezoneConfirmed: 'Asia/Seoul',
    });
    expect(body.activityTimezoneConfirmed).toBe('Asia/Seoul');
  });

  it('행이 없으면 404를 반환한다(먼저 fetch로 만들어야 한다)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient() });
    mockGetEnrichment.mockResolvedValue(null);

    const response = await PUT(
      putRequest({ recipient: 'boss@example.com', activityTimezoneConfirmed: 'Asia/Seoul' }),
    );

    expect(response.status).toBe(404);
    expect(mockUpdateEnrichment).not.toHaveBeenCalled();
  });

  it('인증되지 않은 요청은 401을 반환한다', async () => {
    mockResolveSession.mockResolvedValue(null);

    const response = await PUT(putRequest({ recipient: 'boss@example.com' }));

    expect(response.status).toBe(401);
    expect(mockUpdateEnrichment).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/enrichment — 데이터 최소화 컨트롤', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('세션 사용자 기준으로 삭제를 위임하고 200을 반환한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient() });

    const response = await DELETE(deleteRequest('recipient=boss@example.com'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockDeleteEnrichment).toHaveBeenCalledWith(expect.anything(), 'user-1', 'boss@example.com');
    expect(body).toEqual({ deleted: true });
  });

  it('인증되지 않은 요청은 401을 반환한다', async () => {
    mockResolveSession.mockResolvedValue(null);

    const response = await DELETE(deleteRequest('recipient=boss@example.com'));

    expect(response.status).toBe(401);
    expect(mockDeleteEnrichment).not.toHaveBeenCalled();
  });
});
