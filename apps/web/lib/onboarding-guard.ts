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
 *
 * 🔴 **M-1(reviewer) — fail-open, DB/config 실패로 인증 셸 전체를 죽이지 않는다.** 이 함수는
 * `(with-nav)` 아래 **모든** 인증 화면 진입 시 실행되므로, `createClient()`(env 누락 시 던짐,
 * `apps/web/lib/supabase/server.ts`)나 `fetchSenderProfile()`(PostgREST 에러를 그대로 rethrow,
 * `apps/web/lib/profile/storage.ts`)가 실패하면 `app/(app)/` 아래 `error.tsx`가 없어 Next 기본
 * 에러 화면으로 전체 인증 화면이 죽는다. 온보딩 강제 리다이렉트는 인증 자체와 달리 보안 필수
 * 기능이 아니다(리다이렉트가 안 걸려도 최악의 경우 개인화-꺼짐 표시가 대신 알린다 —
 * `docs/UX.md:926` "Personalization-off indicator", AC-059③) — 이 기능 하나의 일시적 실패로
 * 전체 인증 화면을 못 쓰게 만드는 fail-closed의 대가가 더 크므로 **fail-open**을 택했다: 로그만
 * 남기고(`apps/web/proxy.ts`의 `logProxyAuthError`·`apps/web/lib/supabase/server.ts`의
 * `logSupabaseError`와 같은 형태 — 코드·메시지만, 원문·시크릿 금지) 리다이렉트 없이 통과시킨다.
 * 회귀 테스트: `apps/web/lib/onboarding-guard.test.ts`의 "M-1 —" 케이스들.
 *
 * 🔴 **`redirect()` 호출은 절대 `try` 블록 안에 두지 않는다.** `redirect()`는 `NEXT_REDIRECT`
 * digest가 붙은 에러를 던져서 렌더를 중단시키는 방식으로 동작한다(Next.js 공식 문서
 * `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md`:
 * "redirect throws an error so it should be called **outside** the try block when using
 * try/catch statements"). 이 함수의 `try` 블록은 실패할 수 있는 I/O(`createClient()`·
 * `getUser()`·`fetchSenderProfile()`)만 감싸고, 그 결과로 리다이렉트 여부만 판정한 뒤 `redirect()`
 * 자체는 `try` 밖에서 호출한다 — 그래서 위 fail-open catch가 `redirect()`가 던지는
 * `NEXT_REDIRECT`를 실수로 삼킬 수 없다(그러면 리다이렉트가 무효화된다).
 */
import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';
import { fetchSenderProfile } from './profile/storage';

function logOnboardingGuardError(error: unknown): void {
  const code =
    (error as { code?: unknown } | null)?.code ?? (error instanceof Error ? error.name : undefined);
  const message = (error as { message?: unknown } | null)?.message ?? String(error);
  console.error('[onboarding-guard] enforceOnboardingRedirect failed — fail-open, no redirect', {
    code,
    message,
  });
}

/**
 * `enforceOnboardingRedirect()`의 판정 로직만 분리한다 — 실패할 수 있는 I/O는 전부 여기 안에서
 * 끝내고 `boolean`(리다이렉트 여부)만 반환한다. `redirect()`를 이 함수 밖(=`try` 밖)에서만
 * 호출하기 위한 구조다(클래스 주석의 "`redirect()`는 절대 `try` 안에 두지 않는다" 참고).
 */
async function shouldRedirectToOnboarding(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // 방어적 no-op — `apps/web/proxy.ts`가 이미 미인증 요청을 `/login`으로 보냈으므로 이
    // 레이아웃에 도달한 요청은 항상 인증돼 있어야 한다. 그래도 삼키지 않고 그냥 통과시킨다
    // (리다이렉트 대상이 아니다).
    if (!user) return false;

    const profile = await fetchSenderProfile(supabase, user.id);
    return profile.onboardingState === 'not_started';
  } catch (error) {
    // M-1 — fail-open. 위 클래스 주석 참고.
    logOnboardingGuardError(error);
    return false;
  }
}

export async function enforceOnboardingRedirect(): Promise<void> {
  const shouldRedirect = await shouldRedirectToOnboarding();
  if (shouldRedirect) {
    redirect('/onboarding');
  }
}
