/**
 * T13 — `SenderPanel` (AC-009 2패널 중 발신자 패널). `docs/UX.md` UX-004 Validation:
 * "Recipient identifier required (email format)... Run Mediation enabled only when recipient
 * and message text are both valid/non-empty; format error shown inline under the recipient
 * field, clears on edit."
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SenderPanel } from './SenderPanel';

function baseProps() {
  return {
    text: '',
    onTextChange: vi.fn(),
    recipient: '',
    onRecipientChange: vi.fn(),
    status: 'idle' as const,
    result: null,
    urgencyOverride: null,
    onOverride: vi.fn(),
    isOverridden: false,
    displayedUrgency: null,
    onRunMediation: vi.fn(),
  };
}

describe('SenderPanel', () => {
  it('메시지·수신자가 비어 있으면 실행 버튼이 비활성화된다', () => {
    render(<SenderPanel {...baseProps()} />);
    const button = screen.getByRole('button', { name: '실행' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('수신자 형식이 잘못되면 인라인 오류를 보여주고 실행 버튼이 비활성화된다', () => {
    render(<SenderPanel {...baseProps()} text="내용" recipient="not-an-email" />);

    expect(screen.getByText(/이메일 형식/)).toBeTruthy();
    const button = screen.getByRole('button', { name: '실행' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('수신자·메시지가 모두 유효하면 실행 버튼이 활성화되고 클릭하면 onRunMediation이 호출된다', () => {
    const onRunMediation = vi.fn();
    render(
      <SenderPanel
        {...baseProps()}
        text="내일까지 확인 부탁드립니다."
        recipient="boss@example.com"
        onRunMediation={onRunMediation}
      />,
    );

    const button = screen.getByRole('button', { name: '실행' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(onRunMediation).toHaveBeenCalledTimes(1);
  });

  it('로딩 중에는 실행 버튼이 비활성화되고 처리 중 표시가 나온다', () => {
    render(
      <SenderPanel {...baseProps()} text="내용" recipient="boss@example.com" status="loading" />,
    );

    const button = screen.getByRole('button', { name: '실행' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(/처리 중/)).toBeTruthy();
  });

  it('AC-008 — 결과가 있으면 3열 비교 뷰(원문/변환문/이유)를 표시한다', () => {
    const result = {
      urgency: 'NORMAL',
      urgencyReason: '일반 요청입니다.',
      transformed: 'Please confirm by tomorrow.',
      reason: '완곡 표현을 명시적 요청으로 변환했습니다.',
      preserved: [],
      backTranslation: '내일까지 확인 부탁드립니다.',
      warnings: [],
      misreadRisks: [],
      holidayConflicts: [],
      personalizationApplied: true,
      source: 'live',
      ticketOption: { offered: false, basis: 'signal_absent' },
    } as never;

    render(
      <SenderPanel
        {...baseProps()}
        text="내일까지 확인 부탁드립니다."
        recipient="boss@example.com"
        status="success"
        result={result}
        displayedUrgency="NORMAL"
      />,
    );

    expect(screen.getByText('Please confirm by tomorrow.')).toBeTruthy();
    expect(screen.getByText('완곡 표현을 명시적 요청으로 변환했습니다.')).toBeTruthy();
  });

  it('AC-043 — 결과에 misreadRisks가 있으면 오해 위험을 표시한다', () => {
    const result = {
      urgency: 'NORMAL',
      urgencyReason: '근거',
      transformed: 'text',
      reason: '이유',
      preserved: [],
      backTranslation: 'back',
      warnings: [],
      misreadRisks: [{ quote: '확인 부탁드립니다', misreading: '오해 위험', evidence: '근거' }],
      holidayConflicts: [],
      personalizationApplied: true,
      source: 'live',
      ticketOption: { offered: false, basis: 'signal_absent' },
    } as never;

    render(
      <SenderPanel
        {...baseProps()}
        text="원문"
        recipient="boss@example.com"
        status="success"
        result={result}
        displayedUrgency="NORMAL"
      />,
    );

    expect(screen.getByText('확인 부탁드립니다')).toBeTruthy();
  });
});
