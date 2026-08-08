/**
 * `docs/UX.md:920` "Fallback/cached response indicator" — "폴백 응답 사용 중" 배지 문구.
 * `apps/web/lib/non-live-notice.ts`와 값이 동일해야 한다(AC-041, 화면마다 문구가 다르면 위반).
 *
 * 🔴 그 파일을 import하지 않고 문자열을 이 파일에 복제한 이유 — `apps/web`은 별도로 배포되는
 * Next.js 앱이고, `apps/extension`이 공유해도 되는 유일한 워크스페이스 경계는
 * `packages/core`(AC-028, `docs/CodingRules.md` Directory Rules)뿐이다. 앱 간(`apps/extension` →
 * `apps/web`) 직접 import는 이 리포의 의존 방향 어디에도 없다 — 두 앱의 배포·빌드 파이프라인이
 * 갈리면 상대 워크스페이스의 상대경로 import가 조용히 깨질 수 있다. 문구를 바꿀 때는 두 파일
 * 모두 갱신해야 하며, 갈리면 이 주석을 근거로 리뷰에서 잡을 수 있게 남겨둔다.
 */
export const NON_LIVE_NOTICE = '폴백 응답 사용 중';
