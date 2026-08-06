/**
 * Supabase 브라우저 클라이언트 생성 — 위 `server.ts`와 함께 "생성처는 여기 한 곳뿐" 규칙을 이룬다.
 *
 * ADR-0002: 인증은 Supabase Auth(이메일+비밀번호)를 자체 구현하지 않고 브라우저에서
 * `@supabase/supabase-js`(browser client)로 직접 `signInWithPassword()`/`signUp()`/`signOut()`을
 * 호출한다 — 커스텀 `/api/login` 라우트를 두지 않는다. 세션은 `@supabase/ssr`이 HttpOnly 쿠키로
 * 관리하며, `createBrowserClient()`가 그 쿠키 동기화를 자동으로 해 준다(수동으로 `document.cookie`를
 * 다루지 않는다).
 *
 * `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`는 클라이언트 노출 전제다
 * (RLS가 인가를 강제 — `docs/CodingRules.md` Naming "환경변수" 행).
 */
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

export function createClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY must both be set to create the browser client',
    );
  }
  return createBrowserClient(url, anonKey);
}
