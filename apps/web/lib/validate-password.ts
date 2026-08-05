/**
 * AC-060 앱 레벨 비밀번호 최소 길이 검증 — ADR-0002 Follow-up 1의 대안 경로.
 *
 * Supabase 대시보드 Auth 설정(최소 길이 8·문자 요구사항 끔)을 이번 세션에서 확인·변경할 수
 * 없었다(오케스트레이터 measured: Supabase MCP에 auth 설정을 바꾸는 도구가 없고, 대시보드 UI
 * 접근 권한이 없음). ADR-0002가 이미 승인해 둔 대체 경로를 그대로 쓴다: **앱 레벨에 최소 길이
 * 검증 1줄만 추가**하고, 그 이상의 복잡도 규칙(대소문자·숫자·특수문자 조합)은 **절대 추가하지
 * 않는다**(AC-060③, `docs/PRD.md` Planning Decision #86).
 *
 * 대시보드의 실제 최소 길이 설정 자체는 여전히 미확인(추정)이다 — 이 파일은 그것과 무관하게
 * 독립적으로 8자 미만을 막는다.
 */
export const MIN_PASSWORD_LENGTH = 8;

/** 비밀번호가 8자 미만이면 화면에 표시할 사유 문자열을, 그렇지 않으면 `null`을 반환한다. */
export function passwordLengthError(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return '비밀번호는 8자 이상이어야 합니다';
  }
  return null;
}
