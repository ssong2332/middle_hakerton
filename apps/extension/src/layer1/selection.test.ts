// T55 — 선택 감지 + 플로팅 버튼 테스트 (AC-052 ①③④⑤).
// jsdom은 실제 레이아웃 엔진이 없어 `getBoundingClientRect()`가 기본적으로 0을 반환한다
// (`docs/CodingRules.md` Tests 절 semantic vs structural 구분) — 그래서 픽셀 값이 아니라
// "코드가 selection의 rect를 실제로 읽어 버튼 위치 계산에 썼는지"를 구조적으로 검증한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeClampedPosition,
  focusFloatingButtonIfPresent,
  initSelectionOverlay,
  removeFloatingButton,
} from './selection';

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

      // ADR-0010/F4-a — the payload must carry the Element the selection came from
      // (captured at selection time, before focus can move to the panel). For a
      // document-range selection, origin is the nearest Element ancestor of
      // range.commonAncestorContainer (the text node's parentElement here).
      it('captures the nearest Element ancestor of the selection as origin', () => {
        const content = renderSite();
        const onSelect = vi.fn();
        cleanup = initSelectionOverlay({ onSelect });

        selectTextIn(content);
        fireMouseUp();

        const button = getButton();
        button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(onSelect).toHaveBeenCalledTimes(1);
        const origin = onSelect.mock.calls[0][0].origin;
        expect(origin).toBeInstanceOf(Element);
        expect(content.contains(origin)).toBe(true);
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

// C-1 (reviewer, Critical) — 뷰포트 클램핑. jsdom엔 실제 레이아웃 엔진이 없어 버튼 크기가
// 항상 0으로 측정된다(DOM 통합 테스트만으로는 clamp 산술 자체를 신뢰성 있게 검증할 수 없음).
// 그래서 클램핑 계산을 순수 함수(`computeClampedPosition`)로 분리해 여기서 직접 단위 테스트한다.
describe('computeClampedPosition (C-1 viewport clamping — pure function)', () => {
  const viewport = { width: 1000, height: 800 };
  const buttonSize = { width: 120, height: 32 };

  it('positions below-right of the selection when it fits within the viewport', () => {
    const rect = { top: 100, bottom: 120, left: 50, right: 150 };
    expect(computeClampedPosition(rect, buttonSize, viewport)).toEqual({ top: 124, left: 50 });
  });

  it('flips to above the selection when placing it below would overflow the bottom edge', () => {
    // rect.bottom(780)+gap(4)=784; 784+height(32)=816 > viewport.height(800) → overflow → flip.
    const rect = { top: 750, bottom: 780, left: 100, right: 200 };
    expect(computeClampedPosition(rect, buttonSize, viewport)).toEqual({
      top: 750 - buttonSize.height - 4, // 714
      left: 100,
    });
  });

  it('shifts left when the default position would overflow the right edge', () => {
    // rect.left(950)+width(120)=1070 > viewport.width(1000) → shift so left+width === viewport.width.
    const rect = { top: 100, bottom: 120, left: 950, right: 1050 };
    expect(computeClampedPosition(rect, buttonSize, viewport)).toEqual({
      top: 124,
      left: 1000 - buttonSize.width, // 880
    });
  });

  it('clamps left to 0 when the button is wider than the viewport even after shifting', () => {
    const narrowViewport = { width: 100, height: 800 };
    const rect = { top: 100, bottom: 120, left: 10, right: 130 };
    const result = computeClampedPosition(rect, buttonSize, narrowViewport);
    expect(result.left).toBe(0);
  });

  it('clamps top to 0 when the button is taller than the viewport even after flipping', () => {
    const shortViewport = { width: 1000, height: 100 };
    const tallButton = { width: 120, height: 120 };
    const rect = { top: 40, bottom: 60, left: 0, right: 0 };
    const result = computeClampedPosition(rect, tallButton, shortViewport);
    expect(result.top).toBe(0);
  });
});

describe('initSelectionOverlay — viewport clamping integration (C-1)', () => {
  let cleanup: () => void;
  let originalRangeRect: typeof Range.prototype.getBoundingClientRect | undefined;
  let buttonRectSpy: ReturnType<typeof vi.spyOn> | undefined;
  let originalInnerWidth: number;
  let originalInnerHeight: number;

  beforeEach(() => {
    originalRangeRect = Range.prototype.getBoundingClientRect;
    originalInnerWidth = window.innerWidth;
    originalInnerHeight = window.innerHeight;
  });

  afterEach(() => {
    cleanup?.();
    if (originalRangeRect) {
      Range.prototype.getBoundingClientRect = originalRangeRect;
    } else {
      delete (Range.prototype as { getBoundingClientRect?: unknown }).getBoundingClientRect;
    }
    buttonRectSpy?.mockRestore();
    Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: originalInnerHeight, configurable: true });
    document.body.innerHTML = '';
    window.getSelection()?.removeAllRanges();
  });

  it('flips the button above the selection when it would overflow the viewport bottom', () => {
    // Selection near the bottom of a short viewport; button height forces an overflow below.
    const nearBottomRect = {
      x: 10,
      y: 70,
      width: 100,
      height: 20,
      top: 70,
      left: 10,
      right: 110,
      bottom: 90,
      toJSON() {
        return this;
      },
    } as DOMRect;
    Range.prototype.getBoundingClientRect = vi.fn(() => nearBottomRect);
    buttonRectSpy = vi
      .spyOn(HTMLButtonElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ width: 100, height: 30, top: 0, left: 0, bottom: 30, right: 100 } as DOMRect);
    Object.defineProperty(window, 'innerHeight', { value: 100, configurable: true });

    const content = renderGenericSiteA();
    cleanup = initSelectionOverlay();
    selectTextIn(content);
    fireMouseUp();

    const button = getButton();
    expect(button).not.toBeNull();
    // below = 90+4=94; 94+30=124 > 100 → flip: top = 70-30-4 = 36.
    expect(button!.style.top).toBe('36px');
  });

  it('shifts the button left and floors it at 0 when it would overflow the viewport right edge', () => {
    Range.prototype.getBoundingClientRect = vi.fn(() => FAKE_RECT);
    buttonRectSpy = vi
      .spyOn(HTMLButtonElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ width: 100, height: 30, top: 0, left: 0, bottom: 30, right: 100 } as DOMRect);
    Object.defineProperty(window, 'innerWidth', { value: 80, configurable: true });

    const content = renderGenericSiteA();
    cleanup = initSelectionOverlay();
    selectTextIn(content);
    fireMouseUp();

    const button = getButton();
    expect(button).not.toBeNull();
    // FAKE_RECT.left(10)+width(100)=110 > innerWidth(80) → shift to 80-100=-20 → floor at 0.
    expect(button!.style.left).toBe('0px');
  });
});

