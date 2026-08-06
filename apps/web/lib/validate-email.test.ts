import { describe, expect, it } from 'vitest';
import { isValidEmailFormat } from './validate-email';

describe('isValidEmailFormat', () => {
  it('user@example.com 형식은 유효하다', () => {
    expect(isValidEmailFormat('user@example.com')).toBe(true);
  });

  it('@가 없으면 무효하다', () => {
    expect(isValidEmailFormat('userexample.com')).toBe(false);
  });

  it('빈 문자열은 무효하다', () => {
    expect(isValidEmailFormat('')).toBe(false);
  });

  it('도메인에 점이 없으면 무효하다', () => {
    expect(isValidEmailFormat('user@example')).toBe(false);
  });
});
