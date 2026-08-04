/**
 * UX-002 Sign Up — `docs/UX.md` Screen Catalog. AC-039, AC-060.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockSignUp = vi.fn();
vi.mock('../../../lib/supabase/browser', () => ({
  createClient: () => ({ auth: { signUp: mockSignUp } }),
}));

import SignupPage from './page';

function fillForm(email: string, password: string, confirm: string) {
  fireEvent.change(screen.getByLabelText('이메일'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('비밀번호 확인'), { target: { value: confirm } });
}

describe('SignupPage (UX-002) — AC-060', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('비밀번호 필드 아래 안내 문구는 정확히 "최소 8자"이다(AC-060③ — 없는 복잡도 요구를 암시하지 않는다)', () => {
    render(<SignupPage />);
    expect(screen.getByText('최소 8자')).toBeTruthy();
  });

  it('AC-060① 7자 비밀번호는 거부되고 사유가 표시되며 signUp을 호출하지 않는다', async () => {
    render(<SignupPage />);
    fillForm('user@example.com', '1234567', '1234567');
    fireEvent.click(screen.getByRole('button', { name: '회원가입' }));

    await waitFor(() => {
      expect(screen.getByText('비밀번호는 8자 이상이어야 합니다')).toBeTruthy();
    });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('AC-060② 8자 비밀번호는 허용되어 signUp이 호출된다', async () => {
    mockSignUp.mockResolvedValue({ data: {}, error: null });
    render(<SignupPage />);
    fillForm('user@example.com', '12345678', '12345678');
    fireEvent.click(screen.getByRole('button', { name: '회원가입' }));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith({ email: 'user@example.com', password: '12345678' });
    });
  });

  it('AC-060③ 대소문자·숫자·특수문자 조합 없이 소문자만 8자(aaaaaaaa)여도 통과해 signUp이 호출된다', async () => {
    mockSignUp.mockResolvedValue({ data: {}, error: null });
    render(<SignupPage />);
    fillForm('user@example.com', 'aaaaaaaa', 'aaaaaaaa');
    fireEvent.click(screen.getByRole('button', { name: '회원가입' }));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith({ email: 'user@example.com', password: 'aaaaaaaa' });
    });
  });

  it('비밀번호와 확인이 다르면 인라인 오류를 보여주고 signUp을 호출하지 않는다', async () => {
    render(<SignupPage />);
    fillForm('user@example.com', '12345678', '87654321');
    fireEvent.click(screen.getByRole('button', { name: '회원가입' }));

    await waitFor(() => {
      expect(screen.getByText('비밀번호가 일치하지 않습니다')).toBeTruthy();
    });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('이미 가입된 이메일이면 서버 배너를 보여주고 로그인 링크를 제공한다', async () => {
    mockSignUp.mockResolvedValue({
      data: {},
      error: { code: 'user_already_exists', message: 'User already registered' },
    });
    render(<SignupPage />);
    fillForm('taken@example.com', '12345678', '12345678');
    fireEvent.click(screen.getByRole('button', { name: '회원가입' }));

    await waitFor(() => {
      expect(screen.getByText('이미 가입된 이메일입니다')).toBeTruthy();
    });
    expect(screen.getAllByRole('link', { name: '로그인' }).length).toBeGreaterThan(0);
  });

  // Major 3(QA 6차 NO-GO → 수정) — Supabase가 자체 정책으로 비밀번호를 거부하면
  // (`error.code === 'weak_password'`, `node_modules/@supabase/auth-js/src/lib/error-codes.ts:70`
  // 확인) 일반 "처리 중 오류" 배너가 아니라 전용 사유 문구를 보여준다.
  // `docs/CodingRules.md:93` "클라이언트는 error.message 문자열이 아니라 error.code로 분기한다".
  it('Major 3 — Supabase가 weak_password로 거부하면 전용 사유 문구를 보여주고 일반 오류 배너를 띄우지 않는다', async () => {
    mockSignUp.mockResolvedValue({
      data: {},
      error: {
        code: 'weak_password',
        message: 'Password should contain at least one character of each: lowercase, uppercase.',
      },
    });
    render(<SignupPage />);
    fillForm('user@example.com', '12345678', '12345678');
    fireEvent.click(screen.getByRole('button', { name: '회원가입' }));

    await waitFor(() => {
      expect(
        screen.getByText('이 비밀번호는 사용할 수 없습니다. 다른 비밀번호를 입력해 주세요.'),
      ).toBeTruthy();
    });
    expect(screen.queryByText('처리 중 오류가 발생했습니다')).toBeNull();
    expect((screen.getByLabelText('비밀번호') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('비밀번호 확인') as HTMLInputElement).value).toBe('');
  });

  it('Major 4① — 비밀번호·비밀번호 확인 각각 show/hide 토글이 접근성 라벨과 함께 동작한다(docs/UX.md:361)', () => {
    render(<SignupPage />);
    const passwordInput = screen.getByLabelText('비밀번호') as HTMLInputElement;
    const confirmInput = screen.getByLabelText('비밀번호 확인') as HTMLInputElement;
    expect(passwordInput.type).toBe('password');
    expect(confirmInput.type).toBe('password');

    fireEvent.click(screen.getByRole('button', { name: '비밀번호 보기' }));
    expect(passwordInput.type).toBe('text');
    expect(confirmInput.type).toBe('password');

    fireEvent.click(screen.getByRole('button', { name: '비밀번호 확인 보기' }));
    expect(confirmInput.type).toBe('text');

    fireEvent.click(screen.getByRole('button', { name: '비밀번호 숨기기' }));
    expect(passwordInput.type).toBe('password');
  });

  it('Major 4② — 네트워크 오류 시 이메일은 유지되고 비밀번호 필드 2개는 보안상 초기화된다(docs/UX.md:360)', async () => {
    mockSignUp.mockRejectedValue(new Error('network down'));
    render(<SignupPage />);
    fillForm('user@example.com', '12345678', '12345678');
    fireEvent.click(screen.getByRole('button', { name: '회원가입' }));

    await waitFor(() => {
      expect(screen.getByText('처리 중 오류가 발생했습니다')).toBeTruthy();
    });
    expect((screen.getByLabelText('이메일') as HTMLInputElement).value).toBe('user@example.com');
    expect((screen.getByLabelText('비밀번호') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('비밀번호 확인') as HTMLInputElement).value).toBe('');
  });

  it('가입 성공 시 온보딩(UX-003)으로 이동한다', async () => {
    mockSignUp.mockResolvedValue({ data: {}, error: null });
    render(<SignupPage />);
    fillForm('user@example.com', '12345678', '12345678');
    fireEvent.click(screen.getByRole('button', { name: '회원가입' }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/onboarding');
    });
  });

  // Major 4(reviewer 5차 REJECTED → 수정) — `docs/UX.md:357` States: "Success: brief
  // confirmation, then redirect." 이전에는 확인 표시 없이 곧장 `router.push()`했다.
  it('Major 4 — 가입 성공 시 확인 메시지를 먼저 보여준 뒤 이동한다(docs/UX.md:357)', async () => {
    mockSignUp.mockResolvedValue({ data: {}, error: null });
    render(<SignupPage />);
    fillForm('user@example.com', '12345678', '12345678');
    fireEvent.click(screen.getByRole('button', { name: '회원가입' }));

    await waitFor(() => {
      expect(screen.getByText('회원가입되었습니다')).toBeTruthy();
    });
    // 확인 메시지가 보이는 시점에는 아직 이동하지 않았다 — "먼저 보여준 뒤" 이동이어야 한다.
    expect(mockPush).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/onboarding');
    });
  });
});
