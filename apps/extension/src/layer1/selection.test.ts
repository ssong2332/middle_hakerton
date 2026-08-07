// T55 — 선택 감지 + 플로팅 버튼 테스트 (AC-052 ①③④⑤).
// jsdom은 실제 레이아웃 엔진이 없어 `getBoundingClientRect()`가 기본적으로 0을 반환한다
// (`docs/CodingRules.md` Tests 절 semantic vs structural 구분) — 그래서 픽셀 값이 아니라
// "코드가 selection의 rect를 실제로 읽어 버튼 위치 계산에 썼는지"를 구조적으로 검증한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initSelectionOverlay, removeFloatingButton } from './selection';

const BUTTON_ID = 'cbm-layer1-selection-button';

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

function collapseSelection(): void {
  window.getSelection()?.removeAllRanges();
}

function fireMouseUp(): void {
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
}

function getButton(): HTMLButtonElement | null {
  return document.getElementById(BUTTON_ID) as HTMLButtonElement | null;
}

// 두 개의 "일반 사이트" 레이아웃을 흉내낸다 — 층 1은 사이트를 식별하지 않으므로(AC-052③) 같은
// 코드가 구조가 다른 두 문서에서 동일하게 동작해야 한다. 실제 라이브 사이트(Wikipedia/MDN)
// 검증은 오케스트레이터가 별도로 수행했다(이 태스크 보고 참조) — 여기서는 자동화된 회귀만 커버한다.
function renderGenericSiteA(): HTMLElement {
  document.body.innerHTML =
    '<article id="content-a"><p>Hello selectable paragraph text.</p></article>';
  return document.getElementById('content-a') as HTMLElement;
}

function renderGenericSiteB(): HTMLElement {
  document.body.innerHTML =
    '<main><section class="widget"><div id="content-b">Another unrelated site body copy.</div></section></main>';
  return document.getElementById('content-b') as HTMLElement;
}

describe('initSelectionOverlay', () => {
  let cleanup: () => void;
  // 🔴 jsdom은 `Range.prototype.getBoundingClientRect`를 아예 구현하지 않는다(measured —
  // `node_modules/jsdom`의 Range 구현에 해당 메서드 없음, 실제 브라우저는 구현하므로 프로덕션
  // 코드에는 영향 없음). `vi.spyOn`은 기존 메서드가 있어야 동작하므로 여기서는 프로토타입에
  // 직접 대입/복원한다 — 이 shim은 테스트 전용이며 `selection.ts`는 건드리지 않는다.
  let originalGetBoundingClientRect: typeof Range.prototype.getBoundingClientRect | undefined;

  beforeEach(() => {
    originalGetBoundingClientRect = Range.prototype.getBoundingClientRect;
    Range.prototype.getBoundingClientRect = vi.fn(() => FAKE_RECT);
  });

  afterEach(() => {
    cleanup?.();
    if (originalGetBoundingClientRect) {
      Range.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    } else {
      delete (Range.prototype as { getBoundingClientRect?: unknown }).getBoundingClientRect;
    }
    document.body.innerHTML = '';
    window.getSelection()?.removeAllRanges();
  });

  for (const [siteName, renderSite] of [
    ['generic site A', renderGenericSiteA],
    ['generic site B', renderGenericSiteB],
  ] as const) {
    describe(siteName, () => {
      it('mouseup with non-empty selection shows a floating button positioned from the selection rect', () => {
        const content = renderSite();
        cleanup = initSelectionOverlay();

        selectTextIn(content);
        fireMouseUp();

        const button = getButton();
        expect(button).not.toBeNull();
        // 위치 계산이 selection의 getBoundingClientRect() 반환값을 실제로 사용했는지 확인한다.
        expect(button!.style.left).toBe(`${FAKE_RECT.left}px`);
        expect(button!.style.top).toBe(`${FAKE_RECT.bottom + 4}px`);
      });

      it('mouseup with empty/collapsed selection does not show a button', () => {
        renderSite();
        cleanup = initSelectionOverlay();

        collapseSelection();
        fireMouseUp();

        expect(getButton()).toBeNull();
      });

      it('clearing the selection removes an existing floating button', () => {
        const content = renderSite();
        cleanup = initSelectionOverlay();

        selectTextIn(content);
        fireMouseUp();
        expect(getButton()).not.toBeNull();

        collapseSelection();
        fireMouseUp();

        expect(getButton()).toBeNull();
      });

      it('pressing Escape removes an existing floating button', () => {
        const content = renderSite();
        cleanup = initSelectionOverlay();

        selectTextIn(content);
        fireMouseUp();
        expect(getButton()).not.toBeNull();

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

        expect(getButton()).toBeNull();
      });

      it('only one floating button exists at a time even with rapid mouseup events', () => {
        const content = renderSite();
        cleanup = initSelectionOverlay();

        selectTextIn(content);
        fireMouseUp();
        fireMouseUp();
        fireMouseUp();

        expect(document.querySelectorAll(`#${BUTTON_ID}`).length).toBe(1);
      });

      it('does not intercept the host page click behaviour before the button appears (AC-052⑤)', () => {
        renderSite();
        const pageClickListener = vi.fn();
        document.addEventListener('click', pageClickListener);
        cleanup = initSelectionOverlay();

        const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
        document.body.dispatchEvent(clickEvent);

        expect(pageClickListener).toHaveBeenCalledTimes(1);
        expect(clickEvent.defaultPrevented).toBe(false);

        document.removeEventListener('click', pageClickListener);
      });

      it('clicking the floating button invokes the provided onSelect callback with the selected text', () => {
        const content = renderSite();
        const onSelect = vi.fn();
        cleanup = initSelectionOverlay({ onSelect });

        selectTextIn(content);
        fireMouseUp();

        const button = getButton();
        button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onSelect.mock.calls[0][0].text.length).toBeGreaterThan(0);
      });
    });
  }

  // AC-052③(대상 사이트 식별 코드 없음)은 여기서 단위 테스트로 검증하지 않는다 —
  // `docs/CodingRules.md` Tests 절 "부재 검증" 행이 이런 "없음"의 판정 수단으로 **코드 검색
  // (grep) 결과를 근거로 첨부**하도록 명시적으로 지정했다("단위 테스트로 '없음'을 증명할 수
  // 없다"). 게다가 이 파일이 브라우저 전용 tsconfig(`apps/extension/tsconfig.json`의
  // `types: ["chrome"]`)를 쓰는 워크스페이스에 있어 `node:fs`를 정적으로 import하면
  // typecheck가 깨진다 — Node 타입을 얹는 것은 이 태스크 범위 밖의 tsconfig 변경이 된다.
  // 근거는 구현 완료 보고에 `grep -n "location\\." apps/extension/src/layer1/selection.ts
  // apps/extension/src/content.ts` 실행 결과로 첨부한다.
});

describe('removeFloatingButton (module-level export)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('is a no-op when no button exists', () => {
    expect(() => removeFloatingButton()).not.toThrow();
  });
});
