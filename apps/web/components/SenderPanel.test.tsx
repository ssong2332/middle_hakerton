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
    hasResult: false,
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

  // T16(AC-029/UX.md UX-004 States "Loading") — 단일 "처리 중…" 문구 대신 단계 라벨 진행 표시를
  // 보여준다. `docs/UX.md:1013`의 예시 문구("분류 중 → 변환 중 → 역번역 중")를 그대로 쓴다 —
  // 실제 서버 진행 단계와 무관한 정적 안내 문구다(의사 타이머로 단계를 전환하지 않는 판단 근거는
  // `MediationWorkspace.tsx` 헤더 주석 참조: 서버가 실제로 어느 단계인지 클라이언트가 알 방법이
  // 없는 상태에서 타이머로 단계를 넘기면 실제 진행과 어긋나는 시점이 생길 수 있다).
  it('로딩 중에는 실행 버튼이 비활성화되고 단계 라벨 진행 표시(분류 중 → 변환 중 → 역번역 중)가 나온다', () => {
    render(
      <SenderPanel {...baseProps()} text="내용" recipient="boss@example.com" status="loading" />,
    );

    const button = screen.getByRole('button', { name: '실행' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText('분류 중 → 변환 중 → 역번역 중')).toBeTruthy();
  });

  // T16(AC-029) — 실패 상태에서는 실행 버튼이 "다시 시도"로 바뀐다(`docs/UX.md:1015` "Error: a
  // banner ... with a '다시 시도' retry button"). 같은 핸들러(`onRunMediation`)를 그대로 재사용한다
  // — 재시도는 곧 재실행이다.
  it('AC-029 — 실패 상태에서는 실행 버튼이 "다시 시도"로 바뀌고 클릭하면 onRunMediation이 호출된다', () => {
    const onRunMediation = vi.fn();
    render(
      <SenderPanel
        {...baseProps()}
        text="내용"
        recipient="boss@example.com"
        status="error"
        onRunMediation={onRunMediation}
      />,
    );

    expect(screen.queryByRole('button', { name: '실행' })).toBeNull();
    const retryButton = screen.getByRole('button', { name: '다시 시도' }) as HTMLButtonElement;
    expect(retryButton.disabled).toBe(false);
    fireEvent.click(retryButton);
    expect(onRunMediation).toHaveBeenCalledTimes(1);
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

  // 🔴 M-2(2026-08-05, reviewer REJECTED → 수정) — 결과 블록이 `status==='success'` 단독 조건에
  // 묶여 있었다. 재실행이 실패하면(status==='error') 이 블록 전체가 사라져 "폴백 응답 사용 중"
  // 라벨도 함께 사라지는데, RecipientPanel은 승인 가능 여부를 `hasResult`(스냅샷 존재)로 판정하므로
  // 승인 시점에 라벨만 사라지는 상태가 될 수 있었다(AC-041 위반). `hasResult`가 true면 status와
  // 무관하게 결과 블록(폴백 배지 포함)을 유지해야 한다.
  it('M-2 — 재실행이 실패해도(status===error) 승인 가능한 스냅샷이 있으면(hasResult) 폴백 배지와 비교 뷰가 유지된다', () => {
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
      source: 'fallback',
      ticketOption: { offered: false, basis: 'signal_absent' },
    } as never;

    render(
      <SenderPanel
        {...baseProps()}
        text="내일까지 확인 부탁드립니다."
        recipient="boss@example.com"
        status="error"
        result={result}
        displayedUrgency="NORMAL"
        hasResult
      />,
    );

    expect(screen.getByText('처리에 실패했습니다')).toBeTruthy();
    expect(screen.getByText('Please confirm by tomorrow.')).toBeTruthy();
    expect(screen.getByText('폴백 응답 사용 중')).toBeTruthy();
  });
});
