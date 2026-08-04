import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockSignOut = vi.fn();
vi.mock('../lib/supabase/browser', () => ({
  createClient: () => ({ auth: { signOut: mockSignOut } }),
}));

import { LogoutButton } from './LogoutButton';

describe('LogoutButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('클릭하면 supabase signOut을 호출하고 로그인 화면으로 이동한다', async () => {
    mockSignOut.mockResolvedValue({ error: null });
    render(<LogoutButton />);

    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
  });
});
