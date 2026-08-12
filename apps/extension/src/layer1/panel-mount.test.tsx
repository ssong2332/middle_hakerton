// T56 — 패널 마운트(Shadow DOM 격리, AC-052②). 실제 `MediationPanel`은 API 호출을 하므로 목으로
// 대체하고, 여기서는 "shadow root 안에 마운트됐는지 / 하나만 존재하는지 / close가 정리하는지"만
// 검증한다(컴포넌트 자체 상태 전이는 `MediationPanel.test.tsx`가 이미 커버한다).
import { afterEach, describe, expect, it, vi } from 'vitest';

// ADR-0010/F4-a — `receivedOrigin` lets a test assert on the exact `origin` reference
// `MediationPanel` was actually rendered with (identity check, not just truthiness) —
// see the "passes the origin element through" test below.
let receivedOrigin: HTMLElement | null | undefined;
// 🔴 (2026-08-12, T81) `receivedAnchorRect` — same pattern for `payload.rect`, which used to be
// silently dropped (never passed to MediationPanel at all, so the panel could never position
// itself near the selection). See "passes the payload rect through as anchorRect" below.
let receivedAnchorRect: DOMRect | null | undefined;

vi.mock('./MediationPanel', () => ({
  MediationPanel: ({
    initialText,
    onClose,
    adapter,
    origin,
    anchorRect,
  }: {
    initialText: string;
    onClose: () => void;
    adapter?: { id: string } | null;
    origin?: HTMLElement | null;
    anchorRect?: DOMRect | null;
  }) => {
    receivedOrigin = origin;
    receivedAnchorRect = anchorRect;
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
    receivedAnchorRect = undefined;
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

  // 🔴 (2026-08-12, T82) 사용자 신고 — 패널이 열려도 트리거 버튼이 화면에 남아 둘이 동시에
  // 보였다. 패널이 열리면 버튼은 바로 사라져야 한다.
  it('hides the floating trigger button as soon as the panel opens (both are never shown at once)', () => {
    const triggerButton = document.createElement('button');
    triggerButton.id = 'cbm-layer1-selection-button';
    document.body.appendChild(triggerButton);

    openMediationPanel({ text: 'selected text', rect: FAKE_RECT, origin: null });

    expect(document.getElementById('cbm-layer1-selection-button')).toBeNull();
  });

  // M-7(reviewer) — UX-016 Accessibility: 닫을 때 포커스가 트리거 버튼으로 돌아간다. 버튼이
  // 열려 있는 동안(위 테스트대로) 사라지므로, 이 경로는 이제 "패널이 열린 사이 다른 곳을 다시
  // 선택해 버튼이 새로 생긴" 드문 경우에만 의미가 있다 — `closeMediationPanel`이 그 버튼을 향해
  // `focusFloatingButtonIfPresent`를 여전히 호출한다는 배선 자체는 계속 검증한다(무조건 no-op이
  // 아니다).
  it('returns focus to a floating button if one exists at close time', () => {
    openMediationPanel({ text: 'selected text', rect: FAKE_RECT, origin: null });

    // 패널이 열려 있는 동안 새 버튼이 생긴 상황을 흉내낸다(위 테스트가 확인했듯 open 시점의
    // 버튼은 이미 지워졌다).
    const triggerButton = document.createElement('button');
    triggerButton.id = 'cbm-layer1-selection-button';
    document.body.appendChild(triggerButton);

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

  // 🔴 (2026-08-12, T81) Red evidence — before wiring `anchorRect={payload.rect}` in
  // `panel-mount.tsx`, this test failed with `expected undefined to be { top: 5, ... }`
  // (`payload.rect` was received here but never forwarded). Confirms the panel now has what it
  // needs to position itself near the selection instead of always defaulting to the corner.
  it('passes the payload rect through as anchorRect to MediationPanel', () => {
    const rect = { top: 5, bottom: 25, left: 15, right: 115 } as DOMRect;
    openMediationPanel({ text: 'x', rect, origin: null });

    expect(receivedAnchorRect).toBe(rect);
  });
});
