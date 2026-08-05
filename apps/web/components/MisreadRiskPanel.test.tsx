/**
 * T12 — `MisreadRiskPanel` (AC-043). `docs/UX.md` UX-004 States "MisreadRisk":
 * 빈 배열이면 아무것도 렌더하지 않는다(AC-043②, 빈 경고 박스 금지). 비어 있지 않으면 승인 전
 * 단계에서 quote/misreading/evidence 3요소를 확인할 수 있어야 한다(AC-043①③).
 * 두 변형(Full/Reduced)은 `docs/UX.md` UX Decision Log "Misread Risk Display: Two Presentation
 * Tiers"와 Planning Decision #57 — 표시만 축소되고 데이터는 항상 동일하다.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { MisreadRisk } from '@cross-border/core';
import { MisreadRiskPanel } from './MisreadRiskPanel';

const risks: MisreadRisk[] = [
  {
    quote: '확인 부탁드립니다',
    misreading: "상대가 '단순 참고'로 받아들여 액션을 취하지 않을 수 있음",
    evidence: '명시적 기한·행동 지시가 없는 완곡 표현',
  },
  {
    quote: '가능하시면',
    misreading: '선택 사항으로 오인할 수 있음',
    evidence: '조건부 어미가 요청의 필수성을 약화시킴',
  },
];

describe('MisreadRiskPanel', () => {
  it('AC-043② — risks가 빈 배열이면 아무것도 렌더하지 않는다', () => {
    const { container } = render(<MisreadRiskPanel risks={[]} variant="full" />);
    expect(container.textContent).toBe('');
  });

  it('AC-043①③ — Full 변형은 각 항목의 quote/misreading/evidence를 모두 노출한다', () => {
    render(<MisreadRiskPanel risks={risks} variant="full" />);

    for (const risk of risks) {
      expect(screen.getByText(risk.quote)).toBeTruthy();
      expect(screen.getByText(risk.misreading)).toBeTruthy();
      expect(screen.getByText(risk.evidence)).toBeTruthy();
    }
  });

  it('Reduced 변형은 건수 배지를 보여주고, 키보드로 펼치면 같은 3요소 텍스트를 노출한다', () => {
    render(<MisreadRiskPanel risks={risks} variant="reduced" />);

    expect(screen.getByText('오해 위험 2건')).toBeTruthy();
    // 접혀 있는 상태에서도 스크린리더 접근 가능한 텍스트로 존재해야 한다(details/summary는
    // 콘텐츠가 DOM에 있고 hidden 속성만 토글한다 — hover 전용이 아니라 키보드로 도달 가능).
    for (const risk of risks) {
      expect(screen.getByText(risk.misreading)).toBeTruthy();
      expect(screen.getByText(risk.evidence)).toBeTruthy();
    }
  });

  it('Reduced 변형에서도 risks가 비어 있으면 아무것도 렌더하지 않는다', () => {
    const { container } = render(<MisreadRiskPanel risks={[]} variant="reduced" />);
    expect(container.textContent).toBe('');
  });

  // Major 6②(reviewer REJECTED → 수정) — `docs/UX.md` UX-004 Accessibility "Each Misread Risk
  // item's three parts (quote/misreading/evidence) are exposed as separate labeled text for
  // screen readers." quote가 misreading/evidence와 동등한 `<dt>`/`<dd>` 라벨을 가져야 한다.
  it('Major 6② — Full 변형에서 quote가 misreading/evidence와 동등하게 <dt>인용</dt>로 라벨링된다', () => {
    render(<MisreadRiskPanel risks={risks} variant="full" />);

    const quoteLabels = screen.getAllByText('인용');
    expect(quoteLabels.length).toBe(risks.length);
    for (const label of quoteLabels) {
      expect(label.tagName).toBe('DT');
    }
    // 라벨 다음 형제가 실제 quote 텍스트를 담은 <dd>여야 한다.
    const firstDd = quoteLabels[0].nextElementSibling;
    expect(firstDd?.tagName).toBe('DD');
    expect(firstDd?.textContent).toBe(risks[0].quote);
  });

  it('Major 6② — Reduced 변형(펼친 상태)에서도 quote가 <dt>인용</dt>로 라벨링된다', () => {
    render(<MisreadRiskPanel risks={risks} variant="reduced" />);

    const quoteLabels = screen.getAllByText('인용');
    expect(quoteLabels.length).toBe(risks.length);
  });
});
