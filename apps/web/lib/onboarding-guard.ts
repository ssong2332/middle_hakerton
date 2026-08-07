/**
 * T73④ — `docs/UX.md:899` "Direct URL access" v2.7/AC-059 구현: 인증된 사용자가 온보딩을
 * 완료하지도 건너뛰지도 않은 상태(`profiles.onboarding_state === 'not_started'`)로 `/onboarding`
 * 외의 URL에 접근하면 UX-003으로 강제 리다이렉트한다(한 번만).
 *
 * 🔴 **구현 위치 판단** — `apps/web/proxy.ts:96~99`가 인용한 Next.js "Optimistic checks with
 * Proxy"(프록시에서 DB 조회 금지) 규칙 때문에 이 판정을 프록시에 넣지 않는다. 대신 이 함수를
 * `apps/web/app/(app)/(with-nav)/layout.tsx`(async Server Component)에서만 호출한다 — Server
 * Component/Data Access Layer에서 실제 DB 기반 인가를 확인하는 것은 Next.js 공식 문서가 프록시의
 * 낙관적 확인과 분리해서 두라고 권장하는 것과 같은 층 분리다(`node_modules/next/dist/docs/
 * 01-app/02-guides/authentication.md`) — 프록시 규칙과 충돌하지 않는다.
 *
 * 🔴 **루프 방지(ⓒ)는 이 함수가 아니라 라우트 구조로 보장된다** — `(app)/onboarding`(UX-003)은
 * 이 함수를 호출하는 레이아웃이 속한 `(app)/(with-nav)` 그룹의 형제이며 그 레이아웃을 상속하지
 * 않는다(`apps/web/app/(app)/onboarding/route-composition.test.ts`). 그래서 `/onboarding` 요청은
 * 이 함수를 애초에 거치지 않는다.
 *
 * 🔴 **`/api/*`는 대상이 아니다(ⓓ)** — Next.js 레이아웃은 Route Handler(`app/api/**`)에 적용되지
 * 않으므로 API 경로는 구조적으로 이 함수의 영향 밖이다. `apps/web/proxy.ts`의 matcher(`/api` 제외)
 * 도 그대로 유지된다.
 */
import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';
import { fetchSenderProfile } from './profile/storage';

export async function enforceOnboardingRedirect(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // 방어적 no-op — `apps/web/proxy.ts`가 이미 미인증 요청을 `/login`으로 보냈으므로 이 레이아웃에
  // 도달한 요청은 항상 인증돼 있어야 한다. 그래도 삼키지 않고 그냥 통과시킨다(리다이렉트 대상이
  // 아니다).
  if (!user) return;

  const profile = await fetchSenderProfile(supabase, user.id);
  if (profile.onboardingState === 'not_started') {
    redirect('/onboarding');
  }
}
