/**
 * `createServiceClient()` — RLS 우회 서비스 클라이언트 생성처(`docs/CodingRules.md` Directory Rules
 * "createServiceClient() 사용처는 llm_cache·llm_call_log 2곳만"). 여기서는 생성 자체만 검증한다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServiceClient } from './server';

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
