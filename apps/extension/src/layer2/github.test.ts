// @vitest-environment jsdom
/**
 * github.ts 단위 테스트 — T29(AC-021, AC-040).
 * `findInput()` 선택자는 추정(라이브 미검증)이므로 실제 DOM 대신 손으로 만든 fixture로
 * 선택자 매칭·이벤트 디스패치 로직만 검증한다.
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
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns the element when a candidate selector matches (#new_comment_field)', () => {
    document.body.innerHTML = '<textarea id="new_comment_field"></textarea>';
    const el = github.findInput();
    expect(el).not.toBeNull();
    expect(el?.id).toBe('new_comment_field');
  });

  it('returns the element when a candidate selector matches (textarea[name="comment[body]"])', () => {
    document.body.innerHTML = '<textarea name="comment[body]"></textarea>';
    const el = github.findInput();
    expect(el).not.toBeNull();
    expect((el as HTMLTextAreaElement).name).toBe('comment[body]');
  });

  it('returns null when no candidate selector matches', () => {
    document.body.innerHTML = '<textarea id="unrelated"></textarea>';
    expect(github.findInput()).toBeNull();
  });

  // MJ-1 — a PR page can have multiple comment textareas (main box + inline review
  // reply boxes). document-wide first-match must not silently win over the field the
  // user actually focused. docs/UX.md:187 (UF-011 step 6) requires "the originating field".
  it('prefers the focused element over first-match candidate selector', () => {
    document.body.innerHTML = `
      <textarea id="new_comment_field"></textarea>
      <textarea name="comment[body]" id="inline-reply"></textarea>
    `;
    const inline = document.getElementById('inline-reply') as HTMLTextAreaElement;
    inline.focus();

    const el = github.findInput();

    expect(el).toBe(inline);
  });

  // MJ-1 — when nothing is focused, fall back to resolving the selection's anchor
  // ancestor (e.g. a contenteditable inline reply box) before the candidate-selector list.
  it('falls back to the selection anchor ancestor when nothing is focused', () => {
    document.body.innerHTML = `
      <textarea id="new_comment_field"></textarea>
      <div id="reply-editable" contenteditable="true"><p>reply text</p></div>
    `;
    const editable = document.getElementById('reply-editable') as HTMLElement;
    // jsdom does not implement `isContentEditable` (it stays `undefined` regardless of the
    // `contenteditable` attribute — verified against jsdom directly), so the fixture must
    // set it explicitly to simulate what a real contenteditable element reports.
    Object.defineProperty(editable, 'isContentEditable', { value: true, configurable: true });
    const textNode = editable.querySelector('p')!.firstChild!;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 4);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    const el = github.findInput();

    expect(el).toBe(editable);
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
    github.findInput();
    github.insert(textarea, 'approved text');

    expect(clickSpy).not.toHaveBeenCalled();
    expect(submitSpy).not.toHaveBeenCalled();
    expect(requestSubmitSpy).not.toHaveBeenCalled();

    clickSpy.mockRestore();
    submitSpy.mockRestore();
    requestSubmitSpy.mockRestore();
  });
});
