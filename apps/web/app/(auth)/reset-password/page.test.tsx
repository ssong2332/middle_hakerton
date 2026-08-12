/**
 * UX-020 (ResetPassword half) — `docs/UX.md` Screen Catalog. AC-090.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockUpdateUser = vi.fn();
const mockUnsubscribe = vi.fn();

vi.mock('../../../lib/supabase/browser', () => ({
  createClient: () => ({
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
      updateUser: mockUpdateUser,
    },
  }),
}));

import ResetPasswordPage from './page';

function fillPasswords(password: string, confirm: string) {
  fireEvent.change(screen.getByLabelText('새 비밀번호'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('새 비밀번호 확인'), { target: { value: confirm } });
}

describe('ResetPasswordPage (UX-020)', () => {
  let authStateCallback: ((event: string, session: unknown) => void) | null;

  beforeEach(() => {
    vi.clearAllMocks();
    authStateCallback = null;
    mockOnAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
      authStateCallback = cb;
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
    });
  });

  it('AC-090④ — 유효한 재설정 세션이 없으면 오류 안내와 "비밀번호 찾기로 돌아가기" 링크를 보여준다(빈 폼 없음)', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    render(<ResetPasswordPage />);

    await waitFor(() => {
      expect(screen.getByText('링크가 만료되었거나 올바르지 않습니다.')).toBeTruthy();
    });
    const link = screen.getByRole('link', { name: '비밀번호 찾기로 돌아가기' }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/forgot-password');
    expect(screen.queryByLabelText('새 비밀번호')).toBeNull();
  });

  it('getSession이 이미 유효한 세션을 반환하면 새 비밀번호 폼을 보여준다', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    render(<ResetPasswordPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('새 비밀번호')).toBeTruthy();
    });
  });

  it('getSession엔 세션이 없어도 이후 PASSWORD_RECOVERY 이벤트가 오면 폼을 보여준다', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    render(<ResetPasswordPage />);

    await waitFor(() => {
      expect(screen.getByText('링크가 만료되었거나 올바르지 않습니다.')).toBeTruthy();
    });

    expect(authStateCallback).toBeTruthy();
    authStateCallback?.('PASSWORD_RECOVERY', { access_token: 'tok' });

    await waitFor(() => {
      expect(screen.getByLabelText('새 비밀번호')).toBeTruthy();
    });
  });

  it('비밀번호가 8자 미만이면 오류를 보여주고 제출을 막는다', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    render(<ResetPasswordPage />);
    await waitFor(() => screen.getByLabelText('새 비밀번호'));

    fillPasswords('short', 'short');
    expect(screen.getByText('비밀번호는 8자 이상이어야 합니다')).toBeTruthy();
    const button = screen.getByRole('button', { name: '비밀번호 변경' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('두 비밀번호가 다르면 오류를 보여주고 제출을 막는다', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    render(<ResetPasswordPage />);
    await waitFor(() => screen.getByLabelText('새 비밀번호'));

    fillPasswords('password123', 'password456');
    expect(screen.getByText('비밀번호가 일치하지 않습니다')).toBeTruthy();
    const button = screen.getByRole('button', { name: '비밀번호 변경' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('성공하면 updateUser를 호출하고 완료 화면 + 로그인 링크를 보여준다', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    mockUpdateUser.mockResolvedValue({ data: {}, error: null });
    render(<ResetPasswordPage />);
    await waitFor(() => screen.getByLabelText('새 비밀번호'));

    fillPasswords('password123', 'password123');
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 변경' }));

    await waitFor(() => {
      expect(screen.getByText('비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.')).toBeTruthy();
    });
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'password123' });
    const link = screen.getByRole('link', { name: '로그인으로 이동' }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/login');
  });

  it('실패하면 재시도 배너를 보여준다', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    mockUpdateUser.mockResolvedValue({ data: {}, error: { message: 'failed' } });
    render(<ResetPasswordPage />);
    await waitFor(() => screen.getByLabelText('새 비밀번호'));

    fillPasswords('password123', 'password123');
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 변경' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy();
    });
  });

  it('언마운트 시 auth 구독을 해제한다', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const { unmount } = render(<ResetPasswordPage />);
    await waitFor(() => screen.getByText('링크가 만료되었거나 올바르지 않습니다.'));
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});
