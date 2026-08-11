/**
 * `GET / POST /api/samples` — `docs/API.md:335` (UX-016 Mark 모드/UX-019, UF-020/UF-021) /
 * AC-080, AC-081. `docs/Tasks.md` T71(POST)/T72(GET). `insertSample()`/`listSamples()`는
 * 모킹한다 — 쿼리 구성 검증은 `apps/web/lib/samples/storage.test.ts`의 몫. 여기서는 라우트
 * 배선 + 검증만 본다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/auth', () => ({
  resolveSession: vi.fn(),
}));
vi.mock('../../../lib/samples/storage', () => ({
  insertSample: vi.fn(),
  listSamples: vi.fn(),
}));

import { resolveSession } from '../../../lib/auth';
import { insertSample, listSamples } from '../../../lib/samples/storage';
import { GET, POST } from './route';

const mockResolveSession = vi.mocked(resolveSession);
const mockInsertSample = vi.mocked(insertSample);
const mockListSamples = vi.mocked(listSamples);

function fakeClient() {
  return {} as never;
}

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/samples', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getRequest(): Request {
  return new Request('http://localhost/api/samples', { method: 'GET' });
}

const VALID_DELTAS = {
  sentenceCount: 2,
  emojiCount: 0,
  charCount: 20,
  hedgeCount: 1,
  addressFormKind: null,
  deadlineMentionKind: null,
};

const VALID_BODY = {
  counterpart: 'boss@example.com',
  source: 'manual' as const,
  indicatorDeltas: VALID_DELTAS,
  collectedAt: '2026-08-11T09:00:00.000Z',
};

const STORED_SAMPLE = {
  id: 'sample-1',
  counterpartIdentifier: 'boss@example.com',
  source: 'manual' as const,
  collectedAt: '2026-08-11T09:00:00.000Z',
};

describe('POST /api/samples — AC-080/AC-081', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('세션 사용자 + body로 insertSample에 위임하고 201로 응답한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient() });
    mockInsertSample.mockResolvedValue(STORED_SAMPLE);

    const response = await POST(postRequest(VALID_BODY));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mockInsertSample).toHaveBeenCalledWith(expect.anything(), {
      userId: 'user-1',
      counterpartIdentifier: 'boss@example.com',
      source: 'manual',
      indicatorDeltas: VALID_DELTAS,
      collectedAt: '2026-08-11T09:00:00.000Z',
    });
    // 🔴 응답 필드명은 `docs/API.md:342` 계약대로 `counterpart`다 — storage.ts 내부 표현
    // (`counterpartIdentifier`)을 그대로 흘리지 않는다.
    expect(body).toEqual({
      id: 'sample-1',
      counterpart: 'boss@example.com',
      source: 'manual',
      collectedAt: '2026-08-11T09:00:00.000Z',
    });
  });

  it('원문 텍스트 필드(예: rawText/excerpt)가 요청에 있어도 저장 호출에 실리지 않는다(스키마가 애초에 허용하지 않는다)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient() });
    mockInsertSample.mockResolvedValue(STORED_SAMPLE);

    await POST(postRequest({ ...VALID_BODY, rawText: '원문이 여기 있으면 안 된다' }));

    const [, calledInput] = mockInsertSample.mock.calls[0];
    expect(calledInput).not.toHaveProperty('rawText');
    expect(JSON.stringify(calledInput)).not.toContain('원문이 여기 있으면 안 된다');
  });

  it('source가 manual이 아니면 400을 반환한다(이 라우트는 manual 전용)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient() });

    const response = await POST(postRequest({ ...VALID_BODY, source: 'github' }));

    expect(response.status).toBe(400);
    expect(mockInsertSample).not.toHaveBeenCalled();
  });

  it('counterpart가 비어 있으면 400을 반환한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient() });

    const response = await POST(postRequest({ ...VALID_BODY, counterpart: '' }));

    expect(response.status).toBe(400);
    expect(mockInsertSample).not.toHaveBeenCalled();
  });

  it('indicatorDeltas 필드가 누락되면 400을 반환한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient() });

    const response = await POST(
      postRequest({ ...VALID_BODY, indicatorDeltas: { sentenceCount: 1 } }),
    );

    expect(response.status).toBe(400);
    expect(mockInsertSample).not.toHaveBeenCalled();
  });

  it('인증되지 않은 요청은 401을 반환한다', async () => {
    mockResolveSession.mockResolvedValue(null);

    const response = await POST(postRequest(VALID_BODY));

    expect(response.status).toBe(401);
    expect(mockInsertSample).not.toHaveBeenCalled();
  });
});

describe('GET /api/samples — AC-081④, T72', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const OVERVIEW = {
    counterparts: [
      { counterpart: 'tanaka@example.com', total: 2, bySource: { manual: 2, github: 0 } },
    ],
    samples: [
      {
        id: 's1',
        counterpart: 'tanaka@example.com',
        source: 'manual' as const,
        collectedAt: '2026-08-11T00:00:00Z',
        indicatorContribution: VALID_DELTAS,
      },
    ],
  };

  it('세션 사용자로 listSamples에 위임하고 200으로 응답한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient() });
    mockListSamples.mockResolvedValue(OVERVIEW);

    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockListSamples).toHaveBeenCalledWith(expect.anything(), 'user-1');
    expect(body).toEqual(OVERVIEW);
  });

  it('인증되지 않은 요청은 401을 반환한다', async () => {
    mockResolveSession.mockResolvedValue(null);

    const response = await GET(getRequest());

    expect(response.status).toBe(401);
    expect(mockListSamples).not.toHaveBeenCalled();
  });
});