// M-1 (reviewer, Major) — 실브라우저에서 버튼 위 mousedown이 document selection을 collapse시켜
// selectionchange가 버튼을 지우기 전에 클릭이 도달하지 못하는 문제. jsdom은 mousedown으로
// selection을 collapse하지 않으므로(이 문제를 가리는 원인) 여기서는 버튼이 자기 자신의
// mousedown에 대해 실제로 preventDefault를 호출하는지를 직접 검증한다.
describe('initSelectionOverlay — button preserves native selection on mousedown (M-1)', () => {
  let cleanup: () => void;
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

  it('calls preventDefault on mousedown targeting the floating button itself', () => {
    const content = renderGenericSiteA();
    cleanup = initSelectionOverlay();

    selectTextIn(content);
    fireMouseUp();

    const button = getButton()!;
    const mousedownEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    button.dispatchEvent(mousedownEvent);

    expect(mousedownEvent.defaultPrevented).toBe(true);
  });
});

// M-2 (reviewer, Major) — 실브라우저에서 `<textarea>`/`<input>` 안의 선택은
// `window.getSelection().toString()`이 빈 문자열을 반환해 버튼이 뜨지 않는 문제
// (`docs/UX.md:187` UF-005 1단계). `document.activeElement`가 폼 컨트롤이고 선택이
// non-collapsed면 `.value.slice(selectionStart, selectionEnd)`로 읽어야 한다.
describe('initSelectionOverlay — form control selections (M-2)', () => {
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
    document.body.innerHTML = '';
  });

  function selectInFormControl(el: HTMLTextAreaElement | HTMLInputElement, start: number, end: number): void {
    el.focus();
    el.setSelectionRange(start, end);
  }

  it('shows the button with the correct substring for text selected in a <textarea>', () => {
    document.body.innerHTML = '<textarea id="ta">Hello selectable body copy</textarea>';
    const textarea = document.getElementById('ta') as HTMLTextAreaElement;
    const onSelect = vi.fn();
    cleanup = initSelectionOverlay({ onSelect });

    selectInFormControl(textarea, 6, 16); // "selectable"
    fireMouseUp();

    const button = getButton();
    expect(button).not.toBeNull();
    button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].text).toBe('selectable');
  });

  it('shows the button with the correct substring for text selected in an <input>', () => {
    document.body.innerHTML = '<input id="inp" value="Hello selectable body copy" />';
    const input = document.getElementById('inp') as HTMLInputElement;
    const onSelect = vi.fn();
    cleanup = initSelectionOverlay({ onSelect });

    selectInFormControl(input, 6, 16); // "selectable"
    fireMouseUp();

    const button = getButton();
    expect(button).not.toBeNull();
    button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].text).toBe('selectable');
  });

  // ADR-0010/F4-a — for a form-control selection, origin is the control itself
  // (getFormControlSelectionPayload() already holds a reference to it).
  it('captures the form control itself as origin for a <textarea> selection', () => {
    document.body.innerHTML = '<textarea id="ta">Hello selectable body copy</textarea>';
    const textarea = document.getElementById('ta') as HTMLTextAreaElement;
    const onSelect = vi.fn();
    cleanup = initSelectionOverlay({ onSelect });

    selectInFormControl(textarea, 6, 16); // "selectable"
    fireMouseUp();

    const button = getButton();
    button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].origin).toBe(textarea);
  });

  it('captures the form control itself as origin for an <input> selection', () => {
    document.body.innerHTML = '<input id="inp" value="Hello selectable body copy" />';
    const input = document.getElementById('inp') as HTMLInputElement;
    const onSelect = vi.fn();
    cleanup = initSelectionOverlay({ onSelect });

    selectInFormControl(input, 6, 16); // "selectable"
    fireMouseUp();

    const button = getButton();
    button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].origin).toBe(input);
  });

  it('does not show the button for an empty/collapsed textarea selection', () => {
    document.body.innerHTML = '<textarea id="ta">Hello</textarea>';
    const textarea = document.getElementById('ta') as HTMLTextAreaElement;
    cleanup = initSelectionOverlay();

    selectInFormControl(textarea, 3, 3);
    fireMouseUp();

    expect(getButton()).toBeNull();
  });
});

