import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(() => ({ auth: {} })),
}));

import { createBrowserClient } from '@supabase/ssr';
import { createClient } from './browser';

describe('createClient (browser)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('NEXT_PUBLIC_SUPABASE_URL 또는 NEXT_PUBLIC_SUPABASE_ANON_KEY가 없으면 던진다', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    expect(() => createClient()).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL \/ NEXT_PUBLIC_SUPABASE_ANON_KEY must both be set/,
    );
  });

  it('둘 다 있으면 createBrowserClient를 호출해 클라이언트를 만든다', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key-placeholder');

    const client = createClient();

    expect(createBrowserClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'anon-key-placeholder',
    );
    expect(client).toBeTruthy();
  });
});
