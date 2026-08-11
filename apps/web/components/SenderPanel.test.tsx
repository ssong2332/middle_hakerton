/**
 * T13 — `SenderPanel` (AC-009 2패널 중 발신자 패널). `docs/UX.md` UX-004 Validation:
 * "Recipient identifier required (email format)... Run Mediation enabled only when recipient
 * and message text are both valid/non-empty; format error shown inline under the recipient
 * field, clears on edit."
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { MediationResult } from '@cross-border/core';
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
    originalTextSnapshot: '',
  };
}

describe('SenderPanel', () => {
  it('메시지·수신자가 비어 있으면 실행 버튼이 비활성화된다', () => {
    render(<SenderPanel {...baseProps()} />);
    const button = screen.getByRole('button', { name: '실행' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('AC-061① — 4,500자 미만이면 길이 카운터가 뜨지 않는다', () => {
    render(<SenderPanel {...baseProps()} text={'a'.repeat(4499)} />);
    expect(screen.queryByText(/\/ 5,000자/)).toBeNull();
  });

  it('AC-061① — 4,500자 이상(5,000자 도달 전)이면 길이 카운터가 뜬다', () => {
    render(<SenderPanel {...baseProps()} text={'a'.repeat(4500)} />);
    expect(screen.getByText('4,500 / 5,000자')).toBeTruthy();
  });

  it('AC-061②③ — 6,000자(캡 초과)를 입력해도 실행 버튼이 비활성화되지 않고 카운터만 갱신된다', () => {
    render(<SenderPanel {...baseProps()} text={'a'.repeat(6000)} recipient="a@example.com" />);
    const button = screen.getByRole('button', { name: '실행' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(screen.getByText('6,000 / 5,000자')).toBeTruthy();
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
      stepSources: { c1: 'live', c2: 'live', c4: 'live' },
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
      stepSources: { c1: 'live', c2: 'live', c4: 'live' },
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
      // 🔴 F1-e — `source: 'fallback'`만으로는 더 이상 배지가 뜨지 않는다(`ComparisonView`가 이제
      // `stepSources.c2`를 본다). C2를 fallback으로 지정해 비교 뷰 배지를 켠다.
      stepSources: { c1: 'live', c2: 'fallback', c4: 'live' },
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

  // MJ-5(사용자 지시 유지보수 라운드) — `ComparisonView`/`BackTranslationPreview`에 넘기는
  // 원문은 라이브 `text` state가 아니라 스냅샷 시점의 원문(`originalTextSnapshot`)이어야 한다.
  // 재실행 실패 후(hasResult는 유지된 채) 원문을 편집하면, 입력창은 새 원문을 보여줘도
  // 비교 뷰·역번역 미리보기는 여전히 스냅샷 시점의(변환문·역번역과 짝을 이루는) 원문을 보여야
  // 한다 — 그렇지 않으면 "새로 편집한 원문 + 옛 변환문/역번역"이 나란히 뜬다.
  it('MJ-5 — 비교 뷰·역번역 미리보기의 원문은 라이브 편집이 아니라 스냅샷 시점의 원문이다', () => {
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
      stepSources: { c1: 'live', c2: 'live', c4: 'live' },
      ticketOption: { offered: false, basis: 'signal_absent' },
    } as never;

    render(
      <SenderPanel
        {...baseProps()}
        text="새로 편집한 원문(아직 검토되지 않음)"
        recipient="boss@example.com"
        status="error"
        result={result}
        displayedUrgency="NORMAL"
        hasResult
        originalTextSnapshot="스냅샷 시점의 원문(내일까지 확인 부탁드립니다.)"
      />,
    );

    // 입력창(textarea)에는 라이브 편집 값이 그대로 반영된다.
    expect((screen.getByLabelText('메시지') as HTMLTextAreaElement).value).toBe(
      '새로 편집한 원문(아직 검토되지 않음)',
    );

    // 그러나 비교 뷰·역번역 미리보기의 "원문"은 스냅샷 시점의 원문이어야 한다.
    const comparisonView = screen.getByLabelText('원문·변환문·변환 이유 비교');
    expect(
      within(comparisonView).getByText('스냅샷 시점의 원문(내일까지 확인 부탁드립니다.)'),
    ).toBeTruthy();
    expect(within(comparisonView).queryByText('새로 편집한 원문(아직 검토되지 않음)')).toBeNull();

    const backTranslationView = screen.getByLabelText('역번역 미리보기');
    expect(
      within(backTranslationView).getByText('스냅샷 시점의 원문(내일까지 확인 부탁드립니다.)'),
    ).toBeTruthy();
    expect(
      within(backTranslationView).queryByText('새로 편집한 원문(아직 검토되지 않음)'),
    ).toBeNull();
  });

  // 🔴 C-1(reviewer REJECTED → 수정, AC-041 회귀 재발 방지) — ADR-0009 D3 매핑표는
  // "stepSources.c1 → UrgencyPanel.tsx"를 지정한다. c1만 fallback이고 c2/c4가 live일 때도
  // 화면 어딘가에는 "폴백 응답 사용 중" 배지가 있어야 한다 — c2/c4 기준 컴포넌트(ComparisonView/
  // BackTranslationPreview)만으로는 이 조합을 표시할 수 없다.
  //
  // Minor(사용자 지시 유지보수 라운드) — 이전 버전은 전역 `screen.getByText`만 써서 영역을
  // 특정하지 않았다(배지가 엉뚱한 컴포넌트에 붙어도 통과했을 것이다). M-1 테스트가 이미 확립한
  // `within(screen.getByLabelText(...))` 패턴을 여기도 적용해, 배지가 정확히 긴급도 영역에만
  // 있고 비교뷰·역번역 영역에는 없는지 함께 단언한다. 이 테스트의 판별력은
  // `SenderPanel.tsx`의 `source={result.stepSources?.c1 ?? 'live'}` 배선을 일시적으로
  // `result.stepSources?.c2`로 바꿔 재실행 → 실패(red, 배지가 긴급도 영역에서 사라짐) → 원복 →
  // 재실행 → 통과(green)로 확인했다(구현 보고서 참조).
  it('C-1 — stepSources.c1만 fallback이어도 폴백 배지가 긴급도 영역에 표시되고, 비교뷰·역번역 영역에는 없다(UrgencyPanel)', () => {
    const result: MediationResult = {
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
      stepSources: { c1: 'fallback', c2: 'live', c4: 'live' },
      ticketOption: { offered: false, basis: 'signal_absent' },
    };

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

    const urgencyPanel = screen.getByLabelText('긴급도');
    const comparisonView = screen.getByLabelText('원문·변환문·변환 이유 비교');
    const backTranslationView = screen.getByLabelText('역번역 미리보기');
    expect(within(urgencyPanel).getByText('폴백 응답 사용 중')).toBeTruthy();
    expect(within(comparisonView).queryByText('폴백 응답 사용 중')).toBeNull();
    expect(within(backTranslationView).queryByText('폴백 응답 사용 중')).toBeNull();
  });

  // 🔴 M-1(reviewer REJECTED → 수정) — c2/c4 배선을 서로 바꿔도 기존 테스트는 green이었다(전역
  // getByText만 썼기 때문). 영역을 특정(within)해서 배지가 정확한 컴포넌트에 붙는지 확인한다.
  //
  // ⓐ {c2:'live', c4:'fallback'} — 비교 뷰에는 배지가 없고, 역번역 영역에만 있어야 한다.
  it('M-1ⓐ — c2가 live·c4가 fallback이면 비교 뷰에는 배지가 없고 역번역 영역에만 있다', () => {
    const result: MediationResult = {
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
      stepSources: { c1: 'live', c2: 'live', c4: 'fallback' },
      ticketOption: { offered: false, basis: 'signal_absent' },
    };

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

    const comparisonView = screen.getByLabelText('원문·변환문·변환 이유 비교');
    const backTranslationView = screen.getByLabelText('역번역 미리보기');
    expect(within(comparisonView).queryByText('폴백 응답 사용 중')).toBeNull();
    expect(within(backTranslationView).getByText('폴백 응답 사용 중')).toBeTruthy();
  });

  // ⓑ {c2:'fallback', c4:'live'} — 반대 조합. 이 조합은 실제로 도달 가능하고 의미도 정합하다
  // (C2가 폴백으로 강등되면, C4는 그 폴백 transformed를 입력받아 정상적인 live 역번역을 만들 수
  // 있다 — reviewer가 직접 확인). 비교 뷰에만 배지가 있고, 역번역 영역에는 없어야 한다.
  it('M-1ⓑ — c2가 fallback·c4가 live면 비교 뷰에만 배지가 있고 역번역 영역에는 없다', () => {
    const result: MediationResult = {
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
      stepSources: { c1: 'live', c2: 'fallback', c4: 'live' },
      ticketOption: { offered: false, basis: 'signal_absent' },
    };

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

    const comparisonView = screen.getByLabelText('원문·변환문·변환 이유 비교');
    const backTranslationView = screen.getByLabelText('역번역 미리보기');
    expect(within(comparisonView).getByText('폴백 응답 사용 중')).toBeTruthy();
    expect(within(backTranslationView).queryByText('폴백 응답 사용 중')).toBeNull();
  });

  // 🔴 M-2(reviewer REJECTED → 수정) — 배지를 3개 다 띄울지, 화면 레벨 1개 + 문제 영역만 띄울지는
  // ux-design 소관(ADR-0009 Follow-up #6, 유보). 여기서는 그 설계를 바꾸지 않고, 세 스텝이 모두
  // fallback일 때 동일 문구가 중복 렌더되는 **현재 동작**을 그대로 고정만 한다.
  it('M-2 — 세 스텝 모두 fallback이면 "폴백 응답 사용 중"이 3번(중복) 렌더된다(현재 동작 고정, 시각 설계는 ux-design 소관)', () => {
    const result: MediationResult = {
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
      stepSources: { c1: 'fallback', c2: 'fallback', c4: 'fallback' },
      ticketOption: { offered: false, basis: 'signal_absent' },
    };

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

    expect(screen.getAllByText('폴백 응답 사용 중')).toHaveLength(3);
  });

  // Minor(방어적, 사용자 지시 유지보수 라운드) — 현재는 유일한 생산자(`route.ts`)가 항상
  // `stepSources`를 채우지만, 응답에 `stepSources`가 없는 경우(배포 스큐, 향후 확장 어댑터
  // 스텁 등)에도 `result.stepSources.c1/.c2/.c4`를 그냥 읽으면 렌더 자체가 TypeError로 깨진다.
  // 배지가 안 뜨는 정도로 degrade하되 화면 자체는 깨지지 않아야 한다.
  it('Minor(방어적) — 응답에 stepSources가 없어도(배포 스큐 등) 렌더가 깨지지 않고 폴백 배지 없이 표시된다', () => {
    const resultWithoutStepSources = {
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
      // stepSources 필드 자체가 없다 — 배포 스큐/향후 확장 어댑터 스텁 시나리오를 흉내낸다.
    } as unknown as MediationResult;

    expect(() =>
      render(
        <SenderPanel
          {...baseProps()}
          text="내일까지 확인 부탁드립니다."
          recipient="boss@example.com"
          status="success"
          result={resultWithoutStepSources}
          displayedUrgency="NORMAL"
        />,
      ),
    ).not.toThrow();

    expect(screen.getByText('Please confirm by tomorrow.')).toBeTruthy();
    expect(screen.queryByText('폴백 응답 사용 중')).toBeNull();
  });

  // M1(reviewer round-3 비차단 Major) — 위 "Minor(방어적)" 테스트는 stepSources가 없을 때
  // `source: 'live'` 픽스처만 써서, `?? 'live'` 기본값이 실제로는 `source: 'fallback'`인 응답을
  // "라이브"로 지어내 보여줘도(AC-041 위반) 그 결함을 검출하지 못했다. 여기서는 stepSources가
  // 없고 top-level `source`가 'fallback'인 픽스처로, 폴백 배지가 실제로 표시되는지 검증한다 —
  // `?? 'live'`로 되돌리면(정보를 지어내면) 이 테스트는 fail해야 한다.
  it('M1 — stepSources가 없고 source가 fallback이면, live로 지어내지 않고 폴백 배지가 표시된다', () => {
    const resultWithoutStepSourcesFallback = {
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
      // stepSources 필드 자체가 없다 — 배포 스큐/향후 확장 어댑터 스텁 시나리오를 흉내낸다.
    } as unknown as MediationResult;

    render(
      <SenderPanel
        {...baseProps()}
        text="내일까지 확인 부탁드립니다."
        recipient="boss@example.com"
        status="success"
        result={resultWithoutStepSourcesFallback}
        displayedUrgency="NORMAL"
      />,
    );

    expect(screen.getAllByText('폴백 응답 사용 중').length).toBeGreaterThan(0);
  });
});

// T54/AC-063① — `holidayConflicts`가 비어 있으면(기본값) 아무것도 렌더하지 않고, 값이 있으면
// 고정 문구 + "기한 재협상" 링크를 보여준다. `holidayConflicts`는 `result`가 아니라 별도 prop
// (`SenderPanelProps.holidayConflicts`)이다 — `MediationWorkspace`가 CRITICAL이면 `result`에
// 값이 있어도 이 prop만 빈 배열로 넘기는 게이팅을 하기 때문(AC-005, 코드 주석 참조).
describe('SenderPanel — T54 HolidayConflict', () => {
  const BASE_RESULT: MediationResult = {
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
    stepSources: { c1: 'live', c2: 'live', c4: 'live' },
    ticketOption: { offered: false, basis: 'signal_absent' },
  };
  const CONFLICT = { date: '2026-09-25T00:00:00Z', country: 'KR' as const, holidayName: '추석', dayIndex: 2 };

  it('holidayConflicts가 빈 배열이면(기본값) 아무것도 렌더하지 않는다', () => {
    render(
      <SenderPanel
        {...baseProps()}
        text="내일까지 확인 부탁드립니다."
        recipient="boss@example.com"
        status="success"
        result={BASE_RESULT}
        displayedUrgency="NORMAL"
      />,
    );

    expect(screen.queryByText(/연휴/)).toBeNull();
    expect(screen.queryByRole('button', { name: '기한 재협상' })).toBeNull();
  });

  it('충돌이 있으면 고정 문구 "이 마감일은 상대 국가 연휴 N일차입니다"를 보여준다', () => {
    render(
      <SenderPanel
        {...baseProps()}
        text="내일까지 확인 부탁드립니다."
        recipient="boss@example.com"
        status="success"
        result={BASE_RESULT}
        displayedUrgency="NORMAL"
        holidayConflicts={[CONFLICT]}
      />,
    );

    expect(screen.getByText('이 마감일은 상대 국가 연휴 2일차입니다.')).toBeTruthy();
  });

  it('"기한 재협상" 클릭 시 그 충돌의 날짜와 함께 onNegotiateDeadline이 호출된다', () => {
    const onNegotiateDeadline = vi.fn();
    render(
      <SenderPanel
        {...baseProps()}
        text="내일까지 확인 부탁드립니다."
        recipient="boss@example.com"
        status="success"
        result={BASE_RESULT}
        displayedUrgency="NORMAL"
        holidayConflicts={[CONFLICT]}
        onNegotiateDeadline={onNegotiateDeadline}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '기한 재협상' }));

    expect(onNegotiateDeadline).toHaveBeenCalledWith('2026-09-25T00:00:00Z');
  });

  it('onNegotiateDeadline이 없으면 링크 자체를 렌더하지 않는다(경고 문구만 남는다)', () => {
    render(
      <SenderPanel
        {...baseProps()}
        text="내일까지 확인 부탁드립니다."
        recipient="boss@example.com"
        status="success"
        result={BASE_RESULT}
        displayedUrgency="NORMAL"
        holidayConflicts={[CONFLICT]}
      />,
    );

    expect(screen.getByText(/연휴 2일차/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '기한 재협상' })).toBeNull();
  });

  it('국가명·공휴일명을 문구에 노출하지 않는다(국가별 서술 금지)', () => {
    render(
      <SenderPanel
        {...baseProps()}
        text="내일까지 확인 부탁드립니다."
        recipient="boss@example.com"
        status="success"
        result={BASE_RESULT}
        displayedUrgency="NORMAL"
        holidayConflicts={[CONFLICT]}
      />,
    );

    expect(screen.queryByText(/추석/)).toBeNull();
    expect(screen.queryByText(/한국/)).toBeNull();
  });
});
