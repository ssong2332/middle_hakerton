// T56 — 백그라운드 서비스 워커 (`docs/Architecture.md` "확장 인증").
// 역할은 정확히 2개로 좁힌다: ① storage.session access level을 콘텐츠 스크립트에도 연다
// ② externally_connectable(우리 앱 origin 1개)로부터 온 토큰만 저장한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getStoredToken } from './shared/token-storage';

type Listener<Args extends unknown[]> = (...args: Args) => unknown;

function createFakeChrome() {
  const store = new Map<string, unknown>();
  const setAccessLevel = vi.fn().mockResolvedValue(undefined);
  let onInstalledListener: Listener<[]> | null = null;
  let onMessageExternalListener: Listener<[unknown, unknown, (response: unknown) => void]> | null =
    null;

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
  };
}

describe('background', () => {
  let fake: ReturnType<typeof createFakeChrome>;

  beforeEach(async () => {
    vi.resetModules();
    fake = createFakeChrome();
    (globalThis as { chrome?: unknown }).chrome = fake.chrome;
    await import('./background');
  });

  afterEach(() => {
    delete (globalThis as { chrome?: unknown }).chrome;
  });

  it('raises storage.session access level on install so content scripts can read the token', () => {
    fake.fireInstalled();
    expect(fake.setAccessLevel).toHaveBeenCalledWith({
      accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS',
    });
  });

  it('stores a valid cbm:set-token external message and responds ok', async () => {
    const sendResponse = vi.fn();
    fake.fireMessageExternal({ type: 'cbm:set-token', token: 'tok-1' }, {}, sendResponse);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    expect(sendResponse).toHaveBeenCalledWith({ ok: true });
    expect(await getStoredToken()).toBe('tok-1');
  });

  it('rejects a malformed external message without storing anything', async () => {
    const sendResponse = vi.fn();
    fake.fireMessageExternal({ type: 'not-a-token-message' }, {}, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
    expect(await getStoredToken()).toBeNull();
  });
});
