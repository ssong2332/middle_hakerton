/**
 * T12 — `ComparisonView` (AC-008 3열 비교, AC-007 보존 항목 굵게/요약 표시).
 * `docs/UX.md` UX-004 Accessibility: "Preserved items are marked bold AND labeled '(보존됨),'
 * not bold alone."
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { PreservedItem } from '@cross-border/core';
import { ComparisonView } from './ComparisonView';

describe('ComparisonView', () => {
  it('AC-008 — 원문/변환문/변환 이유 3열을 나란히 표시한다', () => {
    render(
      <ComparisonView
        originalText="내일까지 확인 부탁드립니다."
        transformed="Please confirm by tomorrow."
        reason="완곡한 요청을 명시적 기한이 있는 요청으로 변환했습니다."
        preserved={[]}
        source="live"
      />,
    );

    expect(screen.getByText('내일까지 확인 부탁드립니다.')).toBeTruthy();
    expect(screen.getByText('Please confirm by tomorrow.')).toBeTruthy();
    expect(
      screen.getByText('완곡한 요청을 명시적 기한이 있는 요청으로 변환했습니다.'),
    ).toBeTruthy();
  });

  // Major 4(reviewer REJECTED → 수정) — "나란히"가 텍스트만 확인하고 실제 레이아웃은 확인하지
  // 않았다. 이 리포에는 시각 회귀 도구가 없으므로(`docs/CodingRules.md` "E2E 도구... 도입하지
  // 않는다"), 3열이 실제로 가로 배치(flex)로 구현됐는지를 구조적으로 확인하는 것이 가능한 최선의
  // 검증이다.
  //
  // 🔴 (구현자, 2026-08-06 — CSS 실장 태스크) 레이아웃이 인라인 `style={{display:'flex'}}`에서
  // `ComparisonView.module.css`의 `.columns` 클래스로 옮겨졌다(`docs/design-mockups` 목업 기준
  // 실제 디자인 토큰 적용). `display:flex` 자체는 이제 컴파일된 CSS 파일에 있고 jsdom은 외부
  // 스타일시트 규칙을 적용해 보여주지 않으므로(`getComputedStyle`로도 확인 불가), 인라인 style
  // 속성을 더 이상 근거로 쓸 수 없다 — CSS Module 클래스가 실제로 부여됐는지(className 존재)와
  // 자식 3개가 그 컨테이너의 직계 자식이라는 구조는 계속 검증한다. `display:flex` 규칙이 실제로
  // 컴파일 산출물에 존재하는지는 `npm run build` 산출물 확인으로 별도 근거를 남긴다(구현 보고서).
  it('Major 4/AC-008 — 3열이 CSS Module 레이아웃 클래스가 적용된 컨테이너 안에서 나란히 배치된다', () => {
    render(
      <ComparisonView
        originalText="원문"
        transformed="변환문"
        reason="이유"
        preserved={[]}
        source="live"
      />,
    );

    const container = screen.getByLabelText('원문·변환문·변환 이유 비교');
    expect(container.className).not.toBe('');
    // 3열(원문/변환문/변환 이유) 각각이 flex 컨테이너의 직계 자식이어야 "나란히"가 성립한다.
    expect(container.children).toHaveLength(3);
  });

  it('AC-007 — 보존 항목을 굵게 표시하고 "(보존됨)" 라벨을 함께 붙인다', () => {
    const preserved: PreservedItem[] = [
      { kind: 'deadline', sourceText: '내일까지', transformedText: 'by tomorrow' },
    ];
    render(
      <ComparisonView
        originalText="내일까지 확인 부탁드립니다."
        transformed="Please confirm by tomorrow."
        reason="이유"
        preserved={preserved}
        source="live"
      />,
    );

    const strong = screen.getByText('by tomorrow', { selector: 'strong' });
    expect(strong).toBeTruthy();
    expect(screen.getByText('(보존됨)', { exact: false })).toBeTruthy();
  });

  it('보존 항목이 없으면 "보존된 항목" 요약 블록을 렌더하지 않는다(빈 박스 금지)', () => {
    render(
      <ComparisonView
        originalText="원문"
        transformed="변환문"
        reason="이유"
        preserved={[]}
        source="live"
      />,
    );

    expect(screen.queryByLabelText('보존된 항목')).toBeNull();
  });

  it('보존 항목 여러 건을 모두 표시한다', () => {
    const preserved: PreservedItem[] = [
      { kind: 'deadline', sourceText: '내일까지', transformedText: 'by tomorrow' },
      { kind: 'number', sourceText: '3건', transformedText: '3 items' },
    ];
    render(
      <ComparisonView
        originalText="원문"
        transformed="변환문"
        reason="이유"
        preserved={preserved}
        source="live"
      />,
    );

    expect(screen.getByText('by tomorrow', { selector: 'strong' })).toBeTruthy();
    expect(screen.getByText('3 items', { selector: 'strong' })).toBeTruthy();
  });

  // 🔴 (2026-08-05 복원 — F1-e, DECISIONS #48 · ADR-0009) `stepSources.c2`(이 컴포넌트 전용 진실)를
  // 받아 "폴백 응답 사용 중" 배지를 정확히 이 영역에 붙인다. Major 2가 되돌렸던 것은 단일 `source`
  // 로는 이 영역의 진실을 알 수 없었기 때문이며, 지금은 C2 전용 값만 받으므로 그 결함이 없다.
  it('AC-041 — source가 live면 "폴백 응답 사용 중" 배지를 표시하지 않는다', () => {
    render(
      <ComparisonView
        originalText="원문"
        transformed="변환문"
        reason="이유"
        preserved={[]}
        source="live"
      />,
    );

    expect(screen.queryByText('폴백 응답 사용 중')).toBeNull();
  });

  it('AC-041 — source가 fallback이면 "폴백 응답 사용 중" 배지를 표시한다', () => {
    render(
      <ComparisonView
        originalText="원문"
        transformed="변환문"
        reason="이유"
        preserved={[]}
        source="fallback"
      />,
    );

    expect(screen.getByText('폴백 응답 사용 중')).toBeTruthy();
  });

  it('AC-041 — source가 cache면 "폴백 응답 사용 중" 배지를 표시한다(캐시도 live가 아니다)', () => {
    render(
      <ComparisonView
        originalText="원문"
        transformed="변환문"
        reason="이유"
        preserved={[]}
        source="cache"
      />,
    );

    expect(screen.getByText('폴백 응답 사용 중')).toBeTruthy();
  });
});
