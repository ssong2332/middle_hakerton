// T57 — 진입점(content.ts) 배선: `docs/Architecture.md` Conventions 5 "층 1은 층 2를 모른다.
// 주입은 진입점(content.ts)에서 1회." `apps/extension/src/layer1`은 `layer2/**`를 import할 수
// 없으므로(`docs/CodingRules.md` Directory Rules), 레지스트리 lookup + adapters 배열 조립은
// layer1도 layer2도 아닌 이 파일이 소유한다.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Layer2Adapter } from './layer1/registry';
import type { SelectionPayload } from './layer1/selection';

const mockInitSelectionOverlay = vi.fn();
const mockOpenMediationPanel = vi.fn();
const mockEnsureNoticeAcknowledged = vi.fn(() => Promise.resolve());
const mockAdapters: Layer2Adapter[] = [];

vi.mock('./layer1/selection', () => ({
  initSelectionOverlay: mockInitSelectionOverlay,
}));
vi.mock('./layer1/panel-mount', () => ({
  openMediationPanel: mockOpenMediationPanel,
}));
// T58 — content.ts now awaits notice acknowledgment before wiring the selection overlay
// (UX-017 Entry). The notice's own behavior is covered by notice.test.ts/notice-mount.test.tsx;
// here it's mocked to resolve immediately so this file keeps testing only T57's registry wiring.
vi.mock('./layer1/notice-mount', () => ({
  ensureNoticeAcknowledged: mockEnsureNoticeAcknowledged,
}));
vi.mock('./layer2', () => ({
  adapters: mockAdapters,
}));

function getWiredOnSelect(): (payload: SelectionPayload) => void {
  const call = mockInitSelectionOverlay.mock.calls[0][0] as {
    onSelect: (payload: SelectionPayload) => void;
  };
  return call.onSelect;
}

describe('content.ts wiring (T57)', () => {
  beforeEach(() => {
    vi.resetModules();
    mockInitSelectionOverlay.mockClear();
    mockOpenMediationPanel.mockClear();
    mockEnsureNoticeAcknowledged.mockClear();
    mockAdapters.length = 0;
  });

  it('passes the registry-matched adapter through to openMediationPanel', async () => {
    const fakeAdapter: Layer2Adapter = {
      id: 'github',
      matches: () => true,
      findInput: () => null,
      insert: () => true,
    };
    mockAdapters.push(fakeAdapter);

    await import('./content');
    await Promise.resolve();
    await Promise.resolve();
    const onSelect = getWiredOnSelect();
    const payload: SelectionPayload = { text: 'hi', rect: {} as DOMRect, origin: null };
    onSelect(payload);

    expect(mockOpenMediationPanel).toHaveBeenCalledWith(payload, fakeAdapter);
  });

  // AC-053③ — 등록된 어댑터가 없으면(빈 배열) null을 넘긴다. 층 1 경로는 이 값만으로 동작한다.
  it('passes null when no registered adapter matches (empty registry)', async () => {
    await import('./content');
    await Promise.resolve();
    await Promise.resolve();
    const onSelect = getWiredOnSelect();
    const payload: SelectionPayload = { text: 'hi', rect: {} as DOMRect, origin: null };
    onSelect(payload);

    expect(mockOpenMediationPanel).toHaveBeenCalledWith(payload, null);
  });

  // T58/UX-017 Entry — 선택 오버레이는 고지 확인이 끝난 뒤에만 켜진다.
  it('waits for ensureNoticeAcknowledged before wiring the selection overlay', async () => {
    let resolveNotice!: () => void;
    mockEnsureNoticeAcknowledged.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveNotice = resolve;
      }),
    );

    await import('./content');
    await Promise.resolve();
    expect(mockInitSelectionOverlay).not.toHaveBeenCalled();

    resolveNotice();
    await Promise.resolve();
    await Promise.resolve();
    expect(mockInitSelectionOverlay).toHaveBeenCalledTimes(1);
  });
});
