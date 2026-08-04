import type { ReactNode } from 'react';
import { LogoutButton } from '../../../components/LogoutButton';

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
 * 🔴 `docs/UX.md`가 요구하는 전체 상시 내비게이션(Mediate|Profile|Terminology|...)은 여전히 이
 * 태스크(T45/T46)의 범위가 아니다 — 그 항목들이 가리키는 화면 대부분이 아직 스캐폴드 단계다.
 * 여기서는 T45/T46이 명시적으로 요구한 "레이아웃의 로그아웃 버튼" 배선만 최소로 추가한다.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <LogoutButton />
      {children}
    </>
  );
}
