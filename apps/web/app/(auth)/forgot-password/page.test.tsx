/**
 * UX-020 (ForgotPassword half) — `docs/UX.md` Screen Catalog. AC-090.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockResetPasswordForEmail = vi.fn();
vi.mock('../../../lib/supabase/browser', () => ({
  createClient: () => ({ auth: { resetPasswordForEmail: mockResetPasswordForEmail } }),
}));

import ForgotPasswordPage from './page';

describe('ForgotPasswordPage (UX-020)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('이메일이 비어 있거나 형식이 올바르지 않으면 제출 버튼이 비활성 상태다', () => {
    render(<ForgotPasswordPage />);
    const button = screen.getByRole('button', { name: '재설정 링크 보내기' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'not-an-email' } });
    expect(button.disabled).toBe(true);
  });

  it('AC-090② — 이메일을 제출하면 resetPasswordForEmail을 호출하고 항상 같은 성공 문구를 보여준다', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: '재설정 링크 보내기' }));

    await waitFor(() => {
      expect(
        screen.getByText('등록된 이메일이면 비밀번호 재설정 링크를 보냈습니다. 메일함을 확인해 주세요.'),
      ).toBeTruthy();
    });
    expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
      'user@example.com',
      expect.objectContaining({ redirectTo: expect.stringContaining('/reset-password') }),
    );
  });

  it('AC-090② — Supabase가 error를 반환해도(예: 미가입 이메일) 동일한 성공 문구를 보여준다(사용자 열거 방지)', async () => {
    mockResetPasswordForEmail.mockResolvedValue({
      data: {},
      error: { message: 'some non-enumerating error' },
    });
    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'unknown@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: '재설정 링크 보내기' }));

    await waitFor(() => {
      expect(
        screen.getByText('등록된 이메일이면 비밀번호 재설정 링크를 보냈습니다. 메일함을 확인해 주세요.'),
      ).toBeTruthy();
    });
  });

  it('네트워크 오류(예외)가 발생하면 재시도 배너를 보여준다', async () => {
    mockResetPasswordForEmail.mockRejectedValue(new Error('network down'));
    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: '재설정 링크 보내기' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy();
    });
  });

  it('로그인으로 돌아가는 링크가 있다', () => {
    render(<ForgotPasswordPage />);
    const link = screen.getByRole('link', { name: '로그인으로 돌아가기' }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/login');
  });
});
