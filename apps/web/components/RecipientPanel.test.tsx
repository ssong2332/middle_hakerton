/**
 * T13/T14 — `RecipientPanel` (AC-009 2패널 중 수신자 패널, AC-010 명시적 승인).
 * `docs/UX.md` UX-004 States: Empty(첫 실행 전) / ReadyToApprove(비교 가능+승인 버튼 활성) /
 * Delivered(승인 후 타임스탬프 로그 + 입력 잠금). Interaction Patterns "Duplicate/double-click
 * submission" — 제출 컨트롤은 클릭 즉시 자기 자신을 비활성화한다.
 *
 * 🔴 Critical(reviewer REJECTED → 수정) — `isStale` prop 추가. 라이브 원문/수신자가 승인 대상
 * 스냅샷과 달라지면(재실행 없이 편집됨) 승인 버튼을 비활성화한다(`docs/UX.md` UX-004 Validation
 * "for the current text"). 이 상태 판정 자체는 `MediationWorkspace`가 계산해 넘긴다 — 이
 * 컴포넌트는 받은 `isStale` 값을 그대로 반영만 한다.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecipientPanel } from './RecipientPanel';

describe('RecipientPanel', () => {
  it('Empty — 중재 결과가 없으면 안내 문구만 보이고 승인 버튼이 없다', () => {
    render(
      <RecipientPanel
        hasResult={false}
        isStale={false}
        finalText=""
        onFinalTextChange={vi.fn()}
        onApprove={vi.fn()}
        approveStatus="idle"
        sentAt={null}
      />,
    );

    expect(screen.getByText(/실행하면/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /승인/ })).toBeNull();
  });

  it('AC-010 — 결과가 있으면 승인 버튼이 나타나고, 클릭해야만 onApprove가 호출된다', () => {
    const onApprove = vi.fn();
    render(
      <RecipientPanel
        hasResult={true}
        isStale={false}
        finalText="Please confirm by tomorrow."
        onFinalTextChange={vi.fn()}
        onApprove={onApprove}
        approveStatus="idle"
        sentAt={null}
      />,
    );

    expect(onApprove).not.toHaveBeenCalled();
    const button = screen.getByRole('button', { name: /승인/ });
    fireEvent.click(button);
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('승인 전 최종문을 편집할 수 있다', () => {
    const onFinalTextChange = vi.fn();
    render(
      <RecipientPanel
        hasResult={true}
        isStale={false}
        finalText="Please confirm by tomorrow."
        onFinalTextChange={onFinalTextChange}
        onApprove={vi.fn()}
        approveStatus="idle"
        sentAt={null}
      />,
    );

    fireEvent.change(screen.getByLabelText('최종 발송문'), {
      target: { value: 'Please confirm by Friday.' },
    });
    expect(onFinalTextChange).toHaveBeenCalledWith('Please confirm by Friday.');
  });

  it('전송 중(sending)에는 승인 버튼이 비활성화된다(중복 제출 방지)', () => {
    render(
      <RecipientPanel
        hasResult={true}
        isStale={false}
        finalText="text"
        onFinalTextChange={vi.fn()}
        onApprove={vi.fn()}
        approveStatus="sending"
        sentAt={null}
      />,
    );

    const button = screen.getByRole('button', { name: /승인/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('Delivered — 승인 성공 후 발송 시각을 보여주고 입력을 잠근다', () => {
    render(
      <RecipientPanel
        hasResult={true}
        isStale={false}
        finalText="Please confirm by tomorrow."
        onFinalTextChange={vi.fn()}
        onApprove={vi.fn()}
        approveStatus="sent"
        sentAt="2026-08-05T10:00:00Z"
      />,
    );

    expect(screen.getByText(/발송됨/)).toBeTruthy();
    expect(screen.getByText(/2026-08-05T10:00:00Z/)).toBeTruthy();
    const textarea = screen.getByLabelText('최종 발송문') as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /승인/ })).toBeNull();
  });

  it('승인 요청이 실패하면 오류 배너를 보여주고 다시 승인을 시도할 수 있다', () => {
    render(
      <RecipientPanel
        hasResult={true}
        isStale={false}
        finalText="text"
        onFinalTextChange={vi.fn()}
        onApprove={vi.fn()}
        approveStatus="error"
        sentAt={null}
      />,
    );

    expect(screen.getByRole('alert')).toBeTruthy();
    const button = screen.getByRole('button', { name: /승인/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it('Critical — isStale이면 승인 버튼이 비활성화되고 안내 문구가 보인다', () => {
    render(
      <RecipientPanel
        hasResult={true}
        isStale={true}
        finalText="Please confirm by tomorrow."
        onFinalTextChange={vi.fn()}
        onApprove={vi.fn()}
        approveStatus="idle"
        sentAt={null}
      />,
    );

    const button = screen.getByRole('button', { name: /승인/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(/변경되었습니다/)).toBeTruthy();
  });

  it('Critical — isStale이어도 명시적 클릭으로는 onApprove가 절대 호출되지 않는다(disabled 버튼)', () => {
    const onApprove = vi.fn();
    render(
      <RecipientPanel
        hasResult={true}
        isStale={true}
        finalText="text"
        onFinalTextChange={vi.fn()}
        onApprove={onApprove}
        approveStatus="idle"
        sentAt={null}
      />,
    );

    const button = screen.getByRole('button', { name: /승인/ });
    fireEvent.click(button);
    expect(onApprove).not.toHaveBeenCalled();
  });

  // 🔴 M2(reviewer 최종 APPROVED, Major 비차단 → 수정) — 재실행이 진행 중(status==='loading')이면
  // 직전 성공 스냅샷이 있어도 승인을 막는다(`docs/UX.md` UX-004 Validation "disabled during
  // Loading/Error" — Error는 Major 1에서 예외 처리됐지만 Loading은 예외가 아니다).
  it('M2 — isRunning이면(재실행 진행 중) 승인 버튼이 비활성화된다', () => {
    render(
      <RecipientPanel
        hasResult={true}
        isStale={false}
        isRunning={true}
        finalText="Please confirm by tomorrow."
        onFinalTextChange={vi.fn()}
        onApprove={vi.fn()}
        approveStatus="idle"
        sentAt={null}
      />,
    );

    const button = screen.getByRole('button', { name: /승인/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('M2 — isRunning이 false면(재실행 진행 중 아님) 다른 차단 사유가 없는 한 승인 버튼이 활성화된다', () => {
    render(
      <RecipientPanel
        hasResult={true}
        isStale={false}
        isRunning={false}
        finalText="Please confirm by tomorrow."
        onFinalTextChange={vi.fn()}
        onApprove={vi.fn()}
        approveStatus="idle"
        sentAt={null}
      />,
    );

    const button = screen.getByRole('button', { name: /승인/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  // MJ-3 — 최종 발송문이 빈 값이면 서버가 400을 반환하기 전에 클라이언트에서 먼저 막는다
  // (`messagesRequestSchema.finalText: z.string().min(1)`, `apps/web/app/api/messages/route.ts`).
  it('MJ-3 — 최종 발송문이 빈 문자열이면 승인 버튼이 비활성화된다', () => {
    render(
      <RecipientPanel
        hasResult={true}
        isStale={false}
        finalText=""
        onFinalTextChange={vi.fn()}
        onApprove={vi.fn()}
        approveStatus="idle"
        sentAt={null}
      />,
    );

    const button = screen.getByRole('button', { name: /승인/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  // MJ-3 — 공백만 있는 값도 서버 검증(min(1) 후 trim 안 함)상으로는 통과할 수 있으나, 실질적으로
  // 빈 메시지를 보내는 것과 같으므로 같은 취급을 한다.
  it('MJ-3 — 최종 발송문이 공백뿐이면 승인 버튼이 비활성화된다', () => {
    render(
      <RecipientPanel
        hasResult={true}
        isStale={false}
        finalText="   "
        onFinalTextChange={vi.fn()}
        onApprove={vi.fn()}
        approveStatus="idle"
        sentAt={null}
      />,
    );

    const button = screen.getByRole('button', { name: /승인/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  // Minor(사용자 지시 유지보수 라운드) — MJ-3은 버튼만 끄고 인라인 사유 문구가 없어서 "죽은
  // 버튼"처럼 보였다. `isStale`과 같은 패턴(role="status" 안내)으로 이유를 알려준다.
  it('Minor — 최종 발송문이 비어 있으면 승인 버튼이 비활성화된 이유를 안내하는 문구가 보인다', () => {
    render(
      <RecipientPanel
        hasResult={true}
        isStale={false}
        finalText=""
        onFinalTextChange={vi.fn()}
        onApprove={vi.fn()}
        approveStatus="idle"
        sentAt={null}
      />,
    );

    expect(screen.getByText('최종 발송문을 입력해야 승인할 수 있습니다.')).toBeTruthy();
  });

  it('Minor — 최종 발송문이 채워지면 빈 값 안내 문구가 사라진다', () => {
    render(
      <RecipientPanel
        hasResult={true}
        isStale={false}
        finalText="Please confirm by tomorrow."
        onFinalTextChange={vi.fn()}
        onApprove={vi.fn()}
        approveStatus="idle"
        sentAt={null}
      />,
    );

    expect(screen.queryByText('최종 발송문을 입력해야 승인할 수 있습니다.')).toBeNull();
  });

  // T25/AC-058② — 감정 신호가 낮아 옵션이 제시되지 않으면(ticketOffered=false) "Convert to Task
  // Ticket" 링크는 비활성/회색이 아니라 DOM에서 완전히 사라져야 한다(Absent-not-disabled controls).
  it('T25/AC-058② — ticketOffered가 false면 Convert to Task Ticket 링크가 렌더되지 않는다', () => {
    render(
      <RecipientPanel
        hasResult={true}
        isStale={false}
        ticketOffered={false}
        finalText="Please confirm by tomorrow."
        onFinalTextChange={vi.fn()}
        onApprove={vi.fn()}
        approveStatus="idle"
        sentAt={null}
      />,
    );

    expect(screen.queryByRole('button', { name: /Convert to Task Ticket/ })).toBeNull();
  });

  // T25/AC-058① — 감정 신호가 있어 옵션이 제시되면(ticketOffered=true) 링크가 나타나고, 클릭하면
  // onConvertToTicket이 호출된다(UX-007로의 유일한 진입 경로, `docs/UX.md` UX-007 Entry).
  it('T25/AC-058① — ticketOffered가 true면 링크가 렌더되고 클릭하면 onConvertToTicket이 호출된다', () => {
    const onConvertToTicket = vi.fn();
    render(
      <RecipientPanel
        hasResult={true}
        isStale={false}
        ticketOffered={true}
        onConvertToTicket={onConvertToTicket}
        finalText="Please confirm by tomorrow."
        onFinalTextChange={vi.fn()}
        onApprove={vi.fn()}
        approveStatus="idle"
        sentAt={null}
      />,
    );

    const link = screen.getByRole('button', { name: /Convert to Task Ticket/ });
    expect(onConvertToTicket).not.toHaveBeenCalled();
    fireEvent.click(link);
    expect(onConvertToTicket).toHaveBeenCalledTimes(1);
  });

  // T40/AC-005 — "Set response deadline"은 ticketOffered와 같은 부재-비활성 패턴.
  it('T40 — deadlineNegotiationAvailable이 false면(기본값) 진입 버튼이 렌더되지 않는다', () => {
    render(
      <RecipientPanel
        hasResult={true}
        isStale={false}
        finalText="Please confirm by tomorrow."
        onFinalTextChange={vi.fn()}
        onApprove={vi.fn()}
        approveStatus="idle"
        sentAt={null}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Set response deadline' })).toBeNull();
  });

  it('T40 — deadlineNegotiationAvailable이 true면 진입 버튼이 렌더되고 클릭 시 콜백을 호출한다', () => {
    const onOpen = vi.fn();
    render(
      <RecipientPanel
        hasResult={true}
        isStale={false}
        deadlineNegotiationAvailable={true}
        onOpenDeadlineNegotiation={onOpen}
        finalText="Please confirm by tomorrow."
        onFinalTextChange={vi.fn()}
        onApprove={vi.fn()}
        approveStatus="idle"
        sentAt={null}
      />,
    );

    const button = screen.getByRole('button', { name: 'Set response deadline' });
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('T40 — confirmedDeadline이 있으면 참고용으로 표시된다(값이 없으면 아무것도 렌더하지 않는다)', () => {
    const { rerender } = render(
      <RecipientPanel
        hasResult={true}
        isStale={false}
        finalText="Please confirm by tomorrow."
        onFinalTextChange={vi.fn()}
        onApprove={vi.fn()}
        approveStatus="idle"
        sentAt={null}
      />,
    );
    expect(screen.queryByText(/참고 응답 기한/)).toBeNull();

    rerender(
      <RecipientPanel
        hasResult={true}
        isStale={false}
        confirmedDeadline="2026-08-20T09:00:00Z"
        finalText="Please confirm by tomorrow."
        onFinalTextChange={vi.fn()}
        onApprove={vi.fn()}
        approveStatus="idle"
        sentAt={null}
      />,
    );
    expect(screen.getByText(/참고 응답 기한/)).toBeTruthy();
  });
});
