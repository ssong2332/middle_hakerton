// T58 — 고지 마운트/재표시 오케스트레이션(AC-076③⑤ 검증 2케이스: 낮은 버전 기록 → 재표시 1회 /
// 동일 버전 → 미표시). `panel-mount.test.tsx`와 같은 이유로 실제 `PrivacyNotice`는 목으로
// 대체하고, 여기서는 "shadow root 마운트 여부 / 버전 비교로 스킵하는지 / 확인 후 버전을
// 기록하는지"만 검증한다(고지 내용 자체는 `PrivacyNotice.test.tsx`가 이미 커버한다).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';

vi.mock('./PrivacyNotice', () => ({
  PrivacyNotice: ({ onAcknowledge }: { onAcknowledge: () => void }) => (
    <button type="button" onClick={onAcknowledge}>
      mock-acknowledge
    </button>
  ),
}));

import { ensureNoticeAcknowledged } from './notice-mount';
import { NOTICE_STORAGE_KEY, NOTICE_VERSION } from './notice';

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

describe('notice-mount — ensureNoticeAcknowledged', () => {
  let fakeLocal: ReturnType<typeof createFakeLocalStorage>;

  beforeEach(() => {
    fakeLocal = createFakeLocalStorage();
    (globalThis as { chrome?: unknown }).chrome = {
      storage: { local: fakeLocal },
    };
  });

  afterEach(() => {
    delete (globalThis as { chrome?: unknown }).chrome;
    document.getElementById('cbm-layer1-privacy-notice-host')?.remove();
  });

  // AC-076③ 케이스 1 — 낮은(또는 없는) 버전 기록 → 재표시 1회.
  // 🔴 reviewer(2026-08-09) — 마운트가 끝났는지를 고정된 microtask 횟수로 추측하지 않고
  // `waitFor`로 폴링한다(storage 목의 `async`/`await` 체인 깊이가 바뀌어도 깨지지 않는다).
  it('mounts the notice inside a shadow root host when no version is recorded yet', async () => {
    const pending = ensureNoticeAcknowledged();

    const host = await waitFor(() => {
      const el = document.getElementById('cbm-layer1-privacy-notice-host');
      if (!el) throw new Error('not mounted yet');
      return el;
    });
    expect(host.shadowRoot).not.toBeNull();
    expect(host.shadowRoot!.textContent).toContain('mock-acknowledge');

    host.shadowRoot!.querySelector('button')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    await pending;
  });

  it('acknowledging removes the host and records the current version', async () => {
    const pending = ensureNoticeAcknowledged();
    const host = await waitFor(() => {
      const el = document.getElementById('cbm-layer1-privacy-notice-host');
      if (!el) throw new Error('not mounted yet');
      return el;
    });

    host.shadowRoot!.querySelector('button')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    await pending;

    expect(document.getElementById('cbm-layer1-privacy-notice-host')).toBeNull();
    const raw = await fakeLocal.get(NOTICE_STORAGE_KEY);
    expect(raw[NOTICE_STORAGE_KEY]).toBe(NOTICE_VERSION);
  });

  // AC-076③ 케이스 2 — 동일 버전 기록 → 미표시.
  it('does not mount the notice when the stored version already matches', async () => {
    await fakeLocal.set({ [NOTICE_STORAGE_KEY]: NOTICE_VERSION });

    await ensureNoticeAcknowledged();

    expect(document.getElementById('cbm-layer1-privacy-notice-host')).toBeNull();
  });
});
