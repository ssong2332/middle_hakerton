/**
 * T65 — UX-018 Stage 1(조회) + Stage 2 일부(관측, AC-071만). AC-065(자동 확정 금지·미등록·출처
 * 표시), AC-071(활동 시간대 후보), AC-072④(성향 서술 금지 — 이 파일 전체에 성향/성격 단어를
 * 담은 assertion이 없다). `/api/enrichment*`는 전부 모킹한다 — 각 라우트 자체의 배선은
 * `apps/web/app/api/enrichment/route.test.ts`/`.../fetch/route.test.ts`가 이미 검증한다.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RecipientEnrichmentModal } from './RecipientEnrichmentModal';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const EMPTY_GET_RESPONSE = {
  location: null,
  company: null,
  activityHourHistogram: null,
  activitySampleCount: null,
  activityTimezoneConfirmed: null,
  timezoneCandidates: [],
  activityTimeCandidate: null,
  fetchedAt: null,
  sourceUrl: null,
  showEnrichmentLink: true,
};

function jsonOk(body: unknown) {
  return { ok: true, json: async () => body };
}

describe('RecipientEnrichmentModal (UX-018 Stage 1/2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue(jsonOk(EMPTY_GET_RESPONSE));
  });

  it('open=false면 아무것도 렌더하지 않고 네트워크 호출도 없다', () => {
    render(<RecipientEnrichmentModal open={false} recipient="boss@example.com" onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('open=true면 role="dialog"로 렌더되고 이전 저장값을 재조회한다(GET /api/enrichment)', async () => {
    render(<RecipientEnrichmentModal open={true} recipient="boss@example.com" onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: '상대방 정보 보강' })).toBeTruthy();
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(mockFetch).toHaveBeenCalledWith('/api/enrichment?recipient=boss%40example.com');
  });

  it('Empty — 저장된 값이 없으면 결과 박스·관측 박스·후보 목록을 렌더하지 않는다', async () => {
    render(<RecipientEnrichmentModal open={true} recipient="boss@example.com" onClose={vi.fn()} />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    expect(screen.queryByText('미등록')).toBeNull();
    expect(screen.queryByText(/타임존 후보/)).toBeNull();
  });

  it('조회 버튼은 URL이 비어 있으면 비활성화된다', async () => {
    render(<RecipientEnrichmentModal open={true} recipient="boss@example.com" onClose={vi.fn()} />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    expect((screen.getByRole('button', { name: '조회' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Result — 조회 성공 시 location/company를 그대로 보여주고, 값이 없으면 "미등록"을 보여준다', async () => {
    render(<RecipientEnrichmentModal open={true} recipient="boss@example.com" onClose={vi.fn()} />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    mockFetch.mockResolvedValueOnce(
      jsonOk({
        location: 'Seoul, Korea',
        company: null,
        activityHourHistogram: null,
        activitySampleCount: 5,
        timezoneCandidates: ['Asia/Seoul'],
        fetchedAt: '2026-08-11T00:00:00Z',
        sourceUrl: 'https://github.com/octocat',
      }),
    );
    fireEvent.change(screen.getByLabelText('공개 프로필 URL(GitHub)'), {
      target: { value: 'https://github.com/octocat' },
    });
    fireEvent.click(screen.getByRole('button', { name: '조회' }));

    await waitFor(() => {
      expect(screen.getByText('Seoul, Korea')).toBeTruthy();
      expect(screen.getByText('미등록')).toBeTruthy(); // company
    });
    expect(mockFetch).toHaveBeenLastCalledWith(
      '/api/enrichment/fetch',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse((mockFetch.mock.calls[1][1] as RequestInit).body as string);
    expect(body).toEqual({ recipient: 'boss@example.com', profileUrl: 'https://github.com/octocat' });
  });

  it('AC-065⑥ — 출처 URL과 조회 시각이 함께 표시된다', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonOk({
        ...EMPTY_GET_RESPONSE,
        location: 'Seoul',
        fetchedAt: '2026-08-11T05:30:00Z',
        sourceUrl: 'https://github.com/octocat',
      }),
    );
    render(<RecipientEnrichmentModal open={true} recipient="boss@example.com" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/출처: https:\/\/github\.com\/octocat/)).toBeTruthy();
    });
  });

  it('AC-071 — 관측: 활동 시간대 후보가 있으면 표본 수와 함께 사실 문장으로 표시한다(성향 서술 없음)', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonOk({
        ...EMPTY_GET_RESPONSE,
        activityHourHistogram: new Array(24).fill(0),
        activitySampleCount: 30,
        activityTimeCandidate: 'UTC 09:00–10:00',
      }),
    );
    render(<RecipientEnrichmentModal open={true} recipient="boss@example.com" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/UTC 09:00–10:00에 가장 많습니다 \(표본 30건\)/)).toBeTruthy();
    });
  });

  it('AC-071② — 표본 부족(histogram null)이면 "표본 부족" 문구를 보여주고 후보를 만들지 않는다', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonOk({ ...EMPTY_GET_RESPONSE, activityHourHistogram: null, activitySampleCount: 5 }),
    );
    render(<RecipientEnrichmentModal open={true} recipient="boss@example.com" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/표본 부족으로 활동 시간대를 산출하지 않았습니다 \(현재 표본 5건\)/)).toBeTruthy();
    });
    expect(screen.queryByText(/타임존 후보/)).toBeNull();
  });

  it('AC-065④/AC-071③ — 후보를 고르기만 해서는 저장되지 않고, "확정"을 눌러야 PUT이 호출된다', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonOk({
        ...EMPTY_GET_RESPONSE,
        location: 'Seoul',
        timezoneCandidates: ['Asia/Seoul'],
      }),
    );
    render(<RecipientEnrichmentModal open={true} recipient="boss@example.com" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Asia/Seoul')).toBeTruthy());

    fireEvent.click(screen.getByRole('radio', { name: 'Asia/Seoul' }));
    // 선택만으로는 아직 PUT을 호출하지 않는다(자동 확정 금지).
    expect(mockFetch).toHaveBeenCalledTimes(1);

    mockFetch.mockResolvedValueOnce(
      jsonOk({ ...EMPTY_GET_RESPONSE, location: 'Seoul', activityTimezoneConfirmed: 'Asia/Seoul' }),
    );
    fireEvent.click(screen.getByRole('button', { name: '확정' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/enrichment',
        expect.objectContaining({ method: 'PUT' }),
      );
    });
    const body = JSON.parse((mockFetch.mock.calls[1][1] as RequestInit).body as string);
    expect(body).toEqual({ recipient: 'boss@example.com', activityTimezoneConfirmed: 'Asia/Seoul' });
  });

  it('데이터 최소화 — "보강 정보 삭제" 클릭 시 DELETE를 호출하고 값을 초기화한다', async () => {
    mockFetch.mockResolvedValueOnce(jsonOk({ ...EMPTY_GET_RESPONSE, location: 'Seoul' }));
    render(<RecipientEnrichmentModal open={true} recipient="boss@example.com" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Seoul')).toBeTruthy());

    mockFetch.mockResolvedValueOnce(jsonOk({ deleted: true }));
    fireEvent.click(screen.getByRole('button', { name: '보강 정보 삭제' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/enrichment?recipient=boss%40example.com',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
    await waitFor(() => expect(screen.queryByText('Seoul')).toBeNull());
  });

  it('Accessibility — Escape는 onClose를 호출한다', async () => {
    const onClose = vi.fn();
    render(<RecipientEnrichmentModal open={true} recipient="boss@example.com" onClose={onClose} />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('닫기 버튼 — onClose를 호출한다', async () => {
    const onClose = vi.fn();
    render(<RecipientEnrichmentModal open={true} recipient="boss@example.com" onClose={onClose} />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('제3자 개인정보 수집 문구 — "분석했다"류 서술이 없다', async () => {
    render(<RecipientEnrichmentModal open={true} recipient="boss@example.com" onClose={vi.fn()} />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    expect(screen.queryByText(/분석했/)).toBeNull();
  });
});
