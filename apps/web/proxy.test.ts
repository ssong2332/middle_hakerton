/**
 * `proxy()`(Next.js 16 — 구 middleware) — 세션 쿠키 갱신 + 미인증 접근 처리. `@supabase/ssr`의
 * `createServerClient`만 모킹하고 `NextRequest`/`NextResponse`는 실제 `next/server` 구현을 쓴다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockGetUser = vi.fn();
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({ auth: { getUser: mockGetUser } })),
}));

import { NextRequest } from 'next/server';
import { proxy } from './proxy';

function requestFor(path: string): NextRequest {
  return new NextRequest(new URL(path, 'http://localhost:3000'));
}

describe('proxy — 세션 갱신 + 미인증 접근 처리', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('Major 3 — 환경변수가 없으면 fail-closed로 보호된 경로를 /login으로 리다이렉트한다(다른 fail-closed 경로: ticketOptionFrom·checkRequestLimit·openai.ts와 일관)', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');

    const response = await proxy(requestFor('/mediate'));

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location')!);
    expect(location.pathname).toBe('/login');
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('Major 3 — 환경변수가 없어도 공개 경로(/login)는 통과시킨다(fail-closed는 보호된 경로에만 적용)', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');

    const response = await proxy(requestFor('/login'));

    expect(response.status).toBe(200);
    consoleErrorSpy.mockRestore();
  });

  it('미인증 상태로 보호된 경로(/mediate)에 접근하면 /login으로 리다이렉트하고 원래 경로를 from에 보존한다', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key-placeholder');
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await proxy(requestFor('/mediate'));

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location')!);
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('from')).toBe('/mediate');
  });

  it('미인증 상태로 /login에 접근하면 리다이렉트 없이 통과시킨다', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key-placeholder');
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await proxy(requestFor('/login'));

    expect(response.status).toBe(200);
  });

  it('인증된 사용자가 /login에 접근하면 기본 랜딩(/mediate)으로 리다이렉트한다', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key-placeholder');
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

    const response = await proxy(requestFor('/login'));

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location')!);
    expect(location.pathname).toBe('/mediate');
  });

  // Major 2(QA 6차 NO-GO → 수정) — `apps/web/lib/auth.ts`의 `logAuthError()`와 같은 형태
  // (코드·메시지만, 원문·시크릿 없음)로 `getUser()` 에러를 로그에 남긴다. 지금까지는 이
  // 에러가 무로그로 삼켜졌다(`docs/CodingRules.md` Error Handling "에러 삼키기 금지").
  it('Major 2 — supabase.auth.getUser()가 error를 반환하면 코드·메시지를 로그로 남긴다', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key-placeholder');
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: {
        code: 'session_not_found',
        message: 'Session from session_id claim in JWT does not exist',
      },
    });

    await proxy(requestFor('/login'));

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[proxy]'),
      expect.objectContaining({
        code: 'session_not_found',
        message: 'Session from session_id claim in JWT does not exist',
      }),
    );
    consoleErrorSpy.mockRestore();
  });

  it('인증된 사용자가 보호된 경로에 접근하면 통과시킨다', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key-placeholder');
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

    const response = await proxy(requestFor('/mediate'));

    expect(response.status).toBe(200);
  });
});
