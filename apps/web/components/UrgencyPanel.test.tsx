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
      />,
    );

    expect(screen.getByText('CRITICAL', { selector: 'strong' })).toBeTruthy();
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
      />,
    );

    expect(screen.queryByText('사용자가 등급을 조정했습니다')).toBeNull();
  });

  it('선택 컨트롤은 현재 표시 중인 등급을 값으로 갖는다', () => {
    render(
      <UrgencyPanel urgency="LOW" urgencyReason="근거" isOverridden={false} onOverride={vi.fn()} />,
    );

    expect((screen.getByLabelText('긴급도 조정') as HTMLSelectElement).value).toBe('LOW');
  });
});
