/**
 * Minor(사용자 지시 유지보수 라운드) — `docs/UX.md:920` "Fallback/cached response indicator"
 * 문구. `UrgencyPanel.tsx`·`ComparisonView.tsx`·`BackTranslationPreview.tsx` 세 컴포넌트가
 * 각자 리터럴로 선언하고 있던 것을 이 파일 한 곳으로 모은다(`docs/CodingRules.md` 상수 격리
 * 정신과 같은 이유 — 값이 여러 곳에 흩어져 있으면 문구를 바꿀 때 한 곳을 빠뜨리기 쉽다).
 */
export const NON_LIVE_NOTICE = '폴백 응답 사용 중';
