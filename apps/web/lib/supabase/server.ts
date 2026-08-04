/**
 * Supabase 서버 클라이언트 생성 — `docs/CodingRules.md` Directory Rules:
 * "Supabase 클라이언트 **생성처(여기 한 곳뿐)**". 컴포넌트·라우트 본문에서 `createClient()`를
 * 직접 부르지 않는다(`docs/Architecture.md` Conventions 3).
 *
 * `createClient()`(T45) — 요청 쿠키 기반 세션 클라이언트(RLS 적용). Route Handler·Server
 * Component에서 현재 로그인 사용자를 읽는 용도(`apps/web/lib/auth.ts`의 `resolveSession()`이
 * 쿠키 세션 분기에서 이 함수를 쓴다). `next/headers`의 `cookies()`는 Route
 * Handler/Server Function/Server Component 안에서만 유효하므로 이 함수도 그 컨텍스트
 * 안에서만 호출한다.
 */
import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * 🔴 Critical 2 — 에러를 로그 없이 삼키지 않는다(`docs/CodingRules.md` Error Handling "에러 삼키기
 * 금지"). `apps/web/lib/llm/openai.ts`의 `logStorageError()`와 같은 형태(코드·메시지만, 원문·
 * 시크릿 절대 포함 금지)로 남긴다.
 */
function logSupabaseError(context: string, error: unknown): void {
  const code =
    (error as { code?: unknown } | null)?.code ?? (error instanceof Error ? error.name : undefined);
  const message = (error as { message?: unknown } | null)?.message ?? String(error);
  console.error(context, { code, message });
}

/** 쿠키 세션 기반 클라이언트(RLS 적용). */
export async function createClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY must both be set to create the session client',
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // 🔴 Server Component에서 호출되면 쓰기가 실패할 수 있다(Next.js는 렌더 중 쿠키 쓰기를
        // 허용하지 않는다) — `apps/web/proxy.ts`가 매 요청마다 세션 쿠키를 갱신하므로
        // 이 컨텍스트의 쓰기 실패는 세션 유지에 영향이 없다(Supabase SSR 공식 패턴).
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch (error) {
          // Server Component — 세션 유지에는 영향 없다(위 주석 근거)지만, 무로그로 삼키지는
          // 않는다(Critical 2).
          logSupabaseError('[supabase] cookie setAll failed in Server Component context', error);
        }
      },
    },
  });
}

/**
 * 🔴 RLS 우회. `llm_cache`·`llm_call_log` 접근 외에는 쓰지 않는다(Conventions 3).
 * T4 범위 — 이 두 테이블은 서버 전용·화면 없음(`docs/Database.md`)이라 쿠키 세션이 필요 없다.
 */
export function createServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must both be set to create the service client',
    );
  }
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * `apps/web/lib/auth.ts`의 `resolveSession()` Bearer 분기(확장) 전용 — 쿠키가 없는 요청에서
 * `Authorization: Bearer <token>`만으로 사용자를 조회한다(호출부가 `auth.getUser(token)`으로
 * 토큰을 명시 전달한다 — `persistSession:false`라 클라이언트 자체 세션에는 기대지 않는다).
 * 🔴 이 함수가 없으면 `resolveSession()`이 `@supabase/supabase-js`의 `createClient()`를 직접
 * 불러야 해 "생성처는 `apps/web/lib/supabase/` 한 곳뿐"(`docs/CodingRules.md` Directory Rules)을
 * 어긴다.
 */
export function createTokenClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY must both be set to create the token client',
    );
  }
  return createSupabaseClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
