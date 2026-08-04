/**
 * AC-060 판정 방법 그대로: ① 7자 이하 거부(사유 표시) ② 8자 허용 ③ 복잡도 없이 소문자만 8자
 * (`aaaaaaaa`)도 통과 — 세 케이스를 실행 출력으로 남긴다.
 */
import { describe, expect, it } from 'vitest';
import { MIN_PASSWORD_LENGTH, passwordLengthError } from './validate-password';

describe('passwordLengthError — AC-060 앱 레벨 최소 길이 검증', () => {
  it('AC-060① 7자 이하 비밀번호는 사유와 함께 거부된다', () => {
    expect(passwordLengthError('1234567')).toBe('비밀번호는 8자 이상이어야 합니다');
  });

  it('AC-060② 8자 비밀번호는 허용된다(null 반환)', () => {
    expect(passwordLengthError('12345678')).toBeNull();
  });

  it('AC-060③ 대소문자·숫자·특수문자 조합 없이 소문자만 8자(aaaaaaaa)여도 통과한다', () => {
    expect(passwordLengthError('aaaaaaaa')).toBeNull();
  });

  it('MIN_PASSWORD_LENGTH는 8이다', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
  });
});