// M-3 (reviewer, Major) — 이전 구현은 어떤 scroll 이벤트에도(중첩 스크롤 컨테이너 포함,
// `capture:true`) 버튼을 지웠다. `docs/UX.md:928`가 명시하는 해제 트리거는 정확히 3개
// (다른 곳 클릭 / Escape / 새 빈 선택)뿐이고 scroll은 없다 — 이 테스트는 scroll 리스너를
// 완전히 제거한 뒤의 동작(= 이전과 반대: 더 이상 지워지지 않음)을 검증한다. 이 파일에는
// 이전 라운드에 scroll이 버튼을 지운다는 테스트가 없었으므로 "뒤집는" 대상 테스트는 없고,
// 이번 라운드에 신규로 추가한다(구현 완료 보고에도 동일하게 기재).
describe('initSelectionOverlay — scroll does not dismiss the button (M-3)', () => {
  let cleanup: () => void;
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

  it('keeps the floating button visible when the page (or a nested container) scrolls', () => {
    const content = renderGenericSiteA();
    cleanup = initSelectionOverlay();

    selectTextIn(content);
    fireMouseUp();
    expect(getButton()).not.toBeNull();

    window.dispatchEvent(new Event('scroll'));

    expect(getButton()).not.toBeNull();
  });
});

