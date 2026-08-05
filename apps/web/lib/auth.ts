/**
 * 세션 해석(쿠키 | Bearer) — `docs/Architecture.md:103` 폴더 구조 · `docs/API.md` Conventions "인증":
 * "쿠키 세션(웹앱) 또는 Authorization: Bearer(확장). 한 곳에서 분기하며 라우트마다 다른 방식을
 * 만들지 않는다."
 *
 * T45 구현. ADR-0002: 인증은 Supabase Auth. 이 함수는 세션을 "해석"만 한다 — 로그인·가입·로그아웃
 * 자체는 브라우저가 `@supabase/supabase-js`로 Supabase에 직접 말한다(커스텀 `/api/login` 없음).
 *
 * 분기 순서: ① 쿠키 세션(웹앱, `apps/web/lib/supabase/server.ts`의 `createClient()`가 요청 쿠키를
 * 읽는다) → ② 없으면 `Authorization: Bearer <token>`(확장) → ③ 둘 다 없거나 무효면 `null`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient as createServerSupabaseClient, createTokenClient } from './supabase/server';

export interface Session {
  userId: string;
  /**
   * 🔴 T14 — RLS(`auth.uid()`)가 통과하는, 이 사용자로 인증된 Supabase 클라이언트.
   * 사용자 소유 테이블(`sent_messages` 등)에 쓰는 라우트는 `createServiceClient()`(RLS 우회,
   * `llm_cache`·`llm_call_log` 전용)를 쓸 수 없으므로 이 클라이언트가 유일한 합법 경로다
   * (`docs/CodingRules.md` Directory Rules). **`Optional`로 둔 이유** — 이 필드를 추가하기 전부터
   * 존재하던 테스트(`http.test.ts`, `mediate/route.test.ts`)가 `resolveSession()`을 모킹하며
   * `{ userId }`만 돌려준다; 그 라우트들은 DB에 쓰지 않으므로 `client`가 없어도 정상 동작한다.
   * 실제 구현(`resolveSession()`)은 두 분기 모두 항상 채워서 반환한다.
   */
  client?: SupabaseClient;
}

const BEARER_PREFIX = 'Bearer ';

/**
 * 🔴 Critical 2 — 인증 경로의 에러를 로그 없이 삼키지 않는다(`docs/CodingRules.md` Error Handling
 * "에러 삼키기 금지" — "로그도 없이 삼키면 Critical"). 지금까지는 Supabase 장애·env 누락이 전부
 * "로그아웃"으로 위장되고 로그에 흔적이 없었다. `apps/web/lib/llm/openai.ts`의 `logStorageError()`와
 * 같은 형태(코드·메시지만, 원문·시크릿 절대 포함 금지)로 남긴다.
 */
function logAuthError(context: string, error: unknown): void {
  const code =
    (error as { code?: unknown } | null)?.code ?? (error instanceof Error ? error.name : undefined);
  const message = (error as { message?: unknown } | null)?.message ?? String(error);
  console.error(context, { code, message });
}

async function resolveBearerSession(request: Request): Promise<Session | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) {
    return null;
  }
  const token = authHeader.slice(BEARER_PREFIX.length).trim();
  if (!token) {
    return null;
  }

  // 🔴 쿠키가 없는(확장) 요청 전용 — `apps/web/lib/supabase/server.ts`의 `createClient()`는
  // `next/headers`의 요청 쿠키를 전제하므로 여기서는 재사용하지 않고, 같은 파일의
  // `createTokenClient()`(토큰만으로 조회하는 1회용 클라이언트)를 쓴다. "생성처는
  // `apps/web/lib/supabase/` 한 곳뿐"(`docs/CodingRules.md` Directory Rules)을 지키기 위해
  // `@supabase/supabase-js`의 `createClient()`를 여기서 직접 부르지 않는다.
  // 🔴 T14 — `token`을 넘겨 만든다: 이 클라이언트를 검증 이후에도 `session.client`로 재사용해
  // DB 쓰기를 RLS 통과 상태로 만들기 위해서다(`Session.client` JSDoc 참조). 토큰 없이 만들면
  // 이후 쿼리가 익명 요청이 되어 RLS가 전부 거부한다.
  try {
    const client = createTokenClient(token);
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) {
      return null;
    }
    return { userId: data.user.id, client };
  } catch (error) {
    // 환경변수 누락 등 클라이언트 생성 실패 — 미인증으로 취급하되, 원인은 로그에 남긴다(Critical 2).
    logAuthError('[auth] resolveBearerSession failed — treating as unauthenticated', error);
    return null;
  }
}

/** 쿠키 세션 또는 `Authorization: Bearer <token>` 에서 세션을 해석한다. 없으면 `null`. */
export async function resolveSession(request: Request): Promise<Session | null> {
  // ① 쿠키 세션(웹앱). `next/headers`의 `cookies()`는 요청 객체를 매개변수로 받지 않고
  // Next.js의 요청 스코프 컨텍스트에서 읽으므로, 여기서는 `request` 파라미터를 쓰지 않는다
  // (Bearer 분기에서만 `request.headers`를 직접 읽는다).
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) {
      // 🔴 T14 — 쿠키에 바인딩된 이 클라이언트를 그대로 돌려준다. `@supabase/ssr`이 만든
      // 클라이언트는 이후 `.from()` 쿼리에도 같은 세션을 자동으로 싣는다(표준 동작) — 새
      // 클라이언트를 따로 만들 필요가 없다.
      return { userId: data.user.id, client: supabase };
    }
  } catch (error) {
    // 쿠키 클라이언트 생성 실패(예: 환경변수 누락) — Bearer 분기로 넘어가되, 원인은 로그에
    // 남긴다(Critical 2).
    logAuthError('[auth] cookie session client failed — falling through to Bearer', error);
  }

  // ② Authorization: Bearer <token>(확장)
  return resolveBearerSession(request);
}
