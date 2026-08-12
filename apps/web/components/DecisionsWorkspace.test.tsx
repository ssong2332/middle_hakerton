/**
 * T27 — `DecisionsWorkspace` (UX-008 Decision Summary & Unresolved Detector View 본체).
 * AC-019, AC-020(UX.md Failure 행이 명시하는 규칙, `docs/Tasks.md` T27 AC 열 자체에는 없음 —
 * 구현 보고에 이 갭을 별도로 표시), AC-038, AC-050, AC-064②③.
 *
 * `docs/UX.md` UX-008 States: Loading(요약 생성 중) / Empty(스레드 텍스트 미입력, 첫 Generate
 * 클릭 전) / Error(요약 실패, 재시도, 입력 보존) / Result(Decision/Owner/Deadline/결정 권한 상태
 * 표 + 별도 미확정 경고 목록).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

import { DecisionsWorkspace } from './DecisionsWorkspace';

function summaryResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: async () => ({
      decisions: [
        {
          decision: '배포 일정을 다음 주 화요일로 연기한다',
          owner: '김OO',
          dueDate: '2026-08-11',
          authorityStatus: '확정',
          authorityEvidence: '"제가 최종 승인했습니다"라는 문장에서 확정임을 알 수 있습니다.',
        },
        {
          decision: '예산안 검토 담당자를 정한다',
          owner: null,
          dueDate: null,
          authorityStatus: '불명',
          authorityEvidence: null,
        },
      ],
      unresolved: [
        { decision: '예산안 검토 담당자를 정한다', missingFields: ['owner', 'dueDate'] },
      ],
      source: 'live',
      ...overrides,
    }),
  };
}

describe('DecisionsWorkspace', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('Empty — 초기 상태에서는 스레드 텍스트 입력창과 비활성화된 요약 만들기 버튼을 보여준다', () => {
    render(<DecisionsWorkspace />);

    expect(screen.getByRole('textbox', { name: '스레드 텍스트' })).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: '요약 만들기' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('Validation — 텍스트를 입력하면 요약 만들기 버튼이 활성화된다', () => {
    render(<DecisionsWorkspace />);

    fireEvent.change(screen.getByRole('textbox', { name: '스레드 텍스트' }), {
      target: { value: '스레드 원문' },
    });

    expect(
      (screen.getByRole('button', { name: '요약 만들기' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('Loading — 요약 만들기 클릭 시 POST /api/summary를 호출하고 진행 중 상태를 보여준다', () => {
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);

    render(<DecisionsWorkspace />);
    fireEvent.change(screen.getByRole('textbox', { name: '스레드 텍스트' }), {
      target: { value: '스레드 원문' },
    });
    fireEvent.click(screen.getByRole('button', { name: '요약 만들기' }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/summary',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ threadText: '스레드 원문', context: { channel: 'web' } }),
      }),
    );
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('Error — 요약 API가 실패하면 오류 배너를 보여주고 스레드 텍스트는 보존한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    render(<DecisionsWorkspace />);
    fireEvent.change(screen.getByRole('textbox', { name: '스레드 텍스트' }), {
      target: { value: '스레드 원문' },
    });
    fireEvent.click(screen.getByRole('button', { name: '요약 만들기' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
    expect(
      (screen.getByRole('textbox', { name: '스레드 텍스트' }) as HTMLTextAreaElement).value,
    ).toBe('스레드 원문');
  });

  it('Error — 재시도 버튼을 누르면 같은 텍스트로 다시 호출한다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce(summaryResponse());
    vi.stubGlobal('fetch', fetchMock);

    render(<DecisionsWorkspace />);
    fireEvent.change(screen.getByRole('textbox', { name: '스레드 텍스트' }), {
      target: { value: '스레드 원문' },
    });
    fireEvent.click(screen.getByRole('button', { name: '요약 만들기' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /다시 시도/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/summary',
      expect.objectContaining({
        body: JSON.stringify({ threadText: '스레드 원문', context: { channel: 'web' } }),
      }),
    );
  });

  it('AC-019/AC-050②/AC-064② — Result 표에 Decision/Owner/Deadline/결정 권한 상태 4개 열이 렌더되고, 근거 있는 판정값도 그대로 보여준다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(summaryResponse());
    vi.stubGlobal('fetch', fetchMock);

    render(<DecisionsWorkspace />);
    fireEvent.change(screen.getByRole('textbox', { name: '스레드 텍스트' }), {
      target: { value: '스레드 원문' },
    });
    fireEvent.click(screen.getByRole('button', { name: '요약 만들기' }));

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeTruthy();
    });

    const headers = screen.getAllByRole('columnheader').map((el) => el.textContent);
    expect(headers).toEqual(['Decision', 'Owner', 'Deadline', '결정 권한 상태']);

    const rows = screen.getAllByRole('row');
    // rows[0]는 헤더 행
    const firstDataRow = within(rows[1]);
    expect(firstDataRow.getByText('배포 일정을 다음 주 화요일로 연기한다')).toBeTruthy();
    expect(firstDataRow.getByText('김OO')).toBeTruthy();
    expect(firstDataRow.getByText('2026-08-11')).toBeTruthy();
    expect(firstDataRow.getByText('확정')).toBeTruthy();
    // C-1 — AC-050②: 판정된 경우 근거 문장이 함께 표시된다(상태 텍스트만으로는 불충분).
    expect(
      firstDataRow.getByText(
        '"제가 최종 승인했습니다"라는 문장에서 확정임을 알 수 있습니다.',
      ),
    ).toBeTruthy();
  });

  it('C-1 — authorityStatus가 불명이고 authorityEvidence가 null이면 근거 문장 자리에 아무것도 지어내지 않는다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(summaryResponse());
    vi.stubGlobal('fetch', fetchMock);

    render(<DecisionsWorkspace />);
    fireEvent.change(screen.getByRole('textbox', { name: '스레드 텍스트' }), {
      target: { value: '스레드 원문' },
    });
    fireEvent.click(screen.getByRole('button', { name: '요약 만들기' }));

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeTruthy();
    });

    const rows = screen.getAllByRole('row');
    const secondDataRow = within(rows[2]);
    expect(secondDataRow.getByText('불명')).toBeTruthy();
    expect(secondDataRow.queryByText('undefined')).toBeNull();
    expect(secondDataRow.queryByText('null')).toBeNull();
    // 근거 셀 안에 상태값('불명') 외의 다른 텍스트 노드가 없어야 한다 — 빈 문자열을 지어내지 않는다.
    const authorityCell = (rows[2] as HTMLTableRowElement).cells[3];
    expect(authorityCell.textContent).toBe('불명');
  });

  it('AC-020 — 담당자·기한 근거가 없으면 빈칸이 아니라 "미정"으로 명시 표기한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(summaryResponse());
    vi.stubGlobal('fetch', fetchMock);

    render(<DecisionsWorkspace />);
    fireEvent.change(screen.getByRole('textbox', { name: '스레드 텍스트' }), {
      target: { value: '스레드 원문' },
    });
    fireEvent.click(screen.getByRole('button', { name: '요약 만들기' }));

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeTruthy();
    });

    const rows = screen.getAllByRole('row');
    const secondDataRow = within(rows[2]);
    expect(secondDataRow.getAllByText('미정')).toHaveLength(2);
  });

  it('AC-050①/AC-064⑤ — 근거가 없으면 결정 권한 상태를 "불명"으로 명시하고 빈칸으로 두지 않는다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(summaryResponse());
    vi.stubGlobal('fetch', fetchMock);

    render(<DecisionsWorkspace />);
    fireEvent.change(screen.getByRole('textbox', { name: '스레드 텍스트' }), {
      target: { value: '스레드 원문' },
    });
    fireEvent.click(screen.getByRole('button', { name: '요약 만들기' }));

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeTruthy();
    });

    const rows = screen.getAllByRole('row');
    const secondDataRow = within(rows[2]);
    expect(secondDataRow.getByText('불명')).toBeTruthy();
  });

  it('AC-038 — 미확정 항목 목록을 표와 별도로 렌더하고, 어떤 필드가 비었는지 텍스트로 명시한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(summaryResponse());
    vi.stubGlobal('fetch', fetchMock);

    render(<DecisionsWorkspace />);
    fireEvent.change(screen.getByRole('textbox', { name: '스레드 텍스트' }), {
      target: { value: '스레드 원문' },
    });
    fireEvent.click(screen.getByRole('button', { name: '요약 만들기' }));

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeTruthy();
    });

    const unresolvedSection = screen.getByRole('region', { name: '미확정 항목' });
    expect(within(unresolvedSection).getByText(/예산안 검토 담당자를 정한다/)).toBeTruthy();
    expect(within(unresolvedSection).getByText(/담당자/)).toBeTruthy();
    expect(within(unresolvedSection).getByText(/기한/)).toBeTruthy();
  });

  it('미확정 항목이 없으면 그렇게 명시한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(summaryResponse({ unresolved: [] }));
    vi.stubGlobal('fetch', fetchMock);

    render(<DecisionsWorkspace />);
    fireEvent.change(screen.getByRole('textbox', { name: '스레드 텍스트' }), {
      target: { value: '스레드 원문' },
    });
    fireEvent.click(screen.getByRole('button', { name: '요약 만들기' }));

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeTruthy();
    });

    const unresolvedSection = screen.getByRole('region', { name: '미확정 항목' });
    expect(within(unresolvedSection).getByText(/미확정 항목이 없습니다/)).toBeTruthy();
  });

  it('M-1 — decisions가 빈 배열이면 빈 표 대신 "결정사항이 발견되지 않았습니다"를 표시한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(summaryResponse({ decisions: [] }));
    vi.stubGlobal('fetch', fetchMock);

    render(<DecisionsWorkspace />);
    fireEvent.change(screen.getByRole('textbox', { name: '스레드 텍스트' }), {
      target: { value: '스레드 원문' },
    });
    fireEvent.click(screen.getByRole('button', { name: '요약 만들기' }));

    await waitFor(() => {
      expect(screen.getByText('결정사항이 발견되지 않았습니다.')).toBeTruthy();
    });
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('AC-041 — source가 fallback이면 "폴백 응답 사용 중" 라벨을 표시한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(summaryResponse({ source: 'fallback' }));
    vi.stubGlobal('fetch', fetchMock);

    render(<DecisionsWorkspace />);
    fireEvent.change(screen.getByRole('textbox', { name: '스레드 텍스트' }), {
      target: { value: '스레드 원문' },
    });
    fireEvent.click(screen.getByRole('button', { name: '요약 만들기' }));

    await waitFor(() => {
      expect(screen.getByText('폴백 응답 사용 중')).toBeTruthy();
    });
  });

  it('source가 live면 "폴백 응답 사용 중" 라벨을 표시하지 않는다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(summaryResponse({ source: 'live' }));
    vi.stubGlobal('fetch', fetchMock);

    render(<DecisionsWorkspace />);
    fireEvent.change(screen.getByRole('textbox', { name: '스레드 텍스트' }), {
      target: { value: '스레드 원문' },
    });
    fireEvent.click(screen.getByRole('button', { name: '요약 만들기' }));

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeTruthy();
    });
    expect(screen.queryByText('폴백 응답 사용 중')).toBeNull();
  });

  it('Secondary Action — 결과를 본 뒤 텍스트를 수정해 다시 생성하면 새 텍스트로 재호출한다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(summaryResponse())
      .mockResolvedValueOnce(summaryResponse({ decisions: [], unresolved: [] }));
    vi.stubGlobal('fetch', fetchMock);

    render(<DecisionsWorkspace />);
    fireEvent.change(screen.getByRole('textbox', { name: '스레드 텍스트' }), {
      target: { value: '원본 스레드' },
    });
    fireEvent.click(screen.getByRole('button', { name: '요약 만들기' }));

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeTruthy();
    });

    fireEvent.change(screen.getByRole('textbox', { name: '스레드 텍스트' }), {
      target: { value: '수정된 스레드' },
    });
    fireEvent.click(screen.getByRole('button', { name: '요약 만들기' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/summary',
      expect.objectContaining({
        body: JSON.stringify({ threadText: '수정된 스레드', context: { channel: 'web' } }),
      }),
    );
  });
});
