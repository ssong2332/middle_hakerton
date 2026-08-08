// @vitest-environment jsdom
/**
 * github.ts 단위 테스트 — T29(AC-021, AC-040).
 * `findInput()` 선택자는 추정(라이브 미검증)이므로 실제 DOM 대신 손으로 만든 fixture로
 * 선택자 매칭·이벤트 디스패치 로직만 검증한다.
 *
 * 🔴 MJ-B red evidence (reviewer follow-up, T29 round 2, re-verified 2026-08-08) — the 3
 * origin-based `findInput()` tests below (`resolves the origin element itself...`,
 * `resolves upward from the origin via .closest()...`, `does not read
 * document.activeElement or window.getSelection()`) were added in commit 7efb351 without
 * a recorded red run. Re-checked by temporarily checking out the pre-ADR-0010
 * implementation files (`git checkout 991229f -- apps/extension/src/layer2/github.ts` +
 * the other 4 files changed in that commit) and running
 * `npx vitest run apps/extension/src/layer2/github.test.ts --pool=threads`:
 *   × resolves the origin element itself when it is already an eligible field
 *     AssertionError: expected <textarea id="new_comment_field"/> to be
 *     <textarea id="inline-reply" .../> — old code's document-wide fallback picked the
 *     wrong composer instead of resolving the origin.
 *   × resolves upward from the origin via .closest() to the nearest eligible composer
 *     AssertionError: expected <textarea id="new_comment_field"/> to be
 *     <div id="reply-editable" .../> — same wrong-fallback shape.
 *   × does not read document.activeElement or window.getSelection()
 *     AssertionError: expected "get activeElement" to not be called at all, but actually
 *     been called 1 times — old code's dead `activeElement` branch was still present.
 * (3 failed, 11 passed — the 4th new test, "falls through to the candidate selectors
 * when origin.element.isConnected is false", already passed against the old code, since a
 * disconnected/unused origin degrades to the same document-wide fallback either way).
 * Implementation files then restored (`git checkout HEAD -- ...`) and all 14 tests
 * passed again.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { github } from './github';

describe('github adapter — matches()', () => {
  it('returns true for github.com', () => {
    expect(github.matches(new URL('https://github.com/owner/repo/pull/1'))).toBe(true);
  });

  it('returns false for a non-github host', () => {
    expect(github.matches(new URL('https://example.com/owner/repo/pull/1'))).toBe(false);
  });

  it('returns false for a github-like but different host (no throw)', () => {
    expect(github.matches(new URL('https://notgithub.com/owner/repo'))).toBe(false);
  });
});

describe('github adapter — findInput()', () => {
  const NO_ORIGIN = { element: null };

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns the element when a candidate selector matches (#new_comment_field)', () => {
    document.body.innerHTML = '<textarea id="new_comment_field"></textarea>';
    const el = github.findInput(NO_ORIGIN);
    expect(el).not.toBeNull();
    expect(el?.id).toBe('new_comment_field');
  });

  it('returns the element when a candidate selector matches (textarea[name="comment[body]"])', () => {
    document.body.innerHTML = '<textarea name="comment[body]"></textarea>';
    const el = github.findInput(NO_ORIGIN);
    expect(el).not.toBeNull();
    expect((el as HTMLTextAreaElement).name).toBe('comment[body]');
  });

  it('returns null when no candidate selector matches and there is no origin', () => {
    document.body.innerHTML = '<textarea id="unrelated"></textarea>';
    expect(github.findInput(NO_ORIGIN)).toBeNull();
  });

  // ADR-0010/F4-a rule 2 — the adapter resolves upward from the origin element itself
  // (it *is* the eligible field here, a top-level PR comment textarea).
  it('resolves the origin element itself when it is already an eligible field', () => {
    document.body.innerHTML = `
      <textarea id="new_comment_field"></textarea>
      <textarea name="comment[body]" id="inline-reply"></textarea>
    `;
    const inline = document.getElementById('inline-reply') as HTMLTextAreaElement;

    const el = github.findInput({ element: inline });

    expect(el).toBe(inline);
  });

  // ADR-0010/F4-a rule 2 — the adapter may `.closest()` upward from the origin to
  // resolve a composer (e.g. a contenteditable inline reply box the selection started
  // inside of, like a <p> inside the editable root).
  it('resolves upward from the origin via .closest() to the nearest eligible composer', () => {
    document.body.innerHTML = `
      <textarea id="new_comment_field"></textarea>
      <div id="reply-editable" contenteditable="true"><p id="reply-p">reply text</p></div>
    `;
    const editable = document.getElementById('reply-editable') as HTMLElement;
    // jsdom does not implement `isContentEditable` (verified against jsdom directly), so
    // the fixture must set it explicitly to simulate what a real element reports.
    Object.defineProperty(editable, 'isContentEditable', { value: true, configurable: true });
    const originP = document.getElementById('reply-p') as HTMLElement;

    const el = github.findInput({ element: originP });

    expect(el).toBe(editable);
  });

  // ADR-0010/F4-a rule 1 — mouseup(capture) and the Insert click can be separated in
  // time by a host-page re-render (common on Slack/Gmail, and possible on GitHub too);
  // a detached origin node must not be used and must fall through to the candidate
  // selectors instead.
  it('falls through to the candidate selectors when origin.element.isConnected is false', () => {
    document.body.innerHTML = '<textarea id="new_comment_field"></textarea>';
    const detached = document.createElement('textarea');
    detached.id = 'detached-origin';
    expect(detached.isConnected).toBe(false);

    const el = github.findInput({ element: detached });

    expect(el).not.toBe(detached);
    expect(el?.id).toBe('new_comment_field');
  });

  // ADR-0010/F4-a rules 3/5 — findInput() must not read document.activeElement or call
  // window.getSelection() (those were the two branches proven dead by reviewer trace,
  // ADR-0010 Context), and must declare the origin parameter.
  it('does not read document.activeElement or window.getSelection()', () => {
    document.body.innerHTML = '<textarea id="new_comment_field"></textarea>';
    const activeElementSpy = vi.spyOn(document, 'activeElement', 'get');
    const getSelectionSpy = vi.spyOn(window, 'getSelection');

    github.findInput({ element: null });

    expect(activeElementSpy).not.toHaveBeenCalled();
    expect(getSelectionSpy).not.toHaveBeenCalled();

    activeElementSpy.mockRestore();
    getSelectionSpy.mockRestore();
  });
});

describe('github adapter — insert()', () => {
  it('sets the value, fires an input event, and returns true on a normal textarea', () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    const handler = vi.fn();
    textarea.addEventListener('input', handler);

    const result = github.insert(textarea, 'approved text');

    expect(result).toBe(true);
    expect(textarea.value).toBe('approved text');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('returns false (not throw) when the element cannot accept insertion', () => {
    const div = document.createElement('div'); // not a textarea/input, not contenteditable
    expect(() => github.insert(div, 'text')).not.toThrow();
    expect(github.insert(div, 'text')).toBe(false);
  });

  // MJ-2 — React installs an own-property "value" descriptor on the DOM node itself (a
  // value tracker) that shadows the prototype's native accessor. Plain `el.value = text`
  // hits that instance-level shadow, not the native setter — so React's underlying DOM
  // value never actually changes and the later `input` event looks like a no-op to React.
  // insert() must fetch and invoke the *prototype's* native setter directly to bypass any
  // such instance-level shadow.
  it('updates the underlying native value even when a React-style tracker shadows the instance property', () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    const nativeDescriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!;

    // Simulate React's value tracker: an own-property on this specific element that
    // intercepts plain assignment and deliberately does NOT forward to the native setter.
    Object.defineProperty(textarea, 'value', {
      configurable: true,
      get() {
        return nativeDescriptor.get!.call(textarea);
      },
      set() {
        // swallow the write — this is what makes plain `el.value = text` fail silently
        // against React-controlled inputs.
      },
    });

    try {
      const result = github.insert(textarea, 'approved text');

      expect(result).toBe(true);
      // Read via the native getter directly, since `textarea.value` would go through the
      // shadowed instance getter too (which happens to delegate to native here for the
      // assertion to be meaningful either way).
      expect(nativeDescriptor.get!.call(textarea)).toBe('approved text');
    } finally {
      delete (textarea as unknown as Record<string, unknown>).value;
    }
  });
});

describe('github adapter — AC-040 (never auto-submit)', () => {
  it('never calls .click(), .submit(), or .requestSubmit() on any element', () => {
    document.body.innerHTML = '<textarea id="new_comment_field"></textarea>';
    const textarea = document.getElementById('new_comment_field') as HTMLTextAreaElement;

    const clickSpy = vi.spyOn(HTMLElement.prototype, 'click');
    const submitSpy = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {});
    const requestSubmitSpy = vi
      .spyOn(HTMLFormElement.prototype, 'requestSubmit')
      .mockImplementation(() => {});

    github.matches(new URL('https://github.com/owner/repo/pull/1'));
    github.findInput({ element: null });
    github.insert(textarea, 'approved text');

    expect(clickSpy).not.toHaveBeenCalled();
    expect(submitSpy).not.toHaveBeenCalled();
    expect(requestSubmitSpy).not.toHaveBeenCalled();

    clickSpy.mockRestore();
    submitSpy.mockRestore();
    requestSubmitSpy.mockRestore();
  });
});
