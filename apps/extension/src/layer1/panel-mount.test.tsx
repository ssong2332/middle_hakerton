// T56 — 패널 마운트(Shadow DOM 격리, AC-052②). 실제 `MediationPanel`은 API 호출을 하므로 목으로
// 대체하고, 여기서는 "shadow root 안에 마운트됐는지 / 하나만 존재하는지 / close가 정리하는지"만
// 검증한다(컴포넌트 자체 상태 전이는 `MediationPanel.test.tsx`가 이미 커버한다).
import { afterEach, describe, expect, it, vi } from 'vitest';

// ADR-0010/F4-a — `receivedOrigin` lets a test assert on the exact `origin` reference
// `MediationPanel` was actually rendered with (identity check, not just truthiness) —
// see the "passes the origin element through" test below.
let receivedOrigin: HTMLElement | null | undefined;

vi.mock('./MediationPanel', () => ({
  MediationPanel: ({
    initialText,
    onClose,
    adapter,
    origin,
  }: {
    initialText: string;
    onClose: () => void;
    adapter?: { id: string } | null;
    origin?: HTMLElement | null;
  }) => {
    receivedOrigin = origin;
    return (
      <div data-testid="mock-panel">
        <span>{initialText}</span>
        <span data-testid="adapter-id">{adapter ? adapter.id : 'none'}</span>
        <button type="button" onClick={onClose}>
          close
        </button>
      </div>
    );
  },
}));

import { closeMediationPanel, openMediationPanel } from './panel-mount';
import type { Layer2Adapter } from './registry';

const FAKE_RECT = { top: 0, bottom: 0, left: 0, right: 0 } as DOMRect;

describe('panel-mount', () => {
  afterEach(() => {
    closeMediationPanel();
    document.body.innerHTML = '';
    receivedOrigin = undefined;
  });

  it('mounts the panel inside a shadow root host attached to document.body', () => {
    openMediationPanel({ text: 'selected text', rect: FAKE_RECT, origin: null });

    const host = document.getElementById('cbm-layer1-panel-host');
    expect(host).not.toBeNull();
    expect(host!.shadowRoot).not.toBeNull();
    expect(host!.shadowRoot!.textContent).toContain('selected text');
    // host 자체의 라이트 DOM에는 패널 콘텐츠가 없어야 한다 — shadow DOM 격리 확인.
    expect(host!.textContent).toBe('');
  });

  it('only one panel host exists at a time — opening again replaces the previous one', () => {
    openMediationPanel({ text: 'first', rect: FAKE_RECT, origin: null });
    openMediationPanel({ text: 'second', rect: FAKE_RECT, origin: null });

    expect(document.querySelectorAll('#cbm-layer1-panel-host').length).toBe(1);
    expect(document.getElementById('cbm-layer1-panel-host')!.shadowRoot!.textContent).toContain(
      'second',
    );
  });

  it('closeMediationPanel removes the host entirely', () => {
    openMediationPanel({ text: 'selected text', rect: FAKE_RECT, origin: null });
    closeMediationPanel();

    expect(document.getElementById('cbm-layer1-panel-host')).toBeNull();
  });

  it('the mocked panel onClose callback also closes the panel', () => {
    openMediationPanel({ text: 'selected text', rect: FAKE_RECT, origin: null });
    const host = document.getElementById('cbm-layer1-panel-host')!;
    const closeButton = host.shadowRoot!.querySelector('button')!;
    closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(document.getElementById('cbm-layer1-panel-host')).toBeNull();
  });

  // M-7(reviewer) — UX-016 Accessibility: 닫을 때 포커스가 트리거 버튼으로 돌아간다. 버튼이
  // (여전히) DOM에 있으면 그쪽으로 포커스가 이동해야 한다 — `selection.ts`의
  // `focusFloatingButtonIfPresent`로 위임한다는 계약을 여기서 확인한다.
  it('returns focus to the triggering floating button on close, when it still exists', () => {
    const triggerButton = document.createElement('button');
    triggerButton.id = 'cbm-layer1-selection-button';
    document.body.appendChild(triggerButton);

    openMediationPanel({ text: 'selected text', rect: FAKE_RECT, origin: null });
    closeMediationPanel();

    expect(document.activeElement).toBe(triggerButton);
  });

  // T57/AC-053③ — 어댑터를 넘기지 않으면(기본값) 패널은 null을 받는다 — 층 2 없는 사이트의
  // 일상 경로.
  it('defaults to a null adapter when none is passed', () => {
    openMediationPanel({ text: 'x', rect: FAKE_RECT, origin: null });

    const host = document.getElementById('cbm-layer1-panel-host')!;
    expect(host.shadowRoot!.querySelector('[data-testid="adapter-id"]')!.textContent).toBe(
      'none',
    );
  });

  // T57/AC-053② — 매칭된 어댑터가 있으면 그대로 MediationPanel에 prop으로 전달된다.
  it('passes the matched adapter through to MediationPanel', () => {
    const fakeAdapter: Layer2Adapter = {
      id: 'github',
      matches: () => true,
      findInput: () => null,
      insert: () => true,
    };
    openMediationPanel({ text: 'x', rect: FAKE_RECT, origin: null }, fakeAdapter);

    const host = document.getElementById('cbm-layer1-panel-host')!;
    expect(host.shadowRoot!.querySelector('[data-testid="adapter-id"]')!.textContent).toBe(
      'github',
    );
  });

  // ADR-0010/F4-a — MJ-A(reviewer follow-up, T29 round 2): this is the one production
  // line (`panel-mount.tsx`'s `origin={payload.origin}`) connecting origin *capture*
  // (`selection.ts`) to origin *consumption* (`MediationPanel.handleInsert()` →
  // `adapter.findInput(origin)`). Before this test, deleting that line left all other
  // tests green — nothing watched it. Identity check, not just truthiness: a bug that
  // passed *some* element (e.g. always `null`, or the wrong one) must fail this.
  //
  // 🔴 Red evidence (2026-08-08) — temporarily removed the `origin={payload.origin}`
  // line from `panel-mount.tsx` and ran
  // `npx vitest run apps/extension/src/layer1/panel-mount.test.tsx --pool=threads`:
  //   × passes the payload origin element through to MediationPanel
  //     AssertionError: expected undefined to be <textarea></textarea>
  // (1 failed, 7 passed — only this test caught it). The line was then restored and
  // all 8 tests passed again.
  it('passes the payload origin element through to MediationPanel', () => {
    const originEl = document.createElement('textarea');
    document.body.appendChild(originEl);

    openMediationPanel({ text: 'x', rect: FAKE_RECT, origin: originEl });

    expect(receivedOrigin).toBe(originEl);
  });
});
