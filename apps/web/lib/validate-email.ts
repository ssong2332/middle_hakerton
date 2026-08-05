/**
 * UX-001/UX-002 공통 이메일 형식 검증 — 두 화면이 "기본 이메일 형식" 조건을 동일 정규식으로
 * 판정하도록 한 곳에서 정의한다(중복 방지).
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmailFormat(email: string): boolean {
  return EMAIL_PATTERN.test(email);
}
