// 여러 파일이 참조하는 전역 상수 — 값 변경 비용을 1곳으로 격리한다(`limits.ts`의 AC-061
// 상수와 같은 원칙, 별도 파일인 이유는 이 파일이 도메인 전역이고 `limits.ts`는 입력 길이
// 전용이기 때문).

// AC-044②/Planning Decision #60(PRD OQ#20 resolved) — 침묵 감지 리마인드 제안 임계값.
// `docs/API.md` "GET /api/messages" Response 절: "reminderSuggested = businessDaysElapsed >= 2
// (Planning Decision #60, 상수는 packages/core/src/constants.ts 1곳)". 설정 화면은 만들지
// 않는다(`docs/Tasks.md` T51 원문).
export const REMINDER_THRESHOLD_BUSINESS_DAYS = 2;
