// T56 — 백그라운드 서비스 워커 (`docs/Architecture.md` "확장 인증").
// 역할은 정확히 3개다: ① storage.session access level을 콘텐츠 스크립트에도 연다
// ② externally_connectable(우리 앱 origin 1개)로부터 온 토큰을 저장한다
// ③ (C-1, 2026-08-08) 콘텐츠 스크립트/패널이 내부 sendMessage로 보낸 중재 요청을 실제로
//    fetch한다 — content-script 컨텍스트의 fetch는 Chrome 85+부터 host_permissions로
//    CORS가 면제되지 않는다(https://www.chromium.org/Home/chromium-security/extension-content-script-fetches/);
//    서비스 워커(background)는 면제된다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getStoredToken, setStoredToken } from './shared/token-storage';
import { COUNTERPARTS_REQUEST_MESSAGE_TYPE, MEDIATE_REQUEST_MESSAGE_TYPE } from './shared/api';

type Listener<Args extends unknown[]> = (...args: Args) => unknown;

function createFakeChrome() {
  const store = new Map<string, unknown>();
  const setAccessLevel = vi.fn().mockResolvedValue(undefined);
  let onInstalledListener: Listener<[]> | null = null;
  let onMessageExternalListener: Listener<[unknown, unknown, (response: unknown) => void]> | null =
    null;
  let onMessageListener: Listener<[unknown, unknown, (response: unknown) => void]> | null = null;

  return {
    chrome: {
      runtime: {
        onInstalled: {
          addListener: (fn: Listener<[]>) => {
            onInstalledListener = fn;
          },
        },
        onMessageExternal: {
          addListener: (fn: Listener<[unknown, unknown, (response: unknown) => void]>) => {
            onMessageExternalListener = fn;
          },
        },
        onMessage: {
          addListener: (fn: Listener<[unknown, unknown, (response: unknown) => void]>) => {
            onMessageListener = fn;
          },
        },
      },
      storage: {
        session: {
          setAccessLevel,
          get: async (key: string) => (store.has(key) ? { [key]: store.get(key) } : {}),
          set: async (items: Record<string, unknown>) => {
            for (const [k, v] of Object.entries(items)) store.set(k, v);
          },
        },
      },
    },
    setAccessLevel,
    fireInstalled: () => onInstalledListener?.(),
    fireMessageExternal: (message: unknown, sender: unknown, sendResponse: (r: unknown) => void) =>
      onMessageExternalListener?.(message, sender, sendResponse),
    fireMessage: (message: unknown, sender: unknown, sendResponse: (r: unknown) => void) =>
      onMessageListener?.(message, sender, sendResponse),
  };
}

