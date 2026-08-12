/**
 * T8 — C1 긴급도 결과 표시 + override 컨트롤. AC-003(등급+근거 문장 표시) / AC-004(override
 * 선택 시 부모에 새 값을 알림 — "이후 처리에 반영"은 부모(`MediationDemoForm`)가 다음 요청의
 * `context.urgencyOverride`에 실어 보내는 것으로 완성된다, `MediationDemoForm.test.tsx` 참조).
 *
 * 🔴 `@testing-library/jest-dom`은 설치돼 있지 않다 — `BackTranslationPreview.test.tsx`와 같은
 * 이유로 vitest 내장 매처를 쓴다.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UrgencyPanel } from './UrgencyPanel';

describe('UrgencyPanel', () => {
  it('AC-003 — 긴급도 등급과 판단 근거 문장을 표시한다', () => {
    render(
      <UrgencyPanel
        urgency="CRITICAL"
        urgencyReason="프로덕션 장애로 즉시 대응이 필요합니다."
        isOverridden={false}
        onOverride={vi.fn()}
        source="live"
      />,
    );

    // (2026-08-12) raw enum('CRITICAL') 대신 한국어 라벨(URGENCY_LABELS.CRITICAL='긴급')을
    // 표시하도록 고쳤다 — 사용자가 실사용 중 raw 값 노출을 발견해 확인.
    expect(screen.getByText('긴급', { selector: 'strong' })).toBeTruthy();
    expect(screen.getByText('프로덕션 장애로 즉시 대응이 필요합니다.')).toBeTruthy();
  });

  it('AC-004 — 등급 선택 컨트롤을 바꾸면 onOverride가 새 값과 함께 호출된다', () => {
    const onOverride = vi.fn();
    render(
      <UrgencyPanel
        urgency="NORMAL"
        urgencyReason="일반 업무 요청입니다."
        isOverridden={false}
        onOverride={onOverride}
        source="live"
      />,
    );

    fireEvent.change(screen.getByLabelText('긴급도 조정'), { target: { value: 'CRITICAL' } });

    expect(onOverride).toHaveBeenCalledWith('CRITICAL');
  });

  it('isOverridden이 true면 사용자가 등급을 조정했다는 안내를 표시한다', () => {
    render(
      <UrgencyPanel
        urgency="CRITICAL"
        urgencyReason="근거"
        isOverridden={true}
        onOverride={vi.fn()}
        source="live"
      />,
    );

    expect(screen.getByText('사용자가 등급을 조정했습니다')).toBeTruthy();
  });

  it('isOverridden이 false면 조정 안내를 표시하지 않는다', () => {
    render(
      <UrgencyPanel
        urgency="NORMAL"
        urgencyReason="근거"
        isOverridden={false}
        onOverride={vi.fn()}
        source="live"
      />,
    );

    expect(screen.queryByText('사용자가 등급을 조정했습니다')).toBeNull();
  });

  it('선택 컨트롤은 현재 표시 중인 등급을 값으로 갖는다', () => {
    render(
      <UrgencyPanel
        urgency="LOW"
        urgencyReason="근거"
        isOverridden={false}
        onOverride={vi.fn()}
        source="live"
      />,
    );

    expect((screen.getByLabelText('긴급도 조정') as HTMLSelectElement).value).toBe('LOW');
  });

  // Minor(사용자 지시 유지보수 라운드) — `source` prop의 live/cache/fallback 단위 테스트가 0건
  // 이었다(형제 컴포넌트 ComparisonView.test.tsx/BackTranslationPreview.test.tsx는 각각 3건씩
  // 있다). 특히 'cache' 경로는 어디에서도 테스트되지 않았다. 판별력은 `UrgencyPanel.tsx`의
  // `{source !== 'live' && ...}` 렌더 분기를 일시적으로 주석 처리해 재실행 → 실패(red) → 원복 →
  // 재실행 → 통과(green)로 확인했다(구현 보고서 참조).
  it('AC-041 — source가 live면 "폴백 응답 사용 중" 배지를 표시하지 않는다', () => {
    render(
      <UrgencyPanel
        urgency="NORMAL"
        urgencyReason="근거"
        isOverridden={false}
        onOverride={vi.fn()}
        source="live"
      />,
    );

    expect(screen.queryByText('폴백 응답 사용 중')).toBeNull();
  });

  it('AC-041 — source가 cache면 "폴백 응답 사용 중" 배지를 표시한다(캐시도 live가 아니다)', () => {
    render(
      <UrgencyPanel
        urgency="NORMAL"
        urgencyReason="근거"
        isOverridden={false}
        onOverride={vi.fn()}
        source="cache"
      />,
    );

    expect(screen.getByText('폴백 응답 사용 중')).toBeTruthy();
  });

  it('AC-041 — source가 fallback이면 "폴백 응답 사용 중" 배지를 표시한다', () => {
    render(
      <UrgencyPanel
        urgency="NORMAL"
        urgencyReason="근거"
        isOverridden={false}
        onOverride={vi.fn()}
        source="fallback"
      />,
    );

    expect(screen.getByText('폴백 응답 사용 중')).toBeTruthy();
  });
});
