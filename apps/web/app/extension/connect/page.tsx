// 확장 토큰 인계 — `docs/Architecture.md` "확장 인증" 절. 🔴 T2 스캐폴드 플레이스홀더. 실제 로직은 T56이 채운다.
//
// 🔴 M-3(reviewer, T73 handoff) — 이 페이지는 `apps/web/proxy.ts`의 보호 matcher 안에 있어
// 인증은 필요하지만(미인증이면 proxy가 이미 `/login`으로 보낸다), 의도적으로 `(app)/(with-nav)`
// 그룹 밖에 있다 — 그래서 `enforceOnboardingRedirect()`(`apps/web/lib/onboarding-guard.ts`, T73④)를
// 거치지 않는다. `docs/UX.md:899`의 "온보딩 미완료 계정은 /onboarding 외 모든 URL에서 강제
// 리다이렉트"는 UX.md의 인증 화면 라우트 목록(`docs/UX.md:892`)을 대상으로 하며, 이 페이지는 그
// 목록에 없다 — Chrome 확장을 이 웹앱 계정에 "연결"하는 별도의 토큰 인계 화면이지 UX.md가 나열한
// 인증 화면 중 하나가 아니다. **의도적 예외로 남긴다**(우회 발견이 아니라 결정): 확장 연결은
// 사용자가 자기 커뮤니케이션 스타일을 아직 설정하지 않았어도(= 온보딩 미완료) 막을 이유가 없는
// 별개 플로우다 — 확장의 개인화 관련 동의/고지는 UX-017(Privacy Notice)이 별도로 담당하고,
// 온보딩 미완료는 UX-004 등 웹앱 화면에서만 "개인화 꺼짐" 표시로 이어질 뿐 확장 연결 자체를
// 막을 근거가 아니다(`docs/UX.md:926` Personalization-off indicator).
// T56 담당자에게: 이 페이지에 실제 로직(토큰 postMessage 등)을 채울 때도 이 예외를 유지한다 —
// 새로 온보딩 가드를 추가하려면 그 전에 이 판단을 재검토하고 근거를 갱신해야 한다.
//
// 🔴 T56 — 실제 로직(`useEffect`, `chrome.runtime.sendMessage` 등)은 `ExtensionConnect.tsx`(클라
// 이언트 컴포넌트)에 있다. `useSearchParams()`를 쓰는 `LoginForm`과 달리 Suspense 경계가 필요
// 없어(쿼리 파라미터를 읽지 않는다) 이 파일은 얇은 서버 컴포넌트 래퍼로 남긴다.
import { ExtensionConnect } from './ExtensionConnect';

export default function ExtensionConnectPage() {
  return <ExtensionConnect />;
}
