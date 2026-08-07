import type { ReactNode } from 'react';
import { PrimaryNav } from '../../../components/PrimaryNav';
import { enforceOnboardingRedirect } from '../../../lib/onboarding-guard';

/**
 * 상시 내비게이션(로그아웃 포함)이 있는 인증된 화면들(`/mediate`, `/profile`, `/terminology`
 * 등)의 공통 레이아웃. Major 5(reviewer REJECTED → 수정) — `LogoutButton`을 루트 레이아웃에서
 * 이리로 옮겼다. `docs/UX.md` Information Architecture "Navigation": 상시 내비게이션은 "present
 * on every **authenticated** screen **except UX-003**"(`docs/UX.md:893`)이다.
 *
 * 🔴 Major 1(reviewer 5차 REJECTED → 수정) — 이 레이아웃은 `(app)` 그룹 바로 아래가 아니라
 * 중첩 그룹 `(app)/(with-nav)`에 있다. `(app)/onboarding`(UX-003)은 이 그룹의 형제이므로 이
 * 레이아웃을 상속하지 않는다 — UX.md가 온보딩을 상시 내비게이션에서 명시적으로 제외하기
 * 때문이다. 라우트 그룹으로 레이아웃 상속 범위를 나누는 것은 Next.js가 문서화한 용례다
 * (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route-groups.md`
 * — "Opting specific route segments into sharing a layout, while keeping others out"). 회귀
 * 테스트: `apps/web/app/(app)/onboarding/route-composition.test.ts`.
 *
 * T73③ — `docs/UX.md:893`가 요구하는 전체 상시 내비게이션(Mediate|Profile|Terminology|...)을
 * `PrimaryNav`(`apps/web/components/PrimaryNav.tsx`)로 배선한다. 항목 목록·미구현 화면 미렌더
 * 규칙(AC-084⑤⑥)은 `PrimaryNav` 자체가 소유한다.
 *
 * T73④ — 이 레이아웃 하위(=`(with-nav)` 그룹, 즉 `/onboarding` 제외 전 인증 화면)에 진입하기
 * 전에 `enforceOnboardingRedirect()`(`apps/web/lib/onboarding-guard.ts`)로 온보딩 미완료 사용자를
 * `/onboarding`으로 강제 리다이렉트한다(`docs/UX.md:899`). `(app)/onboarding`은 이 그룹 밖이라
 * 이 검사를 거치지 않으므로 루프가 생기지 않는다.
 */
/**
 * 🔴 이 레이아웃 하위 화면은 세션 쿠키·`profiles` 조회 결과에 따라 내용이 달라지므로(온보딩
 * 강제 리다이렉트) 정적 프리렌더 대상이 될 수 없다 — `force-dynamic`이 없으면 Next.js가 빌드
 * 타임에 이 레이아웃을 정적 생성하려다 `cookies()`/env 조회 시점에 실패한다(measured: `npm run
 * build`, "Error occurred prerendering page" — 실제 배포 환경에서도 매 요청 세션에 따라 리다이렉트
 * 여부가 달라지므로 애초에 정적일 수 없는 라우트다).
 */
export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  await enforceOnboardingRedirect();
  return (
    <>
      <PrimaryNav />
      {children}
    </>
  );
}
