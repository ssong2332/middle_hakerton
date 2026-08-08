// @vitest-environment jsdom
/**
 * gmail.ts 단위 테스트 — T49(AC-051, AC-040).
 * `findInput()` 선택자·`insert()` 삽입 메커니즘 모두 추정(라이브 미검증)이므로 실제 DOM
 * 대신 손으로 만든 fixture로 선택자 매칭·삽입 로직만 검증한다. 구조는 T29(`github.test.ts`)를
 * 그대로 따른다.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { gmail } from './gmail';

describe('gmail adapter — matches()', () => {
  it('returns true for mail.google.com', () => {
    expect(gmail.matches(new URL('https://mail.google.com/mail/u/0/#inbox'))).toBe(true);
  });

  it('returns false for a non-gmail host', () => {
    expect(gmail.matches(new URL('https://example.com/mail'))).toBe(false);
  });

  it('returns false for a gmail-like but different host (no throw)', () => {
    expect(gmail.matches(new URL('https://notmail.google.com'))).toBe(false);
  });
});

describe('gmail adapter — findInput()', () => {
  const NO_ORIGIN = { element: null };

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns the element when a candidate selector matches (aria-label="Message Body")', () => {
    document.body.innerHTML =
      '<div aria-label="Message Body" contenteditable="true"></div>';
    const el = document.querySelector('div') as HTMLElement;
    Object.defineProperty(el, 'isContentEditable', { value: true, configurable: true });

    const found = gmail.findInput(NO_ORIGIN);

    expect(found).not.toBeNull();
    expect(found?.getAttribute('aria-label')).toBe('Message Body');
  });

  it('returns the element when a candidate selector matches (div.Am.Al.editable)', () => {
    document.body.innerHTML = '<div class="Am Al editable" contenteditable="true"></div>';
    const el = document.querySelector('div') as HTMLElement;
    Object.defineProperty(el, 'isContentEditable', { value: true, configurable: true });

    const found = gmail.findInput(NO_ORIGIN);

    expect(found).not.toBeNull();
    expect(found).toBe(el);
  });

  it('returns the element when a candidate selector matches (div[g_editable="true"])', () => {
    document.body.innerHTML = '<div g_editable="true" contenteditable="true"></div>';
    const el = document.querySelector('div') as HTMLElement;
    Object.defineProperty(el, 'isContentEditable', { value: true, configurable: true });

    const found = gmail.findInput(NO_ORIGIN);

    expect(found).not.toBeNull();
    expect(found).toBe(el);
  });

  it('returns null when no candidate selector matches and there is no origin', () => {
    document.body.innerHTML = '<div id="unrelated"></div>';
    expect(gmail.findInput(NO_ORIGIN)).toBeNull();
  });

  // ADR-0010/F4-a rule 2 — resolves the origin element itself when it is already an
  // eligible field. Gmail can have multiple compose windows open at once, so this
  // matters even more here than for GitHub.
  it('resolves the origin element itself when it is already an eligible contenteditable field', () => {
    document.body.innerHTML = `
      <div aria-label="Message Body" contenteditable="true" id="compose-1"></div>
      <div aria-label="Message Body" contenteditable="true" id="compose-2"></div>
    `;
    const compose1 = document.getElementById('compose-1') as HTMLElement;
    const compose2 = document.getElementById('compose-2') as HTMLElement;
    Object.defineProperty(compose1, 'isContentEditable', { value: true, configurable: true });
    Object.defineProperty(compose2, 'isContentEditable', { value: true, configurable: true });

    const el = gmail.findInput({ element: compose2 });

    expect(el).toBe(compose2);
  });

  // ADR-0010/F4-a rule 2 — resolves upward from the origin via .closest() to the
  // nearest eligible composer (e.g. the selection started inside a child <span> of the
  // contenteditable body).
  it('resolves upward from the origin via .closest() to the nearest eligible composer', () => {
    document.body.innerHTML = `
      <div aria-label="Message Body" contenteditable="true" id="other-compose"></div>
      <div class="Am Al editable" contenteditable="true" id="target-compose"><span id="inner-span">hi</span></div>
    `;
    const target = document.getElementById('target-compose') as HTMLElement;
    Object.defineProperty(target, 'isContentEditable', { value: true, configurable: true });
    const innerSpan = document.getElementById('inner-span') as HTMLElement;

    const el = gmail.findInput({ element: innerSpan });

    expect(el).toBe(target);
  });

  // ADR-0010/F4-a rule 1 — a detached origin node must not be used and must fall
  // through to the candidate selectors instead (multi-composer risk flagged by T29
  // reviewer as more severe for Gmail than GitHub).
  it('falls through to the candidate selectors when origin.element.isConnected is false', () => {
    document.body.innerHTML = '<div aria-label="Message Body" contenteditable="true"></div>';
    const el = document.querySelector('div') as HTMLElement;
    Object.defineProperty(el, 'isContentEditable', { value: true, configurable: true });
    const detached = document.createElement('div');
    Object.defineProperty(detached, 'isContentEditable', { value: true, configurable: true });
    expect(detached.isConnected).toBe(false);

    const found = gmail.findInput({ element: detached });

    expect(found).not.toBe(detached);
    expect(found).toBe(el);
  });

  // ADR-0010/F4-a rules 3/5 — findInput() must not read document.activeElement or call
  // window.getSelection().
  it('does not read document.activeElement or window.getSelection()', () => {
    document.body.innerHTML = '<div aria-label="Message Body" contenteditable="true"></div>';
    const activeElementSpy = vi.spyOn(document, 'activeElement', 'get');
    const getSelectionSpy = vi.spyOn(window, 'getSelection');

    gmail.findInput({ element: null });

    expect(activeElementSpy).not.toHaveBeenCalled();
    expect(getSelectionSpy).not.toHaveBeenCalled();

    activeElementSpy.mockRestore();
    getSelectionSpy.mockRestore();
  });
});

describe('gmail adapter — insert()', () => {
  function makeComposeDiv(): HTMLElement {
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    Object.defineProperty(div, 'isContentEditable', { value: true, configurable: true });
    document.body.appendChild(div);
    return div;
  }

  // jsdom does not implement document.execCommand at all (not even as a stub that
  // throws "not implemented") — `vi.spyOn(document, 'execCommand')` fails because the
  // property doesn't exist on the object. Assign a fresh vi.fn() directly instead, and
  // delete it again afterward so tests don't leak state into each other.
  const originalExecCommand = (document as unknown as { execCommand?: unknown }).execCommand;

  afterEach(() => {
    if (originalExecCommand === undefined) {
      delete (document as unknown as { execCommand?: unknown }).execCommand;
    } else {
      (document as unknown as { execCommand: unknown }).execCommand = originalExecCommand;
    }
  });

  it('focuses the element, selects existing content, and inserts via execCommand("insertText")', () => {
    const div = makeComposeDiv();
    div.textContent = 'existing draft';
    const focusSpy = vi.spyOn(div, 'focus');
    const execCommandMock = vi.fn((command: string) => {
      expect(['selectAll', 'insertText']).toContain(command);
      return true;
    });
    (document as unknown as { execCommand: unknown }).execCommand = execCommandMock;

    const result = gmail.insert(div, 'approved text');

    expect(result).toBe(true);
    expect(focusSpy).toHaveBeenCalled();
    expect(execCommandMock).toHaveBeenCalledWith('insertText', false, 'approved text');
  });

  it('falls back to manual textContent + InputEvent when execCommand returns false', () => {
    const div = makeComposeDiv();
    const inputHandler = vi.fn();
    div.addEventListener('input', inputHandler);
    (document as unknown as { execCommand: unknown }).execCommand = vi.fn().mockReturnValue(false);

    const result = gmail.insert(div, 'fallback text');

    expect(result).toBe(true);
    expect(div.textContent).toBe('fallback text');
    expect(inputHandler).toHaveBeenCalledTimes(1);
  });

  it('falls back to manual textContent + InputEvent when execCommand throws', () => {
    const div = makeComposeDiv();
    const inputHandler = vi.fn();
    div.addEventListener('input', inputHandler);
    (document as unknown as { execCommand: unknown }).execCommand = vi.fn(() => {
      throw new Error('execCommand unsupported');
    });

    const result = gmail.insert(div, 'fallback text 2');

    expect(result).toBe(true);
    expect(div.textContent).toBe('fallback text 2');
    expect(inputHandler).toHaveBeenCalledTimes(1);
  });

  it('returns false (not throw) when the element cannot accept insertion', () => {
    const div = document.createElement('div'); // not contenteditable
    expect(() => gmail.insert(div, 'text')).not.toThrow();
    expect(gmail.insert(div, 'text')).toBe(false);
  });

  it('returns false when focus() throws', () => {
    const div = makeComposeDiv();
    vi.spyOn(div, 'focus').mockImplementation(() => {
      throw new Error('cannot focus');
    });

    expect(gmail.insert(div, 'text')).toBe(false);
  });
});

describe('gmail adapter — AC-040 (never auto-submit)', () => {
  it('never calls .click(), .submit(), or .requestSubmit() on any element', () => {
    document.body.innerHTML = '<div aria-label="Message Body" contenteditable="true"></div>';
    const div = document.querySelector('div') as HTMLElement;
    Object.defineProperty(div, 'isContentEditable', { value: true, configurable: true });

    const clickSpy = vi.spyOn(HTMLElement.prototype, 'click');
    const submitSpy = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {});
    const requestSubmitSpy = vi
      .spyOn(HTMLFormElement.prototype, 'requestSubmit')
      .mockImplementation(() => {});
    (document as unknown as { execCommand: unknown }).execCommand = vi.fn().mockReturnValue(true);

    gmail.matches(new URL('https://mail.google.com/mail/u/0/#inbox'));
    gmail.findInput({ element: null });
    gmail.insert(div, 'approved text');

    expect(clickSpy).not.toHaveBeenCalled();
    expect(submitSpy).not.toHaveBeenCalled();
    expect(requestSubmitSpy).not.toHaveBeenCalled();

    clickSpy.mockRestore();
    submitSpy.mockRestore();
    requestSubmitSpy.mockRestore();
    delete (document as unknown as { execCommand?: unknown }).execCommand;
  });
});
