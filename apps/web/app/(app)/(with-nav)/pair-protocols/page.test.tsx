/**
 * UX-011 Pair Communication Protocol Screen — 목록/진입 화면. `docs/Tasks.md` T41. AC-037.
 * `terminology/page.test.tsx`와 같은 모킹 정책(`vi.stubGlobal('fetch', ...)`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

import PairProtocolsPage from './page';

function jsonOk(body: unknown) {
  return { ok: true, json: async () => body };
}

function mockLoadSuccess(counterparts: string[]) {
  mockFetch.mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/pair-protocols') {
      return Promise.resolve(jsonOk({ counterparts }));
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
}

describe('PairProtocolsPage (UX-011 목록) — AC-037', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Loading — 초기 렌더에서 스켈레톤을 보여준다', () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<PairProtocolsPage />);

    expect(screen.getByLabelText('쌍방 규약 불러오는 중')).toBeTruthy();
  });

  it('Error — 조회 실패 시 배너와 재시도 버튼을 보여준다', async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    render(<PairProtocolsPage />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy();
  });

  it('Empty — 등록된 상대가 없으면 안내 문구를 보여준다', async () => {
    mockLoadSuccess([]);
    render(<PairProtocolsPage />);

    await waitFor(() => {
      expect(screen.getByText('아직 등록된 상대가 없습니다. 아래에서 상대를 지정해 규약을 시작하세요')).toBeTruthy();
    });
  });

  it('Success — 상대 목록을 링크로 렌더한다', async () => {
    mockLoadSuccess(['tanaka@sakuradigital.example']);
    render(<PairProtocolsPage />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'tanaka@sakuradigital.example' })).toBeTruthy();
    });
    expect(
      screen.getByRole('link', { name: 'tanaka@sakuradigital.example' }).getAttribute('href'),
    ).toBe('/pair-protocols/tanaka%40sakuradigital.example');
  });

  it('Validation — 이메일 형식이 아니면 열기를 눌러도 에러만 뜨고 이동하지 않는다', async () => {
    mockLoadSuccess([]);
    render(<PairProtocolsPage />);
    await waitFor(() => screen.getByLabelText('상대 이메일'));

    fireEvent.change(screen.getByLabelText('상대 이메일'), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: '열기' }));

    expect(screen.getByRole('alert').textContent).toBe('올바른 이메일 형식이 아닙니다');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('상대 이메일을 입력하고 열기를 누르면 상세 화면으로 이동한다', async () => {
    mockLoadSuccess([]);
    render(<PairProtocolsPage />);
    await waitFor(() => screen.getByLabelText('상대 이메일'));

    fireEvent.change(screen.getByLabelText('상대 이메일'), {
      target: { value: 'tanaka@sakuradigital.example' },
    });
    fireEvent.click(screen.getByRole('button', { name: '열기' }));

    expect(mockPush).toHaveBeenCalledWith('/pair-protocols/tanaka%40sakuradigital.example');
  });

  it('입력이 비어 있으면 열기 버튼이 비활성화된다', async () => {
    mockLoadSuccess([]);
    render(<PairProtocolsPage />);
    await waitFor(() => screen.getByLabelText('상대 이메일'));

    expect(screen.getByRole('button', { name: '열기' }).hasAttribute('disabled')).toBe(true);
  });
});
