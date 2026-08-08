// T56 — 패널 마운트(Shadow DOM 격리, AC-052②). 실제 `MediationPanel`은 API 호출을 하므로 목으로
// 대체하고, 여기서는 "shadow root 안에 마운트됐는지 / 하나만 존재하는지 / close가 정리하는지"만
// 검증한다(컴포넌트 자체 상태 전이는 `MediationPanel.test.tsx`가 이미 커버한다).
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./MediationPanel', () => ({
  MediationPanel: ({ initialText, onClose }: { initialText: string; onClose: () => void }) => (
    <div data-testid="mock-panel">
      <span>{initialText}</span>
      <button type="button" onClick={onClose}>
        close
      </button>
    </div>
  ),
}));

import { closeMediationPanel, openMediationPanel } from './panel-mount';

const FAKE_RECT = { top: 0, bottom: 0, left: 0, right: 0 } as DOMRect;

describe('panel-mount', () => {
  afterEach(() => {
    closeMediationPanel();
    document.body.innerHTML = '';
  });

  it('mounts the panel inside a shadow root host attached to document.body', () => {
    openMediationPanel({ text: 'selected text', rect: FAKE_RECT });

    const host = document.getElementById('cbm-layer1-panel-host');
    expect(host).not.toBeNull();
    expect(host!.shadowRoot).not.toBeNull();
    expect(host!.shadowRoot!.textContent).toContain('selected text');
    // host 자체의 라이트 DOM에는 패널 콘텐츠가 없어야 한다 — shadow DOM 격리 확인.
    expect(host!.textContent).toBe('');
  });

  it('only one panel host exists at a time — opening again replaces the previous one', () => {
    openMediationPanel({ text: 'first', rect: FAKE_RECT });
    openMediationPanel({ text: 'second', rect: FAKE_RECT });

    expect(document.querySelectorAll('#cbm-layer1-panel-host').length).toBe(1);
    expect(document.getElementById('cbm-layer1-panel-host')!.shadowRoot!.textContent).toContain(
      'second',
    );
  });

  it('closeMediationPanel removes the host entirely', () => {
    openMediationPanel({ text: 'selected text', rect: FAKE_RECT });
    closeMediationPanel();

    expect(document.getElementById('cbm-layer1-panel-host')).toBeNull();
  });

  it('the mocked panel onClose callback also closes the panel', () => {
    openMediationPanel({ text: 'selected text', rect: FAKE_RECT });
    const host = document.getElementById('cbm-layer1-panel-host')!;
    const closeButton = host.shadowRoot!.querySelector('button')!;
    closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(document.getElementById('cbm-layer1-panel-host')).toBeNull();
  });
});
