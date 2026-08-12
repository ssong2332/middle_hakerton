/**
 * 세션 쿠키 갱신 + 미인증 접근 처리 — T45/T46.
 *
 * 🔴 **파일명 주의**: 이 프로젝트가 쓰는 Next.js 16(`docs/Architecture.md` Tech Stack)에서는
 * `middleware.js/.ts` 컨벤션이 **`proxy.js/.ts`로 이름이 바뀌었다**(export 이름도 `proxy`).
 * 근거: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/middleware.md`
 * ("The middleware.js file convention has been deprecated in Next.js 16 and renamed to proxy.js.
 * All functionality remains the same — only the file and export names have changed.") ·
 * `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`. 동작·컨벤션(요청 가로채기,
 * `matcher` 설정, 프로젝트 루트 — 여기서는 `app/`과 같은 레벨인 `apps/web/`)은 동일하다.
 * `apps/web/AGENTS.md`("Read the relevant guide in node_modules/next/dist/docs/ ... Heed
 * deprecation notices")에 따라 `middleware.ts`가 아니라 `proxy.ts`로 만든다.
 *
 * Supabase 공식 Next.js SSR 패턴(요청 쿠키를 읽고, 토큰 갱신이 있으면 응답 쿠키에 다시 써서
 * 매 요청마다 세션을 살아있게 유지) — `@supabase/ssr`의 `createServerClient()`가 요구하는
 * `getAll`/`setAll` 계약을 그대로 구현한다(`node_modules/@supabase/ssr/dist/main/types.d.ts`).
 *
 * 책임 범위: ① 쿠키 세션 갱신(모든 매칭 경로) ② 미인증 상태에서 보호된 페이지 접근 시
 * `/login`으로 리다이렉트(+ 원래 요청 경로를 `?from=`으로 보존) ③ 인증된 사용자가 `/login`·
 * `/signup`에 직접 접근하면 기본 랜딩으로 리다이렉트. `/api/**`는 이 파일의 matcher에서
 * 제외한다 — API 라우트의 인증은 `apps/web/lib/http.ts`의 `withApi()` + `lib/auth.ts`의
 * `resolveSession()`이 이미 담당한다(쿠키 또는 Bearer, `docs/API.md` Conventions "인증").
 *
 * 🔴 온보딩(UX-003) 강제 리다이렉트(`docs/UX.md` "Direct URL access" v2.7/AC-059)는 **이 파일의
 * 범위가 아니다.** 이 함수는 쿠키만 보는 낙관적 확인(Optimistic check)이고, 온보딩 완료 여부
 * 판정에는 `profiles` 테이블 DB 조회가 필요하다 — 아래 "낙관적 확인만 한다" 주석이 인용하는 규칙
 * 때문에 여기서 DB를 조회하지 않는다. 실제 구현은 `apps/web/lib/onboarding-guard.ts`의
 * `enforceOnboardingRedirect()`(T73④)가 담당하며, `apps/web/app/(app)/(with-nav)/layout.tsx`
 * (async Server Component)에서만 호출된다 — 프록시의 낙관적 확인과 Server Component의 실제 DB
 * 기반 인가 확인을 분리하는 layer 설계다.
 */
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/** `docs/UX.md` Information Architecture "Routes" — Unauthenticated 목록과 정확히 일치시킨다.
 * (T86/UX-020) `/forgot-password`·`/reset-password` 추가 — 둘 다 로그인 세션 없이 접근돼야 한다. */
const PUBLIC_ROUTES = ['/login', '/signup', '/forgot-password', '/reset-password'];