describe('background', () => {
  let fake: ReturnType<typeof createFakeChrome>;

  beforeEach(async () => {
    vi.resetModules();
    fake = createFakeChrome();
    (globalThis as { chrome?: unknown }).chrome = fake.chrome;
    vi.stubEnv('VITE_APP_ORIGIN', 'https://app.example.com');
  });

  afterEach(() => {
    delete (globalThis as { chrome?: unknown }).chrome;
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('raises storage.session access level on install so content scripts can read the token', async () => {
    await import('./background');
    fake.fireInstalled();
    expect(fake.setAccessLevel).toHaveBeenCalledWith({
      accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS',
    });
  });

  it('stores a valid cbm:set-token external message and responds ok', async () => {
    await import('./background');
    const sendResponse = vi.fn();
    fake.fireMessageExternal({ type: 'cbm:set-token', token: 'tok-1' }, {}, sendResponse);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    expect(sendResponse).toHaveBeenCalledWith({ ok: true });
    expect(await getStoredToken()).toBe('tok-1');
  });

  it('rejects a malformed external message without storing anything', async () => {
    await import('./background');
    const sendResponse = vi.fn();
    fake.fireMessageExternal({ type: 'not-a-token-message' }, {}, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
    expect(await getStoredToken()).toBeNull();
  });

  describe('cbm:mediate-request internal message (C-1)', () => {
    const requestBody = {
      text: 'hello',
      recipient: null,
      context: { languageDirection: 'ko-en' as const, channel: 'extension' as const },
    };

    it('fetches POST /api/mediate with a Bearer header and returns the parsed result on success', async () => {
      await setStoredToken('tok-abc');
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ urgency: 'NORMAL', transformed: 'hi', source: 'live' }),
      });
      vi.stubGlobal('fetch', fetchMock);

      await import('./background');
      const sendResponse = vi.fn();
      fake.fireMessage({ type: MEDIATE_REQUEST_MESSAGE_TYPE, body: requestBody }, {}, sendResponse);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://app.example.com/api/mediate');
      expect(init.method).toBe('POST');
      expect(init.headers.authorization).toBe('Bearer tok-abc');
      expect(JSON.parse(init.body)).toEqual(requestBody);
      expect(sendResponse).toHaveBeenCalledWith({
        ok: true,
        data: { urgency: 'NORMAL', transformed: 'hi', source: 'live' },
      });
    });

    it('returns not-logged-in without fetching when no token is stored', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      await import('./background');
      const sendResponse = vi.fn();
      fake.fireMessage({ type: MEDIATE_REQUEST_MESSAGE_TYPE, body: requestBody }, {}, sendResponse);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

      expect(fetchMock).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith({ ok: false, reason: 'not-logged-in' });
    });

    it('returns a request-failed result when fetch itself throws (network error)', async () => {
      await setStoredToken('tok-abc');
      const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
      vi.stubGlobal('fetch', fetchMock);

      await import('./background');
      const sendResponse = vi.fn();
      fake.fireMessage({ type: MEDIATE_REQUEST_MESSAGE_TYPE, body: requestBody }, {}, sendResponse);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ ok: false, reason: 'request-failed' }),
      );
    });

    // M-2 — 200 응답의 body가 JSON으로 파싱되지 않아도 throw 대신 request-failed를 돌려준다.
    it('returns a request-failed result when a 200 response body is not valid JSON', async () => {
      await setStoredToken('tok-abc');
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Unexpected token');
        },
      });
      vi.stubGlobal('fetch', fetchMock);

      await import('./background');
      const sendResponse = vi.fn();
      fake.fireMessage({ type: MEDIATE_REQUEST_MESSAGE_TYPE, body: requestBody }, {}, sendResponse);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ ok: false, reason: 'request-failed' }),
      );
    });

    it('returns a request-failed result with the server error envelope on a non-401 non-2xx response', async () => {
      await setStoredToken('tok-abc');
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({
          error: { code: 'INTERNAL', message: '서버 오류', retryable: true },
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      await import('./background');
      const sendResponse = vi.fn();
      fake.fireMessage({ type: MEDIATE_REQUEST_MESSAGE_TYPE, body: requestBody }, {}, sendResponse);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

      expect(sendResponse).toHaveBeenCalledWith({
        ok: false,
        reason: 'request-failed',
        error: { code: 'INTERNAL', message: '서버 오류', retryable: true },
      });
    });

    // M-6 — 401/AUTH_REQUIRED는 request-failed가 아니라 not-logged-in으로 매핑하고, 저장된
    // (만료된) 토큰을 지운다.
    it('maps a 401 AUTH_REQUIRED response to not-logged-in and clears the stored token', async () => {
      await setStoredToken('tok-expired');
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          error: { code: 'AUTH_REQUIRED', message: '인증이 필요합니다', retryable: false },
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      await import('./background');
      const sendResponse = vi.fn();
      fake.fireMessage({ type: MEDIATE_REQUEST_MESSAGE_TYPE, body: requestBody }, {}, sendResponse);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

      expect(sendResponse).toHaveBeenCalledWith({ ok: false, reason: 'not-logged-in' });
      expect(await getStoredToken()).toBeNull();
    });
  });

  // T66(AC-067①) — 같은 디스패처(단일 onMessage 리스너)가 두 메시지 타입을 모두 처리한다.
  describe('cbm:counterparts-request internal message (T66)', () => {
    it('fetches GET /api/pair-protocols with a Bearer header and returns the counterparts list', async () => {
      await setStoredToken('tok-abc');
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ counterparts: ['tanaka@sakuradigital.example'] }),
      });
      vi.stubGlobal('fetch', fetchMock);

      await import('./background');
      const sendResponse = vi.fn();
      fake.fireMessage({ type: COUNTERPARTS_REQUEST_MESSAGE_TYPE }, {}, sendResponse);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://app.example.com/api/pair-protocols');
      expect(init.headers.authorization).toBe('Bearer tok-abc');
      expect(sendResponse).toHaveBeenCalledWith({
        ok: true,
        counterparts: ['tanaka@sakuradigital.example'],
      });
    });

    it('returns not-logged-in without fetching when no token is stored', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      await import('./background');
      const sendResponse = vi.fn();
      fake.fireMessage({ type: COUNTERPARTS_REQUEST_MESSAGE_TYPE }, {}, sendResponse);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

      expect(fetchMock).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith({ ok: false, reason: 'not-logged-in' });
    });

    it('maps a 401 AUTH_REQUIRED response to not-logged-in and clears the stored token', async () => {
      await setStoredToken('tok-expired');
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          error: { code: 'AUTH_REQUIRED', message: '인증이 필요합니다', retryable: false },
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      await import('./background');
      const sendResponse = vi.fn();
      fake.fireMessage({ type: COUNTERPARTS_REQUEST_MESSAGE_TYPE }, {}, sendResponse);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

      expect(sendResponse).toHaveBeenCalledWith({ ok: false, reason: 'not-logged-in' });
      expect(await getStoredToken()).toBeNull();
    });
  });
});
