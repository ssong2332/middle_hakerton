// T56 — 확장 토큰 저장/조회 (`docs/Architecture.md` "확장 인증").
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearStoredToken, getStoredToken, setStoredToken, TOKEN_STORAGE_KEY } from './token-storage';

function createFakeSessionStorage() {
  const store = new Map<string, unknown>();
  return {
    async get(key: string) {
      return store.has(key) ? { [key]: store.get(key) } : {};
    },
    async set(items: Record<string, unknown>) {
      for (const [key, value] of Object.entries(items)) store.set(key, value);
    },
  };
}

describe('token-storage', () => {
  let fakeSession: ReturnType<typeof createFakeSessionStorage>;

  beforeEach(() => {
    fakeSession = createFakeSessionStorage();
    (globalThis as { chrome?: unknown }).chrome = {
      storage: { session: fakeSession },
    };
  });

  afterEach(() => {
    delete (globalThis as { chrome?: unknown }).chrome;
  });

  it('returns null when no token has been stored', async () => {
    expect(await getStoredToken()).toBeNull();
  });

  it('returns the stored token after setStoredToken', async () => {
    await setStoredToken('abc123');
    expect(await getStoredToken()).toBe('abc123');
  });

  it('stores under the single shared TOKEN_STORAGE_KEY constant', async () => {
    await setStoredToken('xyz');
    const raw = await fakeSession.get(TOKEN_STORAGE_KEY);
    expect(raw[TOKEN_STORAGE_KEY]).toBe('xyz');
  });

  it('treats an empty string token as absent', async () => {
    await setStoredToken('');
    expect(await getStoredToken()).toBeNull();
  });

  // M-6(reviewer) — 만료된 토큰이 401을 받으면 background가 이걸로 지운다.
  it('clearStoredToken removes a previously stored token', async () => {
    await setStoredToken('tok-expired');
    expect(await getStoredToken()).toBe('tok-expired');

    await clearStoredToken();

    expect(await getStoredToken()).toBeNull();
  });
});
