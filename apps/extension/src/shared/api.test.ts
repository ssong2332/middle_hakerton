// T56 — `callMediationApi` (AC-028: 웹앱과 동일한 POST /api/mediate 계약을 호출).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./token-storage', () => ({
  getStoredToken: vi.fn(),
}));

import { getStoredToken } from './token-storage';
import { callMediationApi } from './api';

const mockedGetStoredToken = vi.mocked(getStoredToken);

describe('callMediationApi', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('VITE_APP_ORIGIN', 'https://app.example.com');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  // AC-053①②③④ NotLoggedIn 경로 — 토큰이 없으면 fetch를 아예 시도하지 않는다.
  it('returns not-logged-in and never calls fetch when no token is stored', async () => {
    mockedGetStoredToken.mockResolvedValue(null);

    const result = await callMediationApi({
      text: 'hello',
      recipient: null,
      context: { languageDirection: 'ko-en', channel: 'extension' },
    });

    expect(result).toEqual({ ok: false, reason: 'not-logged-in' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // AC-028 — 웹앱(`apps/web/components/MediationWorkspace.tsx`)과 같은 엔드포인트·같은 요청 계약.
  it('calls POST /api/mediate with a Bearer header and the same request shape as the web app', async () => {
    mockedGetStoredToken.mockResolvedValue('tok-abc');
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ urgency: 'NORMAL', transformed: 'hi', source: 'live' }),
    });

    const result = await callMediationApi({
      text: 'hello',
      recipient: null,
      context: { languageDirection: 'ko-en', channel: 'extension' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/mediate');
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe('Bearer tok-abc');
    expect(JSON.parse(init.body)).toEqual({
      text: 'hello',
      recipient: null,
      context: { languageDirection: 'ko-en', channel: 'extension' },
    });
    expect(result).toEqual({
      ok: true,
      data: { urgency: 'NORMAL', transformed: 'hi', source: 'live' },
    });
  });

  it('returns a request-failed result with the server error envelope on non-2xx', async () => {
    mockedGetStoredToken.mockResolvedValue('tok-abc');
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({
        error: { code: 'AUTH_REQUIRED', message: '세션 만료', retryable: false },
      }),
    });

    const result = await callMediationApi({
      text: 'hello',
      recipient: null,
      context: { languageDirection: 'ko-en', channel: 'extension' },
    });

    expect(result).toEqual({
      ok: false,
      reason: 'request-failed',
      error: { code: 'AUTH_REQUIRED', message: '세션 만료', retryable: false },
    });
  });

  it('returns a request-failed result when VITE_APP_ORIGIN is not configured (never falls back to a relative path)', async () => {
    vi.stubEnv('VITE_APP_ORIGIN', '');
    mockedGetStoredToken.mockResolvedValue('tok-abc');

    const result = await callMediationApi({
      text: 'hello',
      recipient: null,
      context: { languageDirection: 'ko-en', channel: 'extension' },
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('request-failed');
  });

  it('returns a request-failed result when fetch itself throws (network failure)', async () => {
    mockedGetStoredToken.mockResolvedValue('tok-abc');
    fetchMock.mockRejectedValue(new Error('network down'));

    const result = await callMediationApi({
      text: 'hello',
      recipient: null,
      context: { languageDirection: 'ko-en', channel: 'extension' },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('request-failed');
    }
  });
});
