// @vitest-environment jsdom
/**
 * slack.ts 단위 테스트 — T47(AC-042, AC-040). `github.test.ts` 구조를 그대로 따른다.
 * `findInput()` 선택자·`insert()`의 `execCommand` 경로는 추정(라이브 미검증)이므로
 * 실제 DOM 대신 손으로 만든 fixture와 mock으로 로직만 검증한다.
 *
 * 🔴 이 테스트는 red(구현 전) → green(구현 후) 순서로 작성됐다 — `docs/GitWorkflow.md` 요구.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { slack } from './slack';

// jsdom does not implement `document.execCommand` at all (verified directly against this
// project's jsdom version — `vi.spyOn` requires the property to already exist on the
// object). Define a no-op stub once so `vi.spyOn(document, 'execCommand')` below can
// intercept it; each test still overrides the return value/throw behavior it needs.
if (!('execCommand' in document)) {
  Object.defineProperty(document, 'execCommand', {
    value: () => true,
    writable: true,
    configurable: true,
  });
}

describe('slack adapter — matches()', () => {
  it('returns true for app.slack.com', () => {
    expect(slack.matches(new URL('https://app.slack.com/client/T000/C000'))).toBe(true);
  });

  it('returns false for a non-slack host', () => {
    expect(slack.matches(new URL('https://example.com/client/T000/C000'))).toBe(false);
  });

  it('returns false for a slack-like but different host (no throw)', () => {
    expect(slack.matches(new URL('https://notslack.com'))).toBe(false);
  });
});

describe('slack adapter — findInput()', () => {
  const NO_ORIGIN = { element: null };

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  function markEditable(el: HTMLElement) {
    // jsdom does not implement `isContentEditable`, so fixtures must set it explicitly.
    Object.defineProperty(el, 'isContentEditable', { value: true, configurable: true });
  }

  it('returns the element when a candidate selector matches (data-qa="message_input")', () => {
    document.body.innerHTML =
      '<div data-qa="message_input"><div contenteditable="true" id="composer"></div></div>';
    const composer = document.getElementById('composer') as HTMLElement;
    markEditable(composer);

    const el = slack.findInput(NO_ORIGIN);

    expect(el).toBe(composer);
  });

  it('returns the element when a candidate selector matches (.ql-editor[contenteditable])', () => {
    document.body.innerHTML = '<div class="ql-editor" contenteditable="true" id="ql"></div>';
    const ql = document.getElementById('ql') as HTMLElement;
    markEditable(ql);

    const el = slack.findInput(NO_ORIGIN);

    expect(el).toBe(ql);
  });

  it('returns null when no candidate selector matches and there is no origin', () => {
    document.body.innerHTML = '<div id="unrelated"></div>';
    expect(slack.findInput(NO_ORIGIN)).toBeNull();
  });

  // ADR-0010/F4-a rule 2 — resolve the origin element itself when it is already eligible.
  it('resolves the origin element itself when it is already an eligible contenteditable field', () => {
    document.body.innerHTML = `
      <div class="ql-editor" contenteditable="true" id="ql-main"></div>
      <div aria-label="Message" contenteditable="true" id="thread-reply"></div>
    `;
    const threadReply = document.getElementById('thread-reply') as HTMLElement;
    markEditable(threadReply);

    const el = slack.findInput({ element: threadReply });

    expect(el).toBe(threadReply);
  });

  // ADR-0010/F4-a rule 2 — resolve upward from the origin via .closest() to the nearest
  // eligible composer (e.g. a <p> the selection started inside of).
  it('resolves upward from the origin via .closest() to the nearest eligible composer', () => {
    document.body.innerHTML = `
      <div class="ql-editor" contenteditable="true" id="ql-main"></div>
      <div data-qa="message_input"><div contenteditable="true" id="reply-editable"><p id="reply-p">reply text</p></div></div>
    `;
    const editable = document.getElementById('reply-editable') as HTMLElement;
    markEditable(editable);
    const originP = document.getElementById('reply-p') as HTMLElement;

    const el = slack.findInput({ element: originP });

    expect(el).toBe(editable);
  });

  // ADR-0010/F4-a rule 1 — a detached origin must not be used; fall through to candidates.
  it('falls through to the candidate selectors when origin.element.isConnected is false', () => {
    document.body.innerHTML = '<div class="ql-editor" contenteditable="true" id="ql"></div>';
    const ql = document.getElementById('ql') as HTMLElement;
    markEditable(ql);
    const detached = document.createElement('div');
    detached.id = 'detached-origin';
    expect(detached.isConnected).toBe(false);

    const el = slack.findInput({ element: detached });

    expect(el).not.toBe(detached);
    expect(el?.id).toBe('ql');
  });

  // ADR-0010/F4-a rules 3/5 — findInput() must not read document.activeElement or call
  // window.getSelection().
  it('does not read document.activeElement or window.getSelection()', () => {
    document.body.innerHTML = '<div class="ql-editor" contenteditable="true" id="ql"></div>';
    const ql = document.getElementById('ql') as HTMLElement;
    markEditable(ql);
    const activeElementSpy = vi.spyOn(document, 'activeElement', 'get');
    const getSelectionSpy = vi.spyOn(window, 'getSelection');

    slack.findInput({ element: null });

    expect(activeElementSpy).not.toHaveBeenCalled();
    expect(getSelectionSpy).not.toHaveBeenCalled();

    activeElementSpy.mockRestore();
    getSelectionSpy.mockRestore();
  });
});

describe('slack adapter — insert()', () => {
  let editor: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    Object.defineProperty(editor, 'isContentEditable', { value: true, configurable: true });
    document.body.appendChild(editor);
  });

  it('focuses the element and inserts text via document.execCommand("insertText", false, text)', () => {
    const focusSpy = vi.spyOn(editor, 'focus');
    const execCommandSpy = vi.spyOn(document, 'execCommand').mockReturnValue(true);

    const result = slack.insert(editor, 'approved text');

    expect(result).toBe(true);
    expect(focusSpy).toHaveBeenCalled();
    expect(execCommandSpy).toHaveBeenCalledWith('insertText', false, 'approved text');

    execCommandSpy.mockRestore();
  });

  it('falls back to textContent + dispatched InputEvent when execCommand returns false', () => {
    const execCommandSpy = vi.spyOn(document, 'execCommand').mockReturnValue(false);
    const handler = vi.fn();
    editor.addEventListener('input', handler);

    const result = slack.insert(editor, 'fallback text');

    expect(result).toBe(true);
    expect(editor.textContent).toBe('fallback text');
    expect(handler).toHaveBeenCalledTimes(1);

    execCommandSpy.mockRestore();
  });

  it('falls back to textContent + dispatched InputEvent when execCommand throws', () => {
    const execCommandSpy = vi.spyOn(document, 'execCommand').mockImplementation(() => {
      throw new Error('execCommand not supported');
    });
    const handler = vi.fn();
    editor.addEventListener('input', handler);

    const result = slack.insert(editor, 'fallback text 2');

    expect(result).toBe(true);
    expect(editor.textContent).toBe('fallback text 2');
    expect(handler).toHaveBeenCalledTimes(1);

    execCommandSpy.mockRestore();
  });

  it('returns false (not throw) when insertion fails entirely', () => {
    const execCommandSpy = vi.spyOn(document, 'execCommand').mockImplementation(() => {
      throw new Error('execCommand not supported');
    });
    const focusSpy = vi.spyOn(editor, 'focus').mockImplementation(() => {
      throw new Error('cannot focus');
    });

    expect(() => slack.insert(editor, 'text')).not.toThrow();
    expect(slack.insert(editor, 'text')).toBe(false);

    execCommandSpy.mockRestore();
    focusSpy.mockRestore();
  });

  it('returns false (not throw) when the element cannot accept insertion', () => {
    const div = document.createElement('div'); // not contenteditable
    expect(() => slack.insert(div, 'text')).not.toThrow();
    expect(slack.insert(div, 'text')).toBe(false);
  });
});

describe('slack adapter — AC-040 (never auto-submit)', () => {
  it('never calls .click(), .submit(), or .requestSubmit() on any element', () => {
    document.body.innerHTML = '<div class="ql-editor" contenteditable="true" id="ql"></div>';
    const ql = document.getElementById('ql') as HTMLElement;
    Object.defineProperty(ql, 'isContentEditable', { value: true, configurable: true });

    const clickSpy = vi.spyOn(HTMLElement.prototype, 'click');
    const submitSpy = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {});
    const requestSubmitSpy = vi
      .spyOn(HTMLFormElement.prototype, 'requestSubmit')
      .mockImplementation(() => {});
    const execCommandSpy = vi.spyOn(document, 'execCommand').mockReturnValue(true);

    slack.matches(new URL('https://app.slack.com/client/T000/C000'));
    slack.findInput({ element: null });
    slack.insert(ql, 'approved text');

    expect(clickSpy).not.toHaveBeenCalled();
    expect(submitSpy).not.toHaveBeenCalled();
    expect(requestSubmitSpy).not.toHaveBeenCalled();

    clickSpy.mockRestore();
    submitSpy.mockRestore();
    requestSubmitSpy.mockRestore();
    execCommandSpy.mockRestore();
  });
});
