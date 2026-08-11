// T81 — 층 1 다크모드 테마. host 페이지가 아니라 OS/브라우저 신호(matchMedia)를 읽는지,
// 라이트/다크 팔레트가 실제로 다른지, 구독 해제가 동작하는지를 검증한다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLayer1ColorScheme, getLayer1Theme, subscribeLayer1ThemeChange } from './theme';

function mockMatchMedia(matches: boolean): { addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> } {
  const addEventListener = vi.fn();
  const removeEventListener = vi.fn();
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    addEventListener,
    removeEventListener,
  }) as unknown as typeof window.matchMedia;
  return { addEventListener, removeEventListener };
}

describe('getLayer1Theme', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the light palette when the OS/browser does not prefer dark', () => {
    mockMatchMedia(false);
    const theme = getLayer1Theme();
    expect(theme.bg).toBe('#f8f4f4');
    expect(theme.text).toBe('#201e1d');
  });

  it('returns the dark palette when the OS/browser prefers dark', () => {
    mockMatchMedia(true);
    const theme = getLayer1Theme();
    expect(theme.bg).toBe('#211f1e');
    expect(theme.text).toBe('#f3f2f2');
  });

  it('light and dark palettes are actually distinct (no accidental single palette)', () => {
    mockMatchMedia(false);
    const light = getLayer1Theme();
    mockMatchMedia(true);
    const dark = getLayer1Theme();
    expect(light.bg).not.toBe(dark.bg);
    expect(light.text).not.toBe(dark.text);
    expect(light.accent).not.toBe(dark.accent);
  });
});

describe('getLayer1ColorScheme', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns "light" when the OS/browser does not prefer dark', () => {
    mockMatchMedia(false);
    expect(getLayer1ColorScheme()).toBe('light');
  });

  it('returns "dark" when the OS/browser prefers dark', () => {
    mockMatchMedia(true);
    expect(getLayer1ColorScheme()).toBe('dark');
  });
});

describe('subscribeLayer1ThemeChange', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers a change listener on the dark-mode media query and unsubscribes it on cleanup', () => {
    const { addEventListener, removeEventListener } = mockMatchMedia(false);
    const onChange = vi.fn();

    const unsubscribe = subscribeLayer1ThemeChange(onChange);
    expect(addEventListener).toHaveBeenCalledWith('change', expect.any(Function));

    unsubscribe();
    expect(removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('calls onChange when the media query reports a change', () => {
    const { addEventListener } = mockMatchMedia(false);
    const onChange = vi.fn();

    subscribeLayer1ThemeChange(onChange);
    const registeredListener = addEventListener.mock.calls[0][1] as () => void;
    registeredListener();

    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
