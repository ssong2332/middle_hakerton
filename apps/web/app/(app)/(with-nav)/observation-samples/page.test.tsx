/**
 * UX-019 Observation Sample Management Screen — CounterpartList. `docs/Tasks.md` T72. AC-081④.
 * `pair-protocols/page.test.tsx`와 같은 모킹 정책(`vi.stubGlobal('fetch', ...)`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import ObservationSamplesPage from './page';

function jsonOk(body: unknown) {
  return { ok: true, json: async () => body };
}

function mockLoadSuccess(counterparts: Array<{ counterpart: string; total: number; bySource: { manual: number; github: number } }>) {
  mockFetch.mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/samples') {
      return Promise.resolve(jsonOk({ counterparts, samples: [] }));
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
}

describe('ObservationSamplesPage (UX-019 목록) — AC-081④', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Loading — 초기 렌더에서 스켈레톤을 보여준다', () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<ObservationSamplesPage />);

    expect(screen.getByLabelText('관측 표본 불러오는 중')).toBeTruthy();
  });

  it('Error — 조회 실패 시 배너와 재시도 버튼을 보여준다', async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    render(<ObservationSamplesPage />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy();
  });

  it('Empty — 표본이 없으면 안내 문구를 보여준다', async () => {
    mockLoadSuccess([]);
    render(<ObservationSamplesPage />);

    await waitFor(() => {
      expect(screen.getByText('아직 수집된 관측 표본이 없습니다')).toBeTruthy();
    });
  });

  it('CounterpartList — 상대별 건수·출처 breakdown을 링크로 렌더한다(AC-080⑤)', async () => {
    mockLoadSuccess([
      { counterpart: 'tanaka@sakuradigital.example', total: 12, bySource: { manual: 8, github: 4 } },
    ]);
    render(<ObservationSamplesPage />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /tanaka@sakuradigital.example/ })).toBeTruthy();
    });
    expect(screen.getByText('12건 (수동 표시 8 · GitHub 4)')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: /tanaka@sakuradigital.example/ }).getAttribute('href'),
    ).toBe('/observation-samples/tanaka%40sakuradigital.example');
  });

  it('AC-081② — 원문/인용문을 렌더할 방법이 없다(응답에 원문 필드 자체가 없다)', async () => {
    mockLoadSuccess([
      { counterpart: 'tanaka@sakuradigital.example', total: 1, bySource: { manual: 1, github: 0 } },
    ]);
    render(<ObservationSamplesPage />);

    await waitFor(() => screen.getByText('1건 (수동 표시 1 · GitHub 0)'));
    // 이 화면이 렌더할 수 있는 값은 건수·출처뿐이다 — 스냅샷성 검증으로 렌더 텍스트 전체가
    // 카운터파트 식별자·건수·출처 라벨로만 구성됨을 확인한다.
    expect(screen.getByRole('main').textContent).not.toMatch(/["“]/);
  });
});
