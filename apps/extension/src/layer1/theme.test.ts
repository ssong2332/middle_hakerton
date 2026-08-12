// T81 — 층 1 테마. 후속(2026-08-12, 사용자 요청): OS/브라우저 신호 자동 추종 대신, 기본값은
// 항상 라이트이고 사용자가 명시적으로 전환·저장한 값만 반영한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getLayer1ColorScheme,
  getLayer1Theme,
  getThemeMode,
  loadStoredThemeMode,
  setThemeMode,
  subscribeLayer1ThemeChange,
  THEME_MODE_STORAGE_KEY,
  toggleThemeMode,
} from './theme';

function createFakeLocalStorage() {
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

// 모듈 레벨 상태를 각 테스트가 아는 값으로 되돌린다(테스트 간 순서 의존 방지).
afterEach(() => {
  setThemeMode('light');
});

describe('getLayer1Theme / getLayer1ColorScheme — default is light, no OS auto-detection', () => {
  it('defaults to the light palette regardless of any OS/browser signal', () => {
    const theme = getLayer1Theme();
    expect(theme.bg).toBe('#F9FAFB');
    expect(theme.text).toBe('#191F28');
    expect(getLayer1ColorScheme()).toBe('light');
  });

  it('switches to the dark palette only after an explicit setThemeMode("dark") call', () => {
    setThemeMode('dark');
    const theme = getLayer1Theme();
    expect(theme.bg).toBe('#211f1e');
    expect(theme.text).toBe('#f3f2f2');
    expect(getLayer1ColorScheme()).toBe('dark');
  });

  it('light and dark palettes are actually distinct (no accidental single palette)', () => {
    const light = getLayer1Theme();
    setThemeMode('dark');
    const dark = getLayer1Theme();
    expect(light.bg).not.toBe(dark.bg);
    expect(light.text).not.toBe(dark.text);
    expect(light.accent).not.toBe(dark.accent);
  });
});

describe('getThemeMode / setThemeMode / toggleThemeMode', () => {
  it('getThemeMode reflects the current mode synchronously', () => {
    expect(getThemeMode()).toBe('light');
    setThemeMode('dark');
    expect(getThemeMode()).toBe('dark');
  });

  it('toggleThemeMode flips light<->dark', () => {
    expect(getThemeMode()).toBe('light');
    toggleThemeMode();
    expect(getThemeMode()).toBe('dark');
    toggleThemeMode();
    expect(getThemeMode()).toBe('light');
  });

  it('setThemeMode with the same mode is a no-op (does not notify subscribers)', () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeLayer1ThemeChange(onChange);
    setThemeMode('light'); // already light
    expect(onChange).not.toHaveBeenCalled();
    unsubscribe();
  });
});

describe('subscribeLayer1ThemeChange', () => {
  it('calls onChange when the mode actually changes, and stops after unsubscribe', () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeLayer1ThemeChange(onChange);

    setThemeMode('dark');
    expect(onChange).toHaveBeenCalledTimes(1);

    unsubscribe();
    setThemeMode('light');
    expect(onChange).toHaveBeenCalledTimes(1); // no additional call after unsubscribe
  });
});

describe('setThemeMode — persists to chrome.storage.local', () => {
  let fakeLocal: ReturnType<typeof createFakeLocalStorage>;

  beforeEach(() => {
    fakeLocal = createFakeLocalStorage();
    (globalThis as { chrome?: unknown }).chrome = {
      storage: { local: fakeLocal },
    };
  });

  afterEach(() => {
    delete (globalThis as { chrome?: unknown }).chrome;
  });

  it('writes the new mode under THEME_MODE_STORAGE_KEY', async () => {
    setThemeMode('dark');
    await Promise.resolve(); // let the fire-and-forget storage.set microtask settle
    const raw = await fakeLocal.get(THEME_MODE_STORAGE_KEY);
    expect(raw[THEME_MODE_STORAGE_KEY]).toBe('dark');
  });
});

describe('loadStoredThemeMode — reads a previously persisted choice back', () => {
  let fakeLocal: ReturnType<typeof createFakeLocalStorage>;

  beforeEach(() => {
    fakeLocal = createFakeLocalStorage();
    (globalThis as { chrome?: unknown }).chrome = {
      storage: { local: fakeLocal },
    };
  });

  afterEach(() => {
    delete (globalThis as { chrome?: unknown }).chrome;
  });

  it('applies a stored "dark" preference on load', async () => {
    await fakeLocal.set({ [THEME_MODE_STORAGE_KEY]: 'dark' });
    expect(getThemeMode()).toBe('light'); // not applied yet

    await loadStoredThemeMode();
    expect(getThemeMode()).toBe('dark');
  });

  it('keeps the light default when nothing is stored yet', async () => {
    await loadStoredThemeMode();
    expect(getThemeMode()).toBe('light');
  });

  it('does not throw when chrome.storage is unavailable', async () => {
    delete (globalThis as { chrome?: unknown }).chrome;
    await expect(loadStoredThemeMode()).resolves.toBeUndefined();
    expect(getThemeMode()).toBe('light');
  });
});
