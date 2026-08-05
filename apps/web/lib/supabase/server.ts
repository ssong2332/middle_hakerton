/**
 * Supabase 서버 클라이언트 생성 — `docs/CodingRules.md` Directory Rules:
 * "Supabase 클라이언트 **생성처(여기 한 곳뿐)**". 컴포넌트·라우트 본문에서 `createClient()`를
 * 직접 부르지 않는다(`docs/Architecture.md` Conventions 3).
 *
 * 🔴 T2 스캐폴드 스텁 — 실제 쿠키 연동(`@supabase/ssr`)과 `createServiceClient()`(RLS 우회,
 * `llm_cache`·`llm_call_log` 접근 2곳 전용)는 T3/T45 이후 채운다. 지금은 시그니처만 고정한다.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/** 쿠키 세션 기반 클라이언트(RLS 적용). */
export function createClient(): SupabaseClient {
  throw new Error('Not implemented — T3/T45에서 채운다');
}

/** 🔴 RLS 우회. `llm_cache`·`llm_call_log` 접근 외에는 쓰지 않는다(Conventions 3). */
export function createServiceClient(): SupabaseClient {
  throw new Error('Not implemented — T3/T45에서 채운다');
}
