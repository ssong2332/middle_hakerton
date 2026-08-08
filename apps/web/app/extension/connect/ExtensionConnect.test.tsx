// T56 — /extension/connect 토큰 인계 (`docs/Architecture.md` "확장 인증").
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../../../lib/supabase/browser', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '../../../lib/supabase/browser';
import { ExtensionConnect } from './ExtensionConnect';

const mockedCreateClient = vi.mocked(createClient);

function mockSupabaseSession(accessToken: string | null) {
  mockedCreateClient.mockReturnValue({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: accessToken ? { access_token: accessToken } : null },
      }),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

describe('ExtensionConnect', () => {
  const originalEnv = process.env.NEXT_PUBLIC_EXTENSION_ID;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_EXTENSION_ID = 'ext-id-123';
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_EXTENSION_ID = originalEnv;
    delete (globalThis as { chrome?: unknown }).chrome;
    vi.clearAllMocks();
  });

  it('shows NotLoggedIn when there is no session', async () => {
    mockSupabaseSession(null);
    render(<ExtensionConnect />);

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('로그인');
    });
  });

  it('sends the access token to the configured extension ID and shows Connected on success', async () => {
    mockSupabaseSession('access-tok-1');
    const sendMessage = vi.fn((_id: string, _msg: unknown, callback: (r: unknown) => void) => {
      callback({ ok: true });
    });
    (globalThis as { chrome?: unknown }).chrome = { runtime: { sendMessage } };

    render(<ExtensionConnect />);

    await waitFor(() => {
      expect(screen.getByText(/연결되었습니다/)).toBeTruthy();
    });
    expect(sendMessage).toHaveBeenCalledWith(
      'ext-id-123',
      { type: 'cbm:set-token', token: 'access-tok-1' },
      expect.any(Function),
    );
  });

  it('shows Failed when chrome.runtime is unavailable (extension not installed)', async () => {
    mockSupabaseSession('access-tok-1');
    // chrome 글로벌을 설정하지 않음 — 확장 미설치 상태를 흉내낸다.

    render(<ExtensionConnect />);

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('연결 실패');
    });
  });

  it('shows Failed when NEXT_PUBLIC_EXTENSION_ID is not configured', async () => {
    process.env.NEXT_PUBLIC_EXTENSION_ID = '';
    mockSupabaseSession('access-tok-1');
    (globalThis as { chrome?: unknown }).chrome = { runtime: { sendMessage: vi.fn() } };

    render(<ExtensionConnect />);

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('연결 실패');
    });
  });

  it('shows Failed when the extension responds with a non-ok result', async () => {
    mockSupabaseSession('access-tok-1');
    const sendMessage = vi.fn((_id: string, _msg: unknown, callback: (r: unknown) => void) => {
      callback({ ok: false, error: 'boom' });
    });
    (globalThis as { chrome?: unknown }).chrome = { runtime: { sendMessage } };

    render(<ExtensionConnect />);

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('연결 실패');
    });
  });
});
