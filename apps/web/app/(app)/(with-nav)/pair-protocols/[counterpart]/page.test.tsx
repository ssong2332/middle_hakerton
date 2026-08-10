/**
 * UX-011 Pair Communication Protocol Screen — 상세(4항목 합의·저장, 배지). `docs/Tasks.md` T41.
 * AC-037, AC-075.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('next/navigation', () => ({
  useParams: () => ({ counterpart: 'tanaka%40sakuradigital.example' }),
}));

import PairProtocolCounterpartPage from './page';

function jsonOk(body: unknown) {
  return { ok: true, json: async () => body };
}

const UNTOUCHED_RECORD = {
  pairKey: 'k',
  counterpart: 'tanaka@sakuradigital.example',
  directnessAllowed: null,
  emojiPolicy: null,
  addressForm: null,
  deadlineStyle: null,
  authorshipState: 'untouched',
  updatedAt: new Date(0).toISOString(),
};

function mockLoadSuccess(record: unknown) {
  mockFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (method === 'GET' && url.startsWith('/api/protocol?counterpart=')) {
      return Promise.resolve(jsonOk(record));
    }
    return Promise.reject(new Error(`unexpected fetch: ${method} ${url}`));
  });
}

describe('PairProtocolCounterpartPage (UX-011 상세) — AC-037/AC-075', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Loading — 초기 렌더에서 스켈레톤을 보여준다', () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<PairProtocolCounterpartPage />);

    expect(screen.getByLabelText('쌍방 규약 불러오는 중')).toBeTruthy();
  });

  it('Error — 조회 실패 시 배너와 재시도 버튼을 보여준다', async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    render(<PairProtocolCounterpartPage />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
  });

  it('counterpart 파라미터를 디코딩해 GET 쿼리에 쓴다', async () => {
    mockLoadSuccess(UNTOUCHED_RECORD);
    render(<PairProtocolCounterpartPage />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/protocol?counterpart=tanaka%40sakuradigital.example',
      );
    });
  });

  it('Empty(untouched) — 배지가 "아직 정해지지 않음"을 보여주고 4항목은 비어 있다', async () => {
    mockLoadSuccess(UNTOUCHED_RECORD);
    render(<PairProtocolCounterpartPage />);

    await waitFor(() => {
      expect(screen.getByText('아직 정해지지 않음')).toBeTruthy();
    });
    expect((screen.getByLabelText('호칭') as HTMLInputElement).value).toBe('');
  });

  it('기존 값이 있으면 4항목·배지가 그대로 채워진다', async () => {
    mockLoadSuccess({
      ...UNTOUCHED_RECORD,
      directnessAllowed: 'yes',
      emojiPolicy: 'avoid',
      addressForm: '님',
      deadlineStyle: 'EOD',
      authorshipState: 'sender_confirmed',
    });
    render(<PairProtocolCounterpartPage />);

    await waitFor(() => {
      expect(screen.getByText('발신자가 확정')).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: '허용' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '사용 지양' }).getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByLabelText('호칭') as HTMLInputElement).value).toBe('님');
    expect((screen.getByLabelText('마감 표현') as HTMLInputElement).value).toBe('EOD');
  });

  it('Validation — 4항목이 모두 채워지기 전까지 저장 버튼이 비활성화된다', async () => {
    mockLoadSuccess(UNTOUCHED_RECORD);
    render(<PairProtocolCounterpartPage />);
    await waitFor(() => screen.getByRole('button', { name: '허용' }));

    expect(screen.getByRole('button', { name: '저장' }).hasAttribute('disabled')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '허용' }));
    fireEvent.click(screen.getByRole('button', { name: '사용 가능' }));
    fireEvent.change(screen.getByLabelText('호칭'), { target: { value: '님' } });
    expect(screen.getByRole('button', { name: '저장' }).hasAttribute('disabled')).toBe(true);

    fireEvent.change(screen.getByLabelText('마감 표현'), { target: { value: 'EOD' } });
    expect(screen.getByRole('button', { name: '저장' }).hasAttribute('disabled')).toBe(false);
  });

  it('저장을 누르면 PUT으로 4항목을 보내고 응답의 배지로 갱신한다', async () => {
    mockLoadSuccess(UNTOUCHED_RECORD);
    mockFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'GET') return Promise.resolve(jsonOk(UNTOUCHED_RECORD));
      if (method === 'PUT' && url === '/api/protocol') {
        return Promise.resolve(
          jsonOk({
            ...UNTOUCHED_RECORD,
            directnessAllowed: 'yes',
            emojiPolicy: 'ok',
            addressForm: '님',
            deadlineStyle: 'EOD',
            authorshipState: 'sender_confirmed',
          }),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${method} ${url}`));
    });
    render(<PairProtocolCounterpartPage />);
    await waitFor(() => screen.getByRole('button', { name: '허용' }));

    fireEvent.click(screen.getByRole('button', { name: '허용' }));
    fireEvent.click(screen.getByRole('button', { name: '사용 가능' }));
    fireEvent.change(screen.getByLabelText('호칭'), { target: { value: '님' } });
    fireEvent.change(screen.getByLabelText('마감 표현'), { target: { value: 'EOD' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => {
      expect(screen.getByText('발신자가 확정')).toBeTruthy();
    });
    const putCall = mockFetch.mock.calls.find((call) => call[1]?.method === 'PUT');
    expect(JSON.parse(putCall![1].body)).toEqual({
      counterpart: 'tanaka@sakuradigital.example',
      directnessAllowed: 'yes',
      emojiPolicy: 'ok',
      addressForm: '님',
      deadlineStyle: 'EOD',
    });
    expect(screen.getByText('저장됨')).toBeTruthy();
  });

  it('저장 실패 시 인라인 에러를 보여주고 입력값은 유지한다', async () => {
    mockLoadSuccess({
      ...UNTOUCHED_RECORD,
      directnessAllowed: 'yes',
      emojiPolicy: 'ok',
      addressForm: '님',
      deadlineStyle: 'EOD',
    });
    mockFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'GET') {
        return Promise.resolve(
          jsonOk({
            ...UNTOUCHED_RECORD,
            directnessAllowed: 'yes',
            emojiPolicy: 'ok',
            addressForm: '님',
            deadlineStyle: 'EOD',
          }),
        );
      }
      if (method === 'PUT') {
        return Promise.resolve({ ok: false, json: async () => ({}) });
      }
      return Promise.reject(new Error(`unexpected fetch: ${method} ${url}`));
    });
    render(<PairProtocolCounterpartPage />);
    await waitFor(() => screen.getByRole('button', { name: '저장' }));

    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe('저장하지 못했습니다, 다시 시도해주세요');
    });
    expect((screen.getByLabelText('호칭') as HTMLInputElement).value).toBe('님');
  });
});
