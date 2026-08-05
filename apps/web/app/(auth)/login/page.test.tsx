/**
 * UX-001 Login — `docs/UX.md` Screen Catalog. AC-039.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockPush = vi.fn();
const mockSearchParamsGet = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({ get: mockSearchParamsGet }),
}));

const mockSignInWithPassword = vi.fn();
vi.mock('../../../lib/supabase/browser', () => ({
  createClient: () => ({ auth: { signInWithPassword: mockSignInWithPassword } }),
}));

import LoginPage from './page';

function fillForm(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('이메일'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: password } });
}

describe('LoginPage (UX-001)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParamsGet.mockReturnValue(null);
  });

  it('이메일 또는 비밀번호가 비어 있으면 제출 버튼이 비활성 상태다', () => {
    render(<LoginPage />);
    const button = screen.getByRole('button', { name: '로그인' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('로그인 성공 시 signInWithPassword를 호출하고 원래 요청 경로(from)로 이동한다', async () => {
    mockSearchParamsGet.mockReturnValue('/ticket');
    mockSignInWithPassword.mockResolvedValue({ data: {}, error: null });
    render(<LoginPage />);

    fillForm('user@example.com', 'password123');
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/ticket');
    });
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'password123',
    });
  });

  it('from이 없으면 기본 랜딩(/mediate)으로 이동한다', async () => {
    mockSearchParamsGet.mockReturnValue(null);
    mockSignInWithPassword.mockResolvedValue({ data: {}, error: null });
    render(<LoginPage />);

    fillForm('user@example.com', 'password123');
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/mediate');
    });
  });

  it('Critical 1(오픈 리다이렉트) — from이 절대 URL이면 기본 랜딩(/mediate)으로 폴백한다', async () => {
    mockSearchParamsGet.mockReturnValue('https://evil.com');
    mockSignInWithPassword.mockResolvedValue({ data: {}, error: null });
    render(<LoginPage />);

    fillForm('user@example.com', 'password123');
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/mediate');
    });
    expect(mockPush).not.toHaveBeenCalledWith('https://evil.com');
  });

  it('Critical 1(오픈 리다이렉트) — from이 //evil.com(프로토콜 상대 URL)이면 기본 랜딩(/mediate)으로 폴백한다', async () => {
    mockSearchParamsGet.mockReturnValue('//evil.com');
    mockSignInWithPassword.mockResolvedValue({ data: {}, error: null });
    render(<LoginPage />);

    fillForm('user@example.com', 'password123');
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/mediate');
    });
    expect(mockPush).not.toHaveBeenCalledWith('//evil.com');
  });

  it('자격 증명이 올바르지 않으면 고정 문구 배너를 보여준다(docs/API.md AUTH_INVALID_CREDENTIALS 매핑)', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: {},
      error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
    });
    render(<LoginPage />);

    fillForm('user@example.com', 'wrong-password');
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(
        '이메일 또는 비밀번호가 올바르지 않습니다',
      );
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  // Major 2(reviewer 5차 REJECTED → 수정) — show/hide 토글은 `docs/UX.md:361`(UX-002 가입)에만
  // 명시돼 있고 UX-001(로그인) Accessibility(`docs/UX.md:330` — Tab order: email→password→
  // submit→sign-up link, 토글 언급 없음)에는 없다. 로그인 화면에 없는 걸 넣으면 UX.md가 정한
  // Tab 순서가 어긋난다. 이 화면에는 토글이 없다는 것을 단언한다(회귀 방지 — 이전 라운드에
  // "로그인·가입 양쪽"이라는 과한 지시로 잘못 추가됐던 버튼).
  it('Major 2 — 비밀번호 필드에 show/hide 토글이 없다(docs/UX.md:330 — UX-001은 요구하지 않는다)', () => {
    render(<LoginPage />);
    const passwordInput = screen.getByLabelText('비밀번호') as HTMLInputElement;
    expect(passwordInput.type).toBe('password');
    expect(screen.queryByRole('button', { name: '비밀번호 보기' })).toBeNull();
    expect(screen.queryByRole('button', { name: '비밀번호 숨기기' })).toBeNull();
  });

  // Major 4(reviewer 5차 REJECTED → 수정) — `docs/UX.md:327` States: "Success: brief
  // confirmation, then redirect." 이전에는 확인 표시 없이 곧장 `router.push()`했다.
  it('Major 4 — 로그인 성공 시 확인 메시지를 먼저 보여준 뒤 이동한다(docs/UX.md:327)', async () => {
    mockSignInWithPassword.mockResolvedValue({ data: {}, error: null });
    render(<LoginPage />);

    fillForm('user@example.com', 'password123');
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));

    await waitFor(() => {
      expect(screen.getByText('로그인되었습니다')).toBeTruthy();
    });
    // 확인 메시지가 보이는 시점에는 아직 이동하지 않았다 — "먼저 보여준 뒤" 이동이어야 한다.
    expect(mockPush).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/mediate');
    });
  });

  it('네트워크 오류 시 재시도 배너를 보여주고 입력값을 유지한다', async () => {
    mockSignInWithPassword.mockRejectedValue(new Error('network down'));
    render(<LoginPage />);

    fillForm('user@example.com', 'password123');
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy();
    });
    expect((screen.getByLabelText('이메일') as HTMLInputElement).value).toBe('user@example.com');
    expect((screen.getByLabelText('비밀번호') as HTMLInputElement).value).toBe('password123');
  });
});
