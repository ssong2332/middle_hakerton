/**
 * T25 — `TicketWorkspace` (UX-007 Vent-to-Ticket View 본체). AC-017/AC-058/AC-062.
 * `docs/UX.md` UX-007 States: Loading(변환 진행 중) / Error(변환 실패, 원문 보존) / Result(4섹션
 * 항상 렌더 + 결정 권한 상태) — 여기에 이 태스크 판단으로 추가한 "원본 없음"(직접 URL 접근 등
 * `TICKET_DRAFT_SESSION_KEY`가 비어 있을 때) 상태.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TICKET_DRAFT_SESSION_KEY, TICKET_RESTORE_SESSION_KEY } from '../lib/ticket-draft';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

import { TicketWorkspace } from './TicketWorkspace';

function ticketResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: async () => ({
      sections: {
        problem: '요청한 배포 승인이 3일째 지연되고 있습니다.',
        impact: '고객 대응 일정이 밀리고 있습니다.',
        request: '오늘 안으로 승인 여부를 알려주세요.',
        concernLevel: '높음',
      },
      decisionAuthority: '내부 승인 필요',
      decisionAuthorityEvidence: '"팀장님 확인 후 알려드릴게요"라는 문장에서 내부 승인이 필요함을 알 수 있습니다.',
      source: 'live',
      ...overrides,
    }),
  };
}

describe('TicketWorkspace', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockClear();
    window.sessionStorage.clear();
  });

  it('원본 텍스트가 세션에 없으면(직접 URL 접근 등) 변환 API를 호출하지 않고 안내 상태를 보여준다', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<TicketWorkspace />);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/원본 메시지를 찾을 수 없습니다/)).toBeTruthy();
  });

  it('Loading — 마운트 시 세션의 원문으로 POST /api/ticket을 호출하고 진행 중임을 보여준다', () => {
    window.sessionStorage.setItem(TICKET_DRAFT_SESSION_KEY, '팀장님 확인 후 알려드릴게요, 근데 3일째 감감무소식이네요.');
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);

    render(<TicketWorkspace />);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ticket',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          text: '팀장님 확인 후 알려드릴게요, 근데 3일째 감감무소식이네요.',
          context: { channel: 'web' },
        }),
      }),
    );
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('Error — 변환 API가 실패하면 오류 배너와 재시도 버튼을 보여준다', async () => {
    window.sessionStorage.setItem(TICKET_DRAFT_SESSION_KEY, '원문');
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    render(<TicketWorkspace />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: /재시도/ })).toBeTruthy();
  });

  it('AC-062 — Result 상태에서 4개 섹션이 라벨 있는 영역으로 항상 렌더되고 편집할 수 있다', async () => {
    window.sessionStorage.setItem(TICKET_DRAFT_SESSION_KEY, '원문');
    const fetchMock = vi.fn().mockResolvedValue(
      ticketResponse({
        sections: {
          problem: '없음',
          impact: '없음',
          request: '요청 내용입니다.',
          concernLevel: '낮음',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<TicketWorkspace />);

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: '문제 정의' })).toBeTruthy();
    });
    // 근거 없는 섹션도 생략되지 않고 "없음"이 그대로 편집 가능한 값으로 보인다(AC-062).
    const problemField = screen.getByRole('textbox', { name: '문제 정의' }) as HTMLTextAreaElement;
    expect(problemField.value).toBe('없음');
    expect((screen.getByRole('textbox', { name: '영향·리스크' }) as HTMLTextAreaElement).value).toBe(
      '없음',
    );

    fireEvent.change(problemField, { target: { value: '수정된 문제 정의' } });
    expect(problemField.value).toBe('수정된 문제 정의');
  });

  // MAJ-2(reviewer follow-up) — 각 섹션은 이름 있는 landmark(region)로 노출돼야 스크린리더의
  // 랜드마크 탐색에서 발견된다. `role="region"`에 접근 가능한 이름이 없으면 랜드마크로 노출되지
  // 않는다(unnamed region은 ARIA 스펙상 landmark 트리에서 제외된다).
  it('MAJ-2 — 4개 섹션이 이름 있는 region 랜드마크로 노출된다', async () => {
    window.sessionStorage.setItem(TICKET_DRAFT_SESSION_KEY, '원문');
    const fetchMock = vi.fn().mockResolvedValue(ticketResponse());
    vi.stubGlobal('fetch', fetchMock);

    render(<TicketWorkspace />);

    await waitFor(() => {
      expect(screen.getByRole('region', { name: '문제 정의' })).toBeTruthy();
    });
    expect(screen.getByRole('region', { name: '영향·리스크' })).toBeTruthy();
    expect(screen.getByRole('region', { name: '요청 사항' })).toBeTruthy();
    expect(screen.getByRole('region', { name: '우려 수준' })).toBeTruthy();
  });

  it('AC-064 — 결정 권한 상태와 근거 문장을 읽기 전용으로 보여준다', async () => {
    window.sessionStorage.setItem(TICKET_DRAFT_SESSION_KEY, '원문');
    const fetchMock = vi.fn().mockResolvedValue(ticketResponse());
    vi.stubGlobal('fetch', fetchMock);

    render(<TicketWorkspace />);

    await waitFor(() => {
      expect(screen.getByText('내부 승인 필요')).toBeTruthy();
    });
    expect(
      screen.getByText(/"팀장님 확인 후 알려드릴게요"라는 문장에서 내부 승인이 필요함을 알 수 있습니다\./),
    ).toBeTruthy();
  });

  it('AC-050①/AC-064⑤ — 근거가 없으면 결정 권한 상태를 "불명"으로 명시하고 근거 문장을 만들어내지 않는다', async () => {
    window.sessionStorage.setItem(TICKET_DRAFT_SESSION_KEY, '원문');
    const fetchMock = vi.fn().mockResolvedValue(
      ticketResponse({ decisionAuthority: '불명', decisionAuthorityEvidence: null }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<TicketWorkspace />);

    await waitFor(() => {
      expect(screen.getByText('불명')).toBeTruthy();
    });
  });

  // MAJ-1(reviewer follow-up, AC-041 / docs/UX.md:920) — `SenderPanel`의 폴백 배지 관례와 동일하게,
  // `POST /api/ticket`이 `source: 'fallback'`을 반환하면 화면에 "폴백 응답 사용 중" 라벨이 보여야
  // 한다.
  it('MAJ-1 — source가 fallback이면 "폴백 응답 사용 중" 라벨을 표시한다', async () => {
    window.sessionStorage.setItem(TICKET_DRAFT_SESSION_KEY, '원문');
    const fetchMock = vi.fn().mockResolvedValue(ticketResponse({ source: 'fallback' }));
    vi.stubGlobal('fetch', fetchMock);

    render(<TicketWorkspace />);

    await waitFor(() => {
      expect(screen.getByText('폴백 응답 사용 중')).toBeTruthy();
    });
  });

  it('MAJ-1 — source가 live면 "폴백 응답 사용 중" 라벨을 표시하지 않는다', async () => {
    window.sessionStorage.setItem(TICKET_DRAFT_SESSION_KEY, '원문');
    const fetchMock = vi.fn().mockResolvedValue(ticketResponse({ source: 'live' }));
    vi.stubGlobal('fetch', fetchMock);

    render(<TicketWorkspace />);

    await waitFor(() => {
      expect(screen.getByText('내부 승인 필요')).toBeTruthy();
    });
    expect(screen.queryByText('폴백 응답 사용 중')).toBeNull();
  });

  it('"Use this ticket" — 편집된 4섹션을 조립해 복원용 세션 키에 저장하고 /mediate로 이동한다', async () => {
    window.sessionStorage.setItem(TICKET_DRAFT_SESSION_KEY, '원문');
    const fetchMock = vi.fn().mockResolvedValue(ticketResponse());
    vi.stubGlobal('fetch', fetchMock);

    render(<TicketWorkspace />);

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: '문제 정의' })).toBeTruthy();
    });
    fireEvent.change(screen.getByRole('textbox', { name: '문제 정의' }), {
      target: { value: '편집된 문제' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Use this ticket/ }));

    // Major-1 — API 소스 키(`TICKET_DRAFT_SESSION_KEY`)는 그대로 두고, 복원 전용 키
    // (`TICKET_RESTORE_SESSION_KEY`)에 조립문을 쓴다.
    const stored = window.sessionStorage.getItem(TICKET_RESTORE_SESSION_KEY);
    expect(stored).toContain('편집된 문제');
    expect(window.sessionStorage.getItem(TICKET_DRAFT_SESSION_KEY)).toBe('원문');
    expect(mockPush).toHaveBeenCalledWith('/mediate');
  });

  it('AC-087①④ — 기본 상태(체크박스 미체크)로 "Use this ticket"을 누르면 조립문에 [우려 수준]이 0건이다', async () => {
    window.sessionStorage.setItem(TICKET_DRAFT_SESSION_KEY, '원문');
    const fetchMock = vi.fn().mockResolvedValue(ticketResponse());
    vi.stubGlobal('fetch', fetchMock);

    render(<TicketWorkspace />);

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: '문제 정의' })).toBeTruthy();
    });
    const checkbox = screen.getByLabelText('발신 본문에 [우려 수준] 포함') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(screen.getByText('[우려 수준]은 발신 본문에 포함되지 않습니다')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Use this ticket/ }));

    const stored = window.sessionStorage.getItem(TICKET_RESTORE_SESSION_KEY);
    expect(stored).not.toContain('[우려 수준]');
    expect(stored).not.toContain('높음');
  });

  it('AC-087③④ — 체크박스를 체크하면 상태 문구가 즉시 바뀌고, "Use this ticket" 조립문에 [우려 수준]이 1건 포함된다', async () => {
    window.sessionStorage.setItem(TICKET_DRAFT_SESSION_KEY, '원문');
    const fetchMock = vi.fn().mockResolvedValue(ticketResponse());
    vi.stubGlobal('fetch', fetchMock);

    render(<TicketWorkspace />);

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: '문제 정의' })).toBeTruthy();
    });
    fireEvent.click(screen.getByLabelText('발신 본문에 [우려 수준] 포함'));
    expect(screen.getByText('[우려 수준]이 발신 본문에 포함됩니다')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Use this ticket/ }));

    const stored = window.sessionStorage.getItem(TICKET_RESTORE_SESSION_KEY);
    expect(stored).toContain('[우려 수준]');
    expect(stored).toContain('높음');
  });

  it('"Back to message" — 세션의 원문/복원값을 건드리지 않고 /mediate로 돌아간다(원문 보존)', async () => {
    window.sessionStorage.setItem(TICKET_DRAFT_SESSION_KEY, '원문');
    window.sessionStorage.setItem(TICKET_RESTORE_SESSION_KEY, '편집 중이던 원문');
    const fetchMock = vi.fn().mockResolvedValue(ticketResponse());
    vi.stubGlobal('fetch', fetchMock);

    render(<TicketWorkspace />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Back to message/ })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /Back to message/ }));

    expect(window.sessionStorage.getItem(TICKET_DRAFT_SESSION_KEY)).toBe('원문');
    expect(window.sessionStorage.getItem(TICKET_RESTORE_SESSION_KEY)).toBe('편집 중이던 원문');
    expect(mockPush).toHaveBeenCalledWith('/mediate');
  });
});
