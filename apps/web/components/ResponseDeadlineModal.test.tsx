/**
 * T40 — UX-005 Response Deadline Negotiation Modal. AC-036(자동 변경 금지), AC-005(지연 절반,
 * 렌더 게이트는 호출부 소관 — 이 파일은 열려 있다는 전제로만 검증한다).
 * `POST /api/deadline/check`(T39)는 모킹한다 — 그 라우트 자체의 배선/판정 로직은
 * `apps/web/app/api/deadline/check/route.test.ts`가 이미 검증한다.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ResponseDeadlineModal } from './ResponseDeadlineModal';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const FUTURE_LOCAL = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
const PAST_LOCAL = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 16);

function fillRecipientForm() {
  fireEvent.change(screen.getByLabelText('희망 응답 기한'), { target: { value: FUTURE_LOCAL } });
  fireEvent.change(screen.getByLabelText('수신자 타임존(IANA, 예: Asia/Tokyo)'), {
    target: { value: 'Asia/Tokyo' },
  });
  fireEvent.change(screen.getByLabelText('근무 시작'), { target: { value: '09:00' } });
  fireEvent.change(screen.getByLabelText('근무 종료'), { target: { value: '18:00' } });
}

describe('ResponseDeadlineModal (UX-005)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('open=false면 아무것도 렌더하지 않는다', () => {
    render(
      <ResponseDeadlineModal open={false} urgency="NORMAL" onClose={vi.fn()} onConfirm={vi.fn()} />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('open=true면 role="dialog"로 렌더된다', () => {
    render(<ResponseDeadlineModal open={true} urgency="NORMAL" onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: '응답 기한 협상' })).toBeTruthy();
  });

  it('Validation — 과거 날짜/시각이면 인라인 에러를 보여주고 제출 버튼이 비활성화된다', () => {
    render(<ResponseDeadlineModal open={true} urgency="NORMAL" onClose={vi.fn()} onConfirm={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('희망 응답 기한'), { target: { value: PAST_LOCAL } });

    expect(screen.getByText('미래 날짜/시각을 입력해주세요')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: '실현 가능성 확인' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('필수 필드(기한/타임존/근무시간)가 모두 유효해야 제출 버튼이 활성화된다', () => {
    render(<ResponseDeadlineModal open={true} urgency="NORMAL" onClose={vi.fn()} onConfirm={vi.fn()} />);
    const submit = screen.getByRole('button', { name: '실현 가능성 확인' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fillRecipientForm();

    expect((screen.getByRole('button', { name: '실현 가능성 확인' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('Result-Feasible — 실현 가능하면 "이 기한 사용" 버튼이 나타나고, 클릭하면 확정 기한과 함께 onConfirm+onClose가 호출된다', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ feasible: true, reason: '근무 시간 내입니다', counterOffers: [] }),
    });
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<ResponseDeadlineModal open={true} urgency="NORMAL" onClose={onClose} onConfirm={onConfirm} />);
    fillRecipientForm();

    fireEvent.click(screen.getByRole('button', { name: '실현 가능성 확인' }));

    await waitFor(() => {
      expect(screen.getByText('이 기한은 실현 가능합니다.')).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: '이 기한 사용' }));

    expect(onConfirm).toHaveBeenCalledWith(new Date(FUTURE_LOCAL).toISOString());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Result-Infeasible — 역제안이 있으면 하나를 골라야 "역제안 수락"이 활성화되고, 자동으로 아무것도 확정되지 않는다(AC-036)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        feasible: false,
        reason: '수신자 근무 시간 밖입니다',
        counterOffers: [
          { date: '2026-08-21T01:00:00Z', rationale: '다음 근무일 오전' },
          { date: '2026-08-22T01:00:00Z', rationale: '그 다음 근무일 오전' },
        ],
      }),
    });
    const onConfirm = vi.fn();
    render(<ResponseDeadlineModal open={true} urgency="NORMAL" onClose={vi.fn()} onConfirm={onConfirm} />);
    fillRecipientForm();
    fireEvent.click(screen.getByRole('button', { name: '실현 가능성 확인' }));

    await waitFor(() => {
      expect(screen.getByText('수신자 근무 시간 밖입니다')).toBeTruthy();
    });
    // 아직 아무것도 선택하지 않았으므로 자동으로 확정되지 않는다(AC-036).
    expect(onConfirm).not.toHaveBeenCalled();
    const acceptButton = screen.getByRole('button', { name: '역제안 수락' }) as HTMLButtonElement;
    expect(acceptButton.disabled).toBe(true);

    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[1]);
    fireEvent.click(screen.getByRole('button', { name: '역제안 수락' }));

    expect(onConfirm).toHaveBeenCalledWith('2026-08-22T01:00:00Z');
  });

  it('Failure — 확인 요청이 실패하면 인라인 에러를 보여주고 재시도할 수 있다', async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    render(<ResponseDeadlineModal open={true} urgency="NORMAL" onClose={vi.fn()} onConfirm={vi.fn()} />);
    fillRecipientForm();

    fireEvent.click(screen.getByRole('button', { name: '실현 가능성 확인' }));

    await waitFor(() => {
      expect(screen.getByText('확인하지 못했습니다, 다시 시도해주세요')).toBeTruthy();
    });
  });

  it('Cancel 클릭 — onConfirm 없이 onClose만 호출된다', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<ResponseDeadlineModal open={true} urgency="NORMAL" onClose={onClose} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Accessibility — Escape는 Cancel과 동일하게 onClose를 호출한다', () => {
    const onClose = vi.fn();
    render(<ResponseDeadlineModal open={true} urgency="NORMAL" onClose={onClose} onConfirm={vi.fn()} />);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('요청 body에 urgency·neededBy(ISO)·recipient 필드를 정확히 담아 보낸다', () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ feasible: true, reason: 'ok', counterOffers: [] }),
    });
    render(<ResponseDeadlineModal open={true} urgency="LOW" onClose={vi.fn()} onConfirm={vi.fn()} />);
    fillRecipientForm();

    fireEvent.click(screen.getByRole('button', { name: '실현 가능성 확인' }));

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/deadline/check',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({
      urgency: 'LOW',
      neededBy: new Date(FUTURE_LOCAL).toISOString(),
      recipient: { timezone: 'Asia/Tokyo', workStart: '09:00', workEnd: '18:00' },
    });
  });
});
