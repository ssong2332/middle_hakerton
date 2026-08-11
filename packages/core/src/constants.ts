// 여러 파일이 참조하는 전역 상수 — 값 변경 비용을 1곳으로 격리한다(`limits.ts`의 AC-061
// 상수와 같은 원칙, 별도 파일인 이유는 이 파일이 도메인 전역이고 `limits.ts`는 입력 길이
// 전용이기 때문).

// AC-044②/Planning Decision #60(PRD OQ#20 resolved) — 침묵 감지 리마인드 제안 임계값.
// `docs/API.md` "GET /api/messages" Response 절: "reminderSuggested = businessDaysElapsed >= 2
// (Planning Decision #60, 상수는 packages/core/src/constants.ts 1곳)". 설정 화면은 만들지
// 않는다(`docs/Tasks.md` T51 원문).
export const REMINDER_THRESHOLD_BUSINESS_DAYS = 2;

// AC-077 — #34 수신자 정보 보강, 표본 임계값 2개(서로 다른 상수, 하나로 대신하지 않는다).
// `docs/PRD.md` AC-077①: "각각 코드 1곳에 격리되어 있다(두 이름을 코드 검색으로 확인)".
//
// 🔴 T64 스파이크 실측(2026-08-11, GitHub 공개 프로필 3건, `per_page=100` 기준) — planner의
// 잠정값 30(AC-077②)은 미검증이었다. 실측 결과:
// - 전체 활동 이벤트(시간대 산출 표본): 100/100/0건 — 활동 계정 2곳은 30 이상 쉽게 도달, 비활성
//   계정 1곳은 0건(정상적인 "표본 부족" 상태이지 오류가 아니다).
// - 코멘트류 이벤트(스타일 제안 표본, IssueComment/PullRequestReviewComment 등): 11/15/0건 —
//   활동 계정 두 곳 모두 30에 도달하지 못했다. 전체 이벤트 중 코멘트가 차지하는 비중 자체가
//   낮아(대부분 PushEvent) 30을 유지하면 사실상 이 기능이 거의 항상 비활성화된다.
// 사용자 결정(2026-08-11): 활동 시간대는 30 유지(도달 가능이 실측으로 확인됨), 스타일 제안은
// 10으로 하향(실측 표본 규모에 맞춤). n=3의 작은 표본이라 향후 실사용자 데이터로 재조정될 수
// 있다 — 그때는 이 값만 바꾸면 된다(AC-077③, 한쪽 변경이 다른 쪽에 영향 없음).

/** AC-071② — 활동 시간대 분포 산출에 필요한 최소 표본 수. 미달이면 `activityHourHistogram: null`. */
export const ACTIVITY_HOUR_SAMPLE_THRESHOLD = 30;

/** AC-073⑤ — 협업 스타일 제안(단계 2) 게이트에 필요한 최소 표본 수. 미달이면 "표본 부족으로
 * 제안하지 않음"(AC-073). T64는 이 상수를 정의만 하고 소비하지 않는다 — 실제 게이트는 스타일
 * 제안 라우트(T68, `POST /api/enrichment/suggest`)의 몫이다. */
export const STYLE_SUGGESTION_SAMPLE_THRESHOLD = 10;
