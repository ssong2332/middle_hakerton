// T56 — `callMediationApi` (AC-028: 웹앱과 동일한 POST /api/mediate 계약을 호출).
// C-1(reviewer, 2026-08-08): 콘텐츠 스크립트/패널 컨텍스트에서 직접 fetch하면 Chrome 85+에서
// CORS에 걸린다(호스트 페이지 origin이 Origin 헤더로 나가고, 백엔드에 OPTIONS 프리플라이트
// 핸들러가 없다) — 실제 fetch는 background.ts(서비스 워커, host_permissions로 CORS 면제)로
// 옮기고, 이 파일은 `chrome.runtime.sendMessage`로 위임만 한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./token-storage', () => ({
  getStoredToken: vi.fn(),
}));

import { getStoredToken } from './token-storage';
import { callMediationApi, MEDIATE_REQUEST_MESSAGE_TYPE } from './api';

const mockedGetStoredToken = vi.mocked(getStoredToken);

describe('callMediationApi', () => {
  let sendMessageMock: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendMessageMock = vi.fn();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('chrome', { runtime: { sendMessage: sendMessageMock } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // AC-053①②③④ NotLoggedIn 경로 — 토큰이 없으면 background로 메시지조차 보내지 않는다.
  it('returns not-logged-in and never messages the background worker when no token is stored', async () => {
    mockedGetStoredToken.mockResolvedValue(null);

    const result = await callMediationApi({
      text: 'hello',
      recipient: null,
      context: { languageDirection: 'ko-en', channel: 'extension' },
    });

    expect(result).toEqual({ ok: false, reason: 'not-logged-in' });
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  // C-1 — 패널/콘텐츠 스크립트 경로는 절대 fetch를 직접 호출하지 않는다. sendMessage로만 위임한다.
  it('never calls fetch directly — only chrome.runtime.sendMessage', async () => {
    mockedGetStoredToken.mockResolvedValue('tok-abc');
    sendMessageMock.mockResolvedValue({
      ok: true,
      data: { urgency: 'NORMAL', transformed: 'hi', source: 'live' },
    });

    await callMediationApi({
      text: 'hello',
      recipient: null,
      context: { languageDirection: 'ko-en', channel: 'extension' },
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
  });

  // AC-028 — sendMessage 페이로드가 background로 전달할 요청 계약을 그대로 담는다.
  it('sends a cbm:mediate-request message with the request body', async () => {
    mockedGetStoredToken.mockResolvedValue('tok-abc');
    sendMessageMock.mockResolvedValue({
      ok: true,
      data: { urgency: 'NORMAL', transformed: 'hi', source: 'live' },
    });

    const result = await callMediationApi({
      text: 'hello',
      recipient: null,
      context: { languageDirection: 'ko-en', channel: 'extension' },
    });

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: MEDIATE_REQUEST_MESSAGE_TYPE,
      body: {
        text: 'hello',
        recipient: null,
        context: { languageDirection: 'ko-en', channel: 'extension' },
      },
    });
    expect(result).toEqual({
      ok: true,
      data: { urgency: 'NORMAL', transformed: 'hi', source: 'live' },
    });
  });

  // background가 request-failed 봉투를 그대로 돌려주면 그대로 전달한다.
  it('forwards a request-failed result from the background worker unchanged', async () => {
    mockedGetStoredToken.mockResolvedValue('tok-abc');
    sendMessageMock.mockResolvedValue({
      ok: false,
      reason: 'request-failed',
      error: { code: 'AUTH_REQUIRED', message: '세션 만료', retryable: false },
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

  // M-6 — background가 401/AUTH_REQUIRED를 not-logged-in으로 변환해 돌려주면 그대로 전달한다.
  it('forwards a not-logged-in result the background worker derived from a 401', async () => {
    mockedGetStoredToken.mockResolvedValue('tok-abc');
    sendMessageMock.mockResolvedValue({ ok: false, reason: 'not-logged-in' });

    const result = await callMediationApi({
      text: 'hello',
      recipient: null,
      context: { languageDirection: 'ko-en', channel: 'extension' },
    });

    expect(result).toEqual({ ok: false, reason: 'not-logged-in' });
  });

  it('returns a request-failed result when sendMessage itself throws (extension messaging failure)', async () => {
    mockedGetStoredToken.mockResolvedValue('tok-abc');
    sendMessageMock.mockRejectedValue(new Error('no receiving end'));

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

  // M-4 — getStoredToken 자체가 reject해도(access level race 등) 무한 로딩이 아니라 not-logged-in.
  it('returns not-logged-in when getStoredToken itself rejects', async () => {
    mockedGetStoredToken.mockRejectedValue(new Error('storage access error'));

    const result = await callMediationApi({
      text: 'hello',
      recipient: null,
      context: { languageDirection: 'ko-en', channel: 'extension' },
    });

    expect(result).toEqual({ ok: false, reason: 'not-logged-in' });
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('returns a request-failed result when the background response is malformed', async () => {
    mockedGetStoredToken.mockResolvedValue('tok-abc');
    sendMessageMock.mockResolvedValue(undefined);

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
