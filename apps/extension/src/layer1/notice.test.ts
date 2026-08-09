// T58 — 프라이버시 고지 저장/버전 로직 (AC-054, AC-076).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getStoredNoticeVersion,
  NOTICE_ITEMS,
  NOTICE_STORAGE_KEY,
  NOTICE_VERSION,
  setStoredNoticeVersion,
  shouldShowNotice,
} from './notice';

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

describe('notice — content (AC-054①)', () => {
  it('states only the text is sent, never the full page', () => {
    expect(NOTICE_ITEMS.some((item) => item.includes('선택') && item.includes('전송'))).toBe(
      true,
    );
  });

  it('states the destination is our backend proxying OpenAI', () => {
    expect(NOTICE_ITEMS.some((item) => item.includes('OpenAI'))).toBe(true);
  });

  it('states the extension can operate on any site', () => {
    expect(NOTICE_ITEMS.some((item) => item.includes('모든 사이트'))).toBe(true);
  });

  // AC-068②③ — T66이 아직 todo이므로(이 빌드에 없음), 그 항목을 넣지 않는다.
  it('does not include the recipient-candidate-detection item (T66 not shipped in this build)', () => {
    expect(NOTICE_ITEMS.some((item) => item.includes('수신자 후보'))).toBe(false);
  });

  // AC-081⑤ — T71이 아직 todo이므로(이 빌드에 없음), Mark 모드 항목을 넣지 않는다.
  it('does not include the observation-sample item (T71 not shipped in this build)', () => {
    expect(NOTICE_ITEMS.some((item) => item.includes('표본'))).toBe(false);
  });
});

describe('notice — shouldShowNotice (AC-076③, pure)', () => {
  it('shows when nothing has been recorded yet (first run)', () => {
    expect(shouldShowNotice(null)).toBe(true);
  });

  it('shows again when the current version is higher than the stored one', () => {
    expect(shouldShowNotice(NOTICE_VERSION - 1)).toBe(true);
  });

  it('does not show when the stored version equals the current version', () => {
    expect(shouldShowNotice(NOTICE_VERSION)).toBe(false);
  });

  it('does not show when the stored version is somehow already higher', () => {
    expect(shouldShowNotice(NOTICE_VERSION + 1)).toBe(false);
  });
});

describe('notice — storage (chrome.storage.local)', () => {
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

  it('returns null when no version has been stored', async () => {
    expect(await getStoredNoticeVersion()).toBeNull();
  });

  it('returns the stored version after setStoredNoticeVersion', async () => {
    await setStoredNoticeVersion(3);
    expect(await getStoredNoticeVersion()).toBe(3);
  });

  it('stores under the single shared NOTICE_STORAGE_KEY constant', async () => {
    await setStoredNoticeVersion(NOTICE_VERSION);
    const raw = await fakeLocal.get(NOTICE_STORAGE_KEY);
    expect(raw[NOTICE_STORAGE_KEY]).toBe(NOTICE_VERSION);
  });
});