/**
 * 🔴 (T86/UX-020) `/reset-password`는 `PUBLIC_ROUTES`에 있지만 아래 "인증된 사용자가 공개 경로에
 * 접근하면 기본 랜딩으로 보낸다" 규칙 대상에서 **제외**해야 한다 — Supabase의 비밀번호 재설정
 * 이메일 링크는 클릭하는 순간 실제 인증 세션(`auth.getUser()`가 사람을 반환하는 상태)을 만든다.
 * `/login`·`/signup`과 똑같이 취급하면 그 세션이 서버에 반영되자마자 `/mediate`로 튕겨나가
 * 새 비밀번호를 입력할 기회 자체가 사라진다. `/forgot-password`는 이 문제가 없지만(이메일만
 * 입력하는 화면, 세션을 만들지 않는다) 대칭을 위해 같이 제외한다 — 로그인 상태에서 실수로
 * 열어도 그냥 폼이 보일 뿐 해가 없다.
 */
const REDIRECT_AWAY_IF_AUTHENTICATED_ROUTES = ['/login', '/signup'];

/** UX-004(중재 워크스페이스) 기본 랜딩 — `docs/UX.md` "Routes": "/` 또는 `/mediate`". `/`는 아직
 * 스캐폴드가 없어(T2/T12/T13 범위) `/mediate`로 고정한다. */
const DEFAULT_AUTHENTICATED_ROUTE = '/mediate';

function matchesRoute(pathname: string, routes: string[]): boolean {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function isPublicRoute(pathname: string): boolean {
  return matchesRoute(pathname, PUBLIC_ROUTES);
}

function redirectsAwayIfAuthenticated(pathname: string): boolean {
  return matchesRoute(pathname, REDIRECT_AWAY_IF_AUTHENTICATED_ROUTES);
}

/**
 * 🔴 Major 2(QA 6차 NO-GO → 수정) — `getUser()`의 `error`를 로그 없이 삼키지 않는다
 * (`docs/CodingRules.md` Error Handling "에러 삼키기 금지"). `apps/web/lib/auth.ts`의
 * `logAuthError()`와 같은 형태(코드·메시지만, 원문·시크릿 절대 포함 금지)로 남긴다.
 */
function logProxyAuthError(error: unknown): void {
  const code =
    (error as { code?: unknown } | null)?.code ?? (error instanceof Error ? error.name : undefined);
  const message = (error as { message?: unknown } | null)?.message ?? String(error);
  console.error('[proxy] supabase.auth.getUser() failed', { code, message });
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    // 🔴 Major 3(reviewer REJECTED → 수정) — env 누락을 fail-open(그냥 통과)으로 처리하지
    // 않는다. 이 프로젝트의 다른 모든 fail 경로(`ticketOptionFrom`·`checkRequestLimit`·
    // `apps/web/lib/llm/openai.ts`의 `readModel()`)는 fail-closed다 — 여기만 반대였다.
    // 설정 오류를 로그에 남기고, 공개 경로(`/login`·`/signup`)는 그대로 통과시키되 보호된
    // 경로는 세션 확인을 건너뛴 채 통과시키지 않고 `/login`으로 보낸다.
    console.error('[proxy] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing', {
      code: 'CONFIG_MISSING',
    });
    const pathname = request.nextUrl.pathname;
    if (isPublicRoute(pathname)) {
      return response;
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // 🔴 낙관적 확인(Optimistic check)만 한다 — DB 조회 없이 쿠키의 유효성만 본다
  // (`node_modules/next/dist/docs/01-app/02-guides/authentication.md` "Optimistic checks with
  // Proxy" 절 — Proxy는 모든 경로에서, 프리페치 요청까지 포함해 실행되므로 여기서 DB 조회를
  // 하면 안 된다).
  const {
    data: { user },
    error: getUserError,
  } = await supabase.auth.getUser();
  if (getUserError) {
    logProxyAuthError(getUserError);
  }

  const pathname = request.nextUrl.pathname;
  const publicRoute = isPublicRoute(pathname);

  if (!user && !publicRoute) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && redirectsAwayIfAuthenticated(pathname)) {
    return NextResponse.redirect(new URL(DEFAULT_AUTHENTICATED_ROUTE, request.url));
  }

  return response;
}

export const config = {
  // `/api/**`, 정적 자산, Next 내부 경로는 세션 갱신·리다이렉트 대상에서 제외한다.
  matcher: ['/((?!api|_next/static|_next/image|favicon\\.ico).*)'],
};
