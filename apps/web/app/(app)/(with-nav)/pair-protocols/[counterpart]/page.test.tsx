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

function mockLoadSuccess(record: unknown, mismatches: unknown = { axes: [] }) {
  mockFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (method === 'GET' && url.startsWith('/api/protocol/mismatches?counterpart=')) {
      return Promise.resolve(jsonOk(mismatches));
    }
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
      if (method === 'GET' && url.startsWith('/api/protocol/mismatches?counterpart=')) {
        return Promise.resolve(jsonOk({ axes: [] }));
      }
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
      if (method === 'GET' && url.startsWith('/api/protocol/mismatches?counterpart=')) {
        return Promise.resolve(jsonOk({ axes: [] }));
      }
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

describe('PairProtocolCounterpartPage — MismatchBanner (T69/UF-022, AC-079/AC-083)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('불일치가 없으면 배너를 렌더하지 않는다', async () => {
    mockLoadSuccess(UNTOUCHED_RECORD, { axes: [] });
    render(<PairProtocolCounterpartPage />);

    await waitFor(() => screen.getByText('아직 정해지지 않음'));
    expect(screen.queryByText('합의된 규칙과 관측이 다릅니다. 확인해 보시겠어요?')).toBeNull();
  });

  it('이모지 축이 불일치면 이모지 필드 위에 고정 문구 배너를 보여준다(판정 문구 아님)', async () => {
    mockLoadSuccess(UNTOUCHED_RECORD, {
      axes: [
        { axis: 'emoji', mismatched: true, comparison: '규약: 이모지 사용 지양 · 관측: 이모지 5건', sampleCount: 5, sources: ['manual'] },
      ],
    });
    render(<PairProtocolCounterpartPage />);

    await waitFor(() => {
      expect(screen.getByText('합의된 규칙과 관측이 다릅니다. 확인해 보시겠어요?')).toBeTruthy();
    });
    expect(screen.queryByText(/규약: 이모지 사용 지양/)).toBeNull();
  });

  it('"확인"을 누르면 집계 어휘만 담은 비교 문장이 펼쳐진다(원문 인용 없음)', async () => {
    mockLoadSuccess(UNTOUCHED_RECORD, {
      axes: [
        {
          axis: 'directness',
          mismatched: true,
          comparison: '규약: 직설 허용 · 관측: 완곡 표현 3건 (표본 5건)',
          sampleCount: 5,
          sources: ['manual'],
        },
      ],
    });
    render(<PairProtocolCounterpartPage />);
    await waitFor(() => screen.getByText('합의된 규칙과 관측이 다릅니다. 확인해 보시겠어요?'));

    fireEvent.click(screen.getByRole('button', { name: '확인' }));

    expect(screen.getByText('규약: 직설 허용 · 관측: 완곡 표현 3건 (표본 5건)')).toBeTruthy();
  });

  it('"나중에"를 누르면 배너가 사라지고 값은 바뀌지 않는다(AC-079⑤)', async () => {
    mockLoadSuccess(UNTOUCHED_RECORD, {
      axes: [
        { axis: 'emoji', mismatched: true, comparison: '규약: 이모지 사용 지양 · 관측: 이모지 5건', sampleCount: 5, sources: ['manual'] },
      ],
    });
    render(<PairProtocolCounterpartPage />);
    await waitFor(() => screen.getByText('합의된 규칙과 관측이 다릅니다. 확인해 보시겠어요?'));

    fireEvent.click(screen.getByRole('button', { name: '나중에' }));

    expect(screen.queryByText('합의된 규칙과 관측이 다릅니다. 확인해 보시겠어요?')).toBeNull();
  });

  it('저장을 누르면(값 변경 없이도) 배너가 전부 지워진다', async () => {
    mockFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'GET' && url.startsWith('/api/protocol/mismatches?counterpart=')) {
        return Promise.resolve(
          jsonOk({
            axes: [
              { axis: 'emoji', mismatched: true, comparison: 'x', sampleCount: 5, sources: ['manual'] },
            ],
          }),
        );
      }
      if (method === 'GET') {
        return Promise.resolve(
          jsonOk({
            ...UNTOUCHED_RECORD,
            directnessAllowed: 'yes',
            emojiPolicy: 'avoid',
            addressForm: '님',
            deadlineStyle: 'EOD',
          }),
        );
      }
      if (method === 'PUT') {
        return Promise.resolve(
          jsonOk({
            ...UNTOUCHED_RECORD,
            directnessAllowed: 'yes',
            emojiPolicy: 'avoid',
            addressForm: '님',
            deadlineStyle: 'EOD',
            authorshipState: 'sender_confirmed',
          }),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${method} ${url}`));
    });
    render(<PairProtocolCounterpartPage />);
    await waitFor(() => screen.getByText('합의된 규칙과 관측이 다릅니다. 확인해 보시겠어요?'));

    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(screen.getByText('저장됨')).toBeTruthy());
    expect(screen.queryByText('합의된 규칙과 관측이 다릅니다. 확인해 보시겠어요?')).toBeNull();
  });

  it('불일치 조회 실패는 에러가 아니다 — 배너 영역이 그냥 렌더되지 않는다', async () => {
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/protocol/mismatches?counterpart=')) {
        return Promise.resolve({ ok: false, json: async () => ({}) });
      }
      return Promise.resolve(jsonOk(UNTOUCHED_RECORD));
    });
    render(<PairProtocolCounterpartPage />);

    await waitFor(() => screen.getByText('아직 정해지지 않음'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('합의된 규칙과 관측이 다릅니다. 확인해 보시겠어요?')).toBeNull();
  });
});
