/**
 * `resolveSession()` — 쿠키 세션(웹앱) → Bearer 토큰(확장) → null 분기 검증.
 * `apps/web/lib/http.test.ts`는 이 함수를 통째로 모킹하므로 여기서 실 구현을 검증한다.
 * AC-039 — 계정 2개가 각각 다른 세션(userId)으로 식별되는지도 여기서 확인한다(RLS에 의한
 * 데이터 미교차 자체는 T18 범위 — 이 테스트는 세션/식별 수준까지만 다룬다).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const mockBearerGetUser = vi.fn();
vi.mock('./supabase/server', () => ({
  createClient: vi.fn(),
  createTokenClient: vi.fn(() => ({ auth: { getUser: mockBearerGetUser } })),
}));

import { createClient as createServerSupabaseClient } from './supabase/server';
import { resolveSession } from './auth';

const mockCreateServerSupabaseClient = vi.mocked(createServerSupabaseClient);

/** 테스트 전용 최소 Supabase 클라이언트 모킹 — `docs/CodingRules.md` Prohibitions("any 금지")를
 * 지키기 위해 `unknown` 경유로 좁힌다. */
function fakeSupabaseClient(getUser: () => Promise<unknown>): SupabaseClient {
  return { auth: { getUser } } as unknown as SupabaseClient;
}

function requestWithAuthHeader(header?: string): Request {
  return new Request('http://localhost/api/test', {
    headers: header ? { authorization: header } : {},
  });
}

describe('resolveSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key-placeholder');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('쿠키 세션이 있으면 그 사용자의 userId를 반환한다(웹앱 경로)', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(
      fakeSupabaseClient(() =>
        Promise.resolve({ data: { user: { id: 'user-cookie-1' } }, error: null }),
      ),
    );

    const session = await resolveSession(requestWithAuthHeader());

    expect(session).toEqual({ userId: 'user-cookie-1' });
  });

  it('쿠키 세션이 없고 Authorization: Bearer 토큰이 유효하면 그 사용자의 userId를 반환한다(확장 경로)', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(
      fakeSupabaseClient(() =>
        Promise.resolve({ data: { user: null }, error: { message: 'no session' } }),
      ),
    );
    mockBearerGetUser.mockResolvedValue({ data: { user: { id: 'user-bearer-1' } }, error: null });

    const session = await resolveSession(requestWithAuthHeader('Bearer valid-token'));

    expect(session).toEqual({ userId: 'user-bearer-1' });
    expect(mockBearerGetUser).toHaveBeenCalledWith('valid-token');
  });

  it('쿠키·Bearer 둘 다 없으면 null을 반환한다', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(
      fakeSupabaseClient(() =>
        Promise.resolve({ data: { user: null }, error: { message: 'no session' } }),
      ),
    );

    const session = await resolveSession(requestWithAuthHeader());

    expect(session).toBeNull();
  });

  it('Bearer 토큰이 무효하면 null을 반환한다', async () => {
    mockCreateServerSupabaseClient.mockResolvedValue(
      fakeSupabaseClient(() =>
        Promise.resolve({ data: { user: null }, error: { message: 'no session' } }),
      ),
    );
    mockBearerGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'invalid token' },
    });

    const session = await resolveSession(requestWithAuthHeader('Bearer invalid-token'));

    expect(session).toBeNull();
  });

  it('Critical 2 — 쿠키 클라이언트 생성 실패는 무로그로 삼키지 않고 console.error를 남긴다', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockCreateServerSupabaseClient.mockRejectedValue(new Error('cookies() unavailable'));

    const session = await resolveSession(requestWithAuthHeader());

    expect(session).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('Critical 2 — Bearer 클라이언트 조회 실패는 무로그로 삼키지 않고 console.error를 남긴다', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockCreateServerSupabaseClient.mockResolvedValue(
      fakeSupabaseClient(() =>
        Promise.resolve({ data: { user: null }, error: { message: 'no session' } }),
      ),
    );
    mockBearerGetUser.mockRejectedValue(new Error('network unavailable'));

    const session = await resolveSession(requestWithAuthHeader('Bearer some-token'));

    expect(session).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('AC-039 — 계정 2개가 각각 다른 세션(userId)으로 식별된다', async () => {
    mockCreateServerSupabaseClient
      .mockResolvedValueOnce(
        fakeSupabaseClient(() =>
          Promise.resolve({ data: { user: { id: 'user-A' } }, error: null }),
        ),
      )
      .mockResolvedValueOnce(
        fakeSupabaseClient(() =>
          Promise.resolve({ data: { user: { id: 'user-B' } }, error: null }),
        ),
      );

    const sessionA = await resolveSession(requestWithAuthHeader());
    const sessionB = await resolveSession(requestWithAuthHeader());

    expect(sessionA).toEqual({ userId: 'user-A' });
    expect(sessionB).toEqual({ userId: 'user-B' });
    expect(sessionA?.userId).not.toBe(sessionB?.userId);
  });
});
