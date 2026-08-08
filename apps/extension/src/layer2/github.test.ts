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
