// M-A(reviewer, T56 review round 3) — `panel-mount.test.tsx`의 M-7 테스트는 트리거 버튼을 직접
// `document.body.appendChild`로 만들고 `closeMediationPanel()`을 바로 호출한다. 그건 T55의 실제
// `document`-레벨 리스너(`initSelectionOverlay()`가 등록하는 `keydown`/`selectionchange`)를 전혀
// 거치지 않는다 — 그래서 "패널을 열자마자 Escape로 닫으면 포커스가 버튼으로 돌아간다"는 이전 주장이
// 틀렸다는 걸 그 테스트만으로는 잡아낼 수 없었다.
//
// 여기서는 실제 배선을 그대로 쓴다: `initSelectionOverlay({ onSelect: openMediationPanel })` →
// 진짜 텍스트 selection → `mouseup` → 플로팅 버튼 클릭으로 패널 오픈 → 패널(다이얼로그)에 진짜
// `keydown Escape` 이벤트(`bubbles:true, composed:true`)를 디스패치. 이벤트는 네이티브 DOM
// 버블링을 따라 (shadow root 안의 React 마운트 지점) → shadow host → `document` 순서로 전파된다.
// 패널의 `onKeyDown`(`MediationPanel.tsx`)이 먼저 `onClose()`(`closeMediationPanel` →
// `focusFloatingButtonIfPresent()`)를 실행해 버튼에 포커스를 준다 — 하지만 그 직후 같은 이벤트가
// `document`까지 버블되면서 T55의 `handleKeyDown`(`selection.ts`)이 `removeFloatingButton()`으로
// 그 버튼을 DOM에서 지워버린다. 포커스는 설정되자마자 무너진 대상과 함께 사라진다.
//
// 결론(수정된 주장, reviewer 트레이스 근거) — 어떤 경로로도 패널을 닫을 때 포커스가 트리거
// 버튼으로 돌아가지 않는다. "즉시 Escape" 경로도 예외가 아니다 — 이전 구현 완료 보고의 "그
// 좁은 경로에서만 동작한다"는 주장은 틀렸다. 이 테스트는 그 실제 동작(버튼이 사라지고 포커스가
// 버튼에 있지 않음)을 고정한다 — 고쳐야 할 대상(T55/T56 상호작용, orchestrator/ux-design 라우팅
// 대기)의 정확한 회귀 기준점이다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';

vi.mock('../shared/token-storage', () => ({
  getStoredToken: vi.fn(),
}));
vi.mock('../shared/api', () => ({
  callMediationApi: vi.fn(),
  // T66 — MediationPanel이 idle 진입 시 이 함수를 호출한다. 이 파일은 그 기능과 무관하므로
  // 규약 0건(빈 배열)으로 고정해 기존 시나리오에 영향을 주지 않는다.
  fetchKnownCounterparts: vi.fn().mockResolvedValue({ ok: true, counterparts: [] }),
}));

import { getStoredToken } from '../shared/token-storage';
import { closeMediationPanel } from './panel-mount';
import { openMediationPanel } from './panel-mount';
import { initSelectionOverlay } from './selection';

const mockedGetStoredToken = vi.mocked(getStoredToken);

const BUTTON_ID = 'cbm-layer1-selection-button';
const HOST_ID = 'cbm-layer1-panel-host';

const FAKE_RECT: DOMRect = {
  x: 10,
  y: 20,
  width: 100,
  height: 20,
  top: 20,
  left: 10,
  right: 110,
  bottom: 40,
  toJSON() {
    return this;
  },
} as DOMRect;

function selectTextIn(el: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(el);
  const selection = window.getSelection();
  if (!selection) throw new Error('window.getSelection() unavailable in test environment');
  selection.removeAllRanges();
  selection.addRange(range);
}

describe('panel close focus-return — real T55+T56 wiring (M-A, corrects M-7 claim)', () => {
  let cleanup: (() => void) | undefined;
  let originalGetBoundingClientRect: typeof Range.prototype.getBoundingClientRect | undefined;

  beforeEach(() => {
    originalGetBoundingClientRect = Range.prototype.getBoundingClientRect;
    Range.prototype.getBoundingClientRect = vi.fn(() => FAKE_RECT);
    mockedGetStoredToken.mockResolvedValue('fake-token');
    document.body.innerHTML = '<article id="content"><p>Selectable paragraph text.</p></article>';
  });

  afterEach(() => {
    cleanup?.();
    closeMediationPanel();
    if (originalGetBoundingClientRect) {
      Range.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    } else {
      delete (Range.prototype as { getBoundingClientRect?: unknown }).getBoundingClientRect;
    }
    document.body.innerHTML = '';
    window.getSelection()?.removeAllRanges();
    vi.clearAllMocks();
  });

  it('does NOT keep focus on the trigger button after an in-panel Escape keydown bubbles to document (real listeners)', async () => {
    cleanup = initSelectionOverlay({ onSelect: openMediationPanel });

    const content = document.getElementById('content')!;
    selectTextIn(content);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    const triggerButton = document.getElementById(BUTTON_ID) as HTMLButtonElement | null;
    expect(triggerButton).not.toBeNull();
    triggerButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const host = document.getElementById(HOST_ID);
    expect(host).not.toBeNull();
    const dialog = await waitFor(() => {
      const el = host!.shadowRoot!.querySelector('[role="dialog"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });

    // 실제 DOM 버블링 경로 — shadow root 안 → shadow host → document. `composed:true`가 shadow
    // 경계를 넘어 버블되게 한다(실브라우저 동작과 동일, jsdom도 지원).
    dialog.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
    );

    // T55의 document-레벨 handleKeyDown이 버튼을 지운다 — 패널의 onClose가 먼저 포커스를 줬어도
    // 그 대상 자체가 사라진다.
    expect(document.getElementById(BUTTON_ID)).toBeNull();
    // 지워진 버튼에는 포커스가 있을 수 없다 — "즉시 Escape 경로는 동작한다"는 이전 주장과 달리,
    // document.activeElement가 트리거 버튼일 수 없다.
    expect(document.activeElement).not.toBe(triggerButton);
  });
});
