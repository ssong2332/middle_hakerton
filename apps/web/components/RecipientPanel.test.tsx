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
});
