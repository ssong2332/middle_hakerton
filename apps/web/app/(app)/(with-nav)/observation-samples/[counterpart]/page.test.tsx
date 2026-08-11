/**
 * UX-019 Observation Sample Management Screen — SampleList + DeleteConfirm. `docs/Tasks.md` T72.
 * AC-081②(원문 절대 노출 금지)·④(삭제 시 재집계). `pair-protocols/[counterpart]/page.test.tsx`,
 * `terminology/page.test.tsx`(삭제 확인 플로우)와 같은 모킹 정책.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('next/navigation', () => ({
  useParams: () => ({ counterpart: 'tanaka%40sakuradigital.example' }),
}));

import ObservationSamplesCounterpartPage from './page';

function jsonOk(body: unknown) {
  return { ok: true, json: async () => body };
}

const SAMPLE_DELTAS = {
  sentenceCount: 2,
  emojiCount: 0,
  charCount: 20,
  hedgeCount: 1,
  addressFormKind: null,
  deadlineMentionKind: null,
};

const SAMPLES = [
  {
    id: 's1',
    counterpart: 'tanaka@sakuradigital.example',
    source: 'manual' as const,
    collectedAt: '2026-08-11T00:00:00Z',
    indicatorContribution: SAMPLE_DELTAS,
  },
  {
    id: 's2',
    counterpart: 'tanaka@sakuradigital.example',
    source: 'github' as const,
    collectedAt: '2026-08-11T01:00:00Z',
    indicatorContribution: SAMPLE_DELTAS,
  },
  {
    id: 's3',
    counterpart: 'michael@vertexlabs.example',
    source: 'manual' as const,
    collectedAt: '2026-08-11T02:00:00Z',
    indicatorContribution: SAMPLE_DELTAS,
  },
];

function mockLoadSuccess() {
  mockFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url === '/api/samples' && method === 'GET') {
      return Promise.resolve(jsonOk({ counterparts: [], samples: SAMPLES }));
    }
    return Promise.reject(new Error(`unexpected fetch: ${url} ${method}`));
  });
}

describe('ObservationSamplesCounterpartPage (UX-019 상세) — AC-081②④', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Loading — 초기 렌더에서 스켈레톤을 보여준다', () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<ObservationSamplesCounterpartPage />);

    expect(screen.getByLabelText('관측 표본 불러오는 중')).toBeTruthy();
  });

  it('Error — 조회 실패 시 배너와 재시도 버튼을 보여준다', async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    render(<ObservationSamplesCounterpartPage />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy();
  });

  it('전체 표본 중 이 상대(URL 디코딩된 counterpart)에 해당하는 것만 필터링해 보여준다', async () => {
    mockLoadSuccess();
    render(<ObservationSamplesCounterpartPage />);

    await waitFor(() => screen.getByText('수동 표시'));
    expect(screen.getByText('GitHub')).toBeTruthy();
    // michael 표본(s3)은 렌더되지 않는다 — 화면 텍스트에 그 상대 식별자가 없다.
    expect(screen.queryByText(/michael@vertexlabs/)).toBeNull();
  });

  it('Empty — 이 상대의 표본이 없으면 안내 문구를 보여준다', async () => {
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/samples') return Promise.resolve(jsonOk({ counterparts: [], samples: [] }));
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    render(<ObservationSamplesCounterpartPage />);

    await waitFor(() => {
      expect(screen.getByText('이 상대에 대해 수집된 표본이 없습니다')).toBeTruthy();
    });
  });

  it('AC-081② — 출처와 수집 시각만 렌더한다(원문/인용문은 데이터에 없다)', async () => {
    mockLoadSuccess();
    render(<ObservationSamplesCounterpartPage />);

    await waitFor(() => screen.getByText('수동 표시'));
    expect(screen.getByText(new Date('2026-08-11T00:00:00Z').toLocaleString())).toBeTruthy();
  });

  it('DeleteConfirm — 삭제 클릭 시 확인 문구가 뜨고, 취소하면 아무 요청도 보내지 않는다', async () => {
    mockLoadSuccess();
    render(<ObservationSamplesCounterpartPage />);
    await waitFor(() => screen.getByText('수동 표시'));

    fireEvent.click(screen.getAllByRole('button', { name: '삭제' })[0]);

    expect(screen.getByText('이 표본을 삭제하시겠습니까?')).toBeTruthy();
    const deleteCallsBefore = mockFetch.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'DELETE').length;
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    const deleteCallsAfter = mockFetch.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'DELETE').length;
    expect(deleteCallsAfter).toBe(deleteCallsBefore);
  });

  it('삭제 확정 시 DELETE /api/samples/{id}를 호출하고 성공하면 목록에서 사라진다', async () => {
    mockFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url === '/api/samples' && method === 'GET') {
        return Promise.resolve(jsonOk({ counterparts: [], samples: SAMPLES }));
      }
      if (url === '/api/samples/s1' && method === 'DELETE') {
        return Promise.resolve(jsonOk({ id: 's1' }));
      }
      return Promise.reject(new Error(`unexpected fetch: ${url} ${method}`));
    });
    render(<ObservationSamplesCounterpartPage />);
    await waitFor(() => screen.getByText('수동 표시'));

    fireEvent.click(screen.getAllByRole('button', { name: '삭제' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: '삭제' })[0]);

    await waitFor(() => {
      expect(screen.queryByText('이 표본을 삭제하시겠습니까?')).toBeNull();
    });
    expect(screen.getAllByRole('button', { name: '삭제' })).toHaveLength(1);
  });

  it('삭제 실패 시 인라인 에러를 보여주고 표본을 목록에 유지한다', async () => {
    mockFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url === '/api/samples' && method === 'GET') {
        return Promise.resolve(jsonOk({ counterparts: [], samples: SAMPLES }));
      }
      if (url === '/api/samples/s1' && method === 'DELETE') {
        return Promise.resolve({ ok: false, json: async () => ({}) });
      }
      return Promise.reject(new Error(`unexpected fetch: ${url} ${method}`));
    });
    render(<ObservationSamplesCounterpartPage />);
    await waitFor(() => screen.getByText('수동 표시'));

    fireEvent.click(screen.getAllByRole('button', { name: '삭제' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: '삭제' })[0]);

    await waitFor(() => {
      expect(screen.getByText('삭제하지 못했습니다, 다시 시도해주세요')).toBeTruthy();
    });
    expect(screen.getAllByRole('button', { name: '삭제' }).length).toBeGreaterThan(0);
  });
});