// M-A (QA, Major) — `handleSelectionChange`의 제거 조건이 `handleMouseUp`의 생성 조건보다 좁았다.
// 생성은 `getSelectionPayload()`(문서 selection **또는** 폼 컨트롤 selection)를 쓰지만, 제거는
// `window.getSelection()`만 봤다. 폼 컨트롤 selection이 있으면 `window.getSelection()`은 설계상
// 항상 빈 문자열을 반환하므로(M-2의 전제), 폼 컨트롤 selection이 떠 있는 동안 document에 닿는
// 아무 selectionchange나(예: Shift+Arrow로 selection 확장 — form-control selectionchange는
// bubble된다) 버튼을 잘못 지웠다. 재현: textarea drag-select → 버튼 표시 → 키보드로 selection
// 확장 → selectionchange 발생 → 버튼이 사라짐(문서화되지 않은 4번째 해제 트리거,
// `docs/UX.md:928` 위반). jsdom은 `setSelectionRange()`에 대해 selectionchange를 자동 발동하지
// 않으므로 수동으로 dispatch한다.
describe('initSelectionOverlay — selectionchange removal is symmetric with creation (M-A)', () => {
  let cleanup: () => void;
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

  it('keeps the floating button when a document-level selectionchange fires while a form-control selection is still active', () => {
    document.body.innerHTML = '<textarea id="ta">Hello selectable body copy</textarea>';
    const textarea = document.getElementById('ta') as HTMLTextAreaElement;
    cleanup = initSelectionOverlay();

    textarea.focus();
    textarea.setSelectionRange(6, 16); // "selectable"
    fireMouseUp();
    expect(getButton()).not.toBeNull();

    // 실브라우저에서 폼 컨트롤 selection을 키보드로 확장하면 selectionchange가 발동해
    // document까지 버블된다(form-control selectionchange는 bubble됨) — jsdom은 이를 자동
    // 발동하지 않으므로 수동 dispatch로 흉내낸다.
    document.dispatchEvent(new Event('selectionchange'));

    expect(getButton()).not.toBeNull();
  });

  it('removes the button on a genuine document-level selectionchange to an empty selection when no form-control selection is active either (M-2/AC-052④ still holds)', () => {
    const content = renderGenericSiteA();
    cleanup = initSelectionOverlay();

    selectTextIn(content);
    fireMouseUp();
    expect(getButton()).not.toBeNull();

    collapseSelection();
    document.dispatchEvent(new Event('selectionchange'));

    expect(getButton()).toBeNull();
  });
});

describe('removeFloatingButton (module-level export)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('is a no-op when no button exists', () => {
    expect(() => removeFloatingButton()).not.toThrow();
  });
});

// M-7(reviewer) — UX-016 Accessibility: "focus ... returns to the triggering floating button on
// close." panel-mount.tsx가 패널을 닫을 때 이 헬퍼로 위임한다. 버튼이 이미 사라진 경우(실사용
// 흐름에서 흔하다 — 패널 안 요소를 클릭하면 그 mousedown이 문서 selection을 collapse시켜
// selectionchange가 버튼을 먼저 지운다)에는 조용히 아무 일도 하지 않는다 — 존재하지 않는
// 요소에 포커스를 강제하지 않는다.
describe('focusFloatingButtonIfPresent (module-level export, M-7)', () => {
  // jsdom은 Range.prototype.getBoundingClientRect를 구현하지 않는다 — 위 다른 describe들과
  // 같은 스텁(파일 상단 주석 참조).
  let originalGetBoundingClientRect: typeof Range.prototype.getBoundingClientRect | undefined;

  beforeEach(() => {
    originalGetBoundingClientRect = Range.prototype.getBoundingClientRect;
    Range.prototype.getBoundingClientRect = vi.fn(() => FAKE_RECT);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    if (originalGetBoundingClientRect) {
      Range.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    } else {
      delete (Range.prototype as { getBoundingClientRect?: unknown }).getBoundingClientRect;
    }
  });

  it('is a no-op when no button exists', () => {
    expect(() => focusFloatingButtonIfPresent()).not.toThrow();
  });

  it('focuses the floating button when it still exists', () => {
    const content = renderGenericSiteA();
    const cleanup = initSelectionOverlay();

    selectTextIn(content);
    fireMouseUp();
    const button = getButton();
    expect(button).not.toBeNull();

    focusFloatingButtonIfPresent();

    expect(document.activeElement).toBe(button);
    cleanup();
  });
});
