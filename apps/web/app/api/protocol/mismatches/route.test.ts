/**
 * `GET /api/protocol/mismatches` — `docs/API.md:241` / AC-079, AC-083. `docs/Tasks.md` T70.
 * `fetchProtocol()`/`getIndicatorRollupForCounterpart()`/`computeProtocolMismatches()`는
 * 모킹한다 — 판정 로직 자체는 `packages/core/src/rules/protocol-mismatch.test.ts`의 몫.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/auth', () => ({
  resolveSession: vi.fn(),
}));
vi.mock('../../../../lib/protocol/storage', () => ({
  fetchProtocol: vi.fn(),
  toPairProtocolOrNull: vi.fn(),
}));
vi.mock('../../../../lib/samples/storage', () => ({
  getIndicatorRollupForCounterpart: vi.fn(),
}));

import { resolveSession } from '../../../../lib/auth';
import { fetchProtocol, toPairProtocolOrNull } from '../../../../lib/protocol/storage';
import { getIndicatorRollupForCounterpart } from '../../../../lib/samples/storage';
import { GET } from './route';

const mockResolveSession = vi.mocked(resolveSession);
const mockFetchProtocol = vi.mocked(fetchProtocol);
const mockToPairProtocolOrNull = vi.mocked(toPairProtocolOrNull);
const mockGetRollup = vi.mocked(getIndicatorRollupForCounterpart);

function fakeClient(email = 'me@example.com') {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { email } }, error: null }) },
  } as never;
}

function getRequest(query: string): Request {
  return new Request(`http://localhost/api/protocol/mismatches?${query}`, { method: 'GET' });
}

const PROTOCOL_RECORD = {
  pairKey: 'k',
  counterpart: 'tanaka@sakuradigital.example',
  directnessAllowed: 'yes' as const,
  emojiPolicy: 'avoid' as const,
  addressForm: '이름',
  deadlineStyle: '명시적 날짜',
  authorshipState: 'sender_confirmed' as const,
  updatedAt: '2026-08-11T00:00:00Z',
};

const ROLLUP = {
  manual: { sampleCount: 5, emojiCount: 2, hedgeCount: 0 },
  github: { sampleCount: 0, emojiCount: 0, hedgeCount: 0 },
};

describe('GET /api/protocol/mismatches — AC-079/AC-083', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('규약·롤업을 조회해 computeProtocolMismatches 결과를 axes로 응답한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient() });
    mockFetchProtocol.mockResolvedValue(PROTOCOL_RECORD);
    mockToPairProtocolOrNull.mockReturnValue({
      directnessAllowed: 'yes',
      emojiPolicy: 'avoid',
      addressForm: '이름',
      deadlineStyle: '명시적 날짜',
    });
    mockGetRollup.mockResolvedValue(ROLLUP);

    const response = await GET(getRequest('counterpart=tanaka@sakuradigital.example'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockFetchProtocol).toHaveBeenCalledWith(
      expect.anything(),
      'me@example.com',
      'tanaka@sakuradigital.example',
    );
    expect(mockGetRollup).toHaveBeenCalledWith(expect.anything(), 'user-1', 'tanaka@sakuradigital.example');
    expect(body.axes).toEqual([
      {
        axis: 'emoji',
        mismatched: true,
        comparison: '규약: 이모지 사용 지양 · 관측: 이모지 2건 (표본 5건)',
        sampleCount: 5,
        sources: ['manual'],
      },
      {
        axis: 'directness',
        mismatched: false,
        comparison: '규약: 직설 허용 · 관측: 완곡 표현 0건 (표본 5건)',
        sampleCount: 5,
        sources: ['manual'],
      },
    ]);
  });

  it('규약이 없으면(untouched) axes:[]를 반환한다(에러가 아니다)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient() });
    mockFetchProtocol.mockResolvedValue({ ...PROTOCOL_RECORD, authorshipState: 'untouched' });
    mockToPairProtocolOrNull.mockReturnValue(null);
    mockGetRollup.mockResolvedValue(ROLLUP);

    const response = await GET(getRequest('counterpart=tanaka@sakuradigital.example'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ axes: [] });
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
