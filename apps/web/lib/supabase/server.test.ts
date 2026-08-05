/**
 * `createServiceClient()` — RLS 우회 서비스 클라이언트 생성처(`docs/CodingRules.md` Directory Rules
 * "createServiceClient() 사용처는 llm_cache·llm_call_log 2곳만"). 여기서는 생성 자체만 검증한다.
 *
 * `createClient()`(T45) — 요청 쿠키 기반 세션 클라이언트. `@supabase/ssr`의 `createServerClient`와
 * `next/headers`의 `cookies()`를 모킹해, getAll/setAll이 요청 쿠키 저장소로 올바르게 위임되는지
 * 검증한다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({ auth: {} })),
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient, createServiceClient, createTokenClient } from './server';

describe('createServiceClient', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없으면 던진다', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect(() => createServiceClient()).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL \/ SUPABASE_SERVICE_ROLE_KEY must both be set/,
    );
  });

  it('둘 다 있으면 SupabaseClient를 생성한다', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key-placeholder');
    const client = createServiceClient();
    expect(client).toBeTruthy();
    expect(typeof client.from).toBe('function');
  });
});

describe('createClient (세션 클라이언트)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('NEXT_PUBLIC_SUPABASE_URL 또는 NEXT_PUBLIC_SUPABASE_ANON_KEY가 없으면 던진다', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    await expect(createClient()).rejects.toThrow(
      /NEXT_PUBLIC_SUPABASE_URL \/ NEXT_PUBLIC_SUPABASE_ANON_KEY must both be set/,
    );
  });

  it('둘 다 있으면 요청 쿠키의 getAll/setAll을 연결한 세션 클라이언트를 만든다', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key-placeholder');

    const fakeCookies = [{ name: 'sb-token', value: 'abc' }];
    const cookieStoreSet = vi.fn();
    vi.mocked(cookies).mockResolvedValue({
      getAll: () => fakeCookies,
      set: cookieStoreSet,
    } as unknown as Awaited<ReturnType<typeof cookies>>);

    await createClient();

    expect(createServerClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'anon-key-placeholder',
      expect.objectContaining({ cookies: expect.any(Object) }),
    );

    const options = vi.mocked(createServerClient).mock.calls[0][2] as {
      cookies: {
        getAll: () => unknown;
        setAll: (cookiesToSet: { name: string; value: string; options: unknown }[]) => void;
      };
    };
    expect(options.cookies.getAll()).toEqual(fakeCookies);

    options.cookies.setAll([{ name: 'sb-token', value: 'new', options: { path: '/' } }]);
    expect(cookieStoreSet).toHaveBeenCalledWith('sb-token', 'new', { path: '/' });
  });

  it('Critical 2 — Server Component에서 쿠키 쓰기가 실패해도 무로그로 삼키지 않고 console.error를 남긴다', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key-placeholder');
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const cookieStoreSet = vi.fn(() => {
      throw new Error('Cookies can only be modified in a Server Action or Route Handler');
    });
    vi.mocked(cookies).mockResolvedValue({
      getAll: () => [],
      set: cookieStoreSet,
    } as unknown as Awaited<ReturnType<typeof cookies>>);

    await createClient();
    const options = vi.mocked(createServerClient).mock.calls[0][2] as {
      cookies: {
        getAll: () => unknown;
        setAll: (cookiesToSet: { name: string; value: string; options: unknown }[]) => void;
      };
    };

    expect(() =>
      options.cookies.setAll([{ name: 'sb-token', value: 'new', options: { path: '/' } }]),
    ).not.toThrow();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

describe('createTokenClient (Bearer 검증 전용, apps/web/lib/auth.ts 소비)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('NEXT_PUBLIC_SUPABASE_URL 또는 NEXT_PUBLIC_SUPABASE_ANON_KEY가 없으면 던진다', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    expect(() => createTokenClient()).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL \/ NEXT_PUBLIC_SUPABASE_ANON_KEY must both be set/,
    );
  });

  it('둘 다 있으면 SupabaseClient를 생성한다', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key-placeholder');
    const client = createTokenClient();
    expect(client).toBeTruthy();
    expect(typeof client.auth.getUser).toBe('function');
  });

  // T14 — `POST /api/messages`(사용자 소유 테이블 쓰기)가 확장(Bearer) 경로에서도 RLS를
  // 통과하려면, 검증에 쓴 토큰을 이후 쿼리에도 실어 보내는 클라이언트가 필요하다
  // (`docs/Database.md` "Row Level Security" — `auth.uid()`는 요청의 JWT에서 나온다).
  // `accessToken`을 주면 이후 `.from()` 호출이 `Authorization: Bearer <token>` 헤더를 실어
  // 보내도록 클라이언트를 만든다. `headers`는 supabase-js `SupabaseClient`의 protected 필드라
  // 배선이 실제로 연결됐는지 확인할 유일한 방법이 캐스팅 접근이다(구조적 검증).
  it('accessToken을 주면 이후 요청에 Authorization: Bearer 헤더가 실리도록 클라이언트를 만든다(T14)', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key-placeholder');
    const client = createTokenClient('user-access-token');
    const headers = (client as unknown as { headers: Record<string, string> }).headers;
    expect(headers.Authorization).toBe('Bearer user-access-token');
  });
});
