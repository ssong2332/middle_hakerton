'use client';

import type { MisreadRisk } from '@cross-border/core';

export type MisreadRiskVariant = 'full' | 'reduced';

export interface MisreadRiskPanelProps {
  /** 근거가 없으면 빈 배열 — 이 경우 아무것도 렌더하지 않는다(AC-043②, hallucination 방지). */
  risks: MisreadRisk[];
  /**
   * 표시 밀도. `docs/UX.md` UX-004 States "MisreadRisk" — Full/Reduced 둘 다 **같은 데이터**를
   * 쓰고 표시 형태만 다르다(Planning Decision #57). 어느 tier가 "live"인지는 구현/일정 판단이며
   * 사용자별 설정이 아니다 — 이 컴포넌트는 그 선택을 상위(호출부)에 맡긴다.
   */
  variant: MisreadRiskVariant;
}

const RISK_PANEL_LABEL = '오해 위험';

/**
 * 🔴 Major 6②(reviewer REJECTED → 수정) — `quote`가 `misreading`/`evidence`와 달리 라벨 없는
 * `<p>`로만 노출돼 스크린리더가 "이게 인용문이다"를 알 수 없었다. 세 부분을 동등한 `<dt>`/`<dd>`
 * 쌍으로 노출한다(`docs/UX.md` UX-004 Accessibility "three separate labeled parts").
 */
function RiskItemDetails({ risk }: { risk: MisreadRisk }) {
  return (
    <dl>
      <dt>인용</dt>
      <dd>{risk.quote}</dd>
      <dt>예상되는 오해</dt>
      <dd>{risk.misreading}</dd>
      <dt>근거</dt>
      <dd>{risk.evidence}</dd>
    </dl>
  );
}

/**
 * T12 — 오해 사전 경고(`misreadRisks[]`) 표시 (AC-043). 사용자가 **변환문을 승인하기 전** 단계에서
 * 근거와 함께 확인할 수 있어야 한다(AC-043③) — 이 컴포넌트는 승인(Approve & Send) 흐름보다 먼저
 * 렌더되는 비교 화면 안에 배치된다(호출부 책임, `docs/UX.md` UX-004 States "MisreadRisk").
 *
 * - **Full**: 각 항목의 quote(요약 heading)와 misreading/evidence를 항상 펼쳐서 보여준다 —
 *   `docs/UX.md` "each item shows quote / expected misreading / evidence as three separate
 *   labeled parts"를 그대로 따른다.
 * - **Reduced**: "오해 위험 N건" 배지만 보이고, `<details>/<summary>`로 같은 3요소 텍스트를
 *   펼쳐 볼 수 있다 — 네이티브 `<details>`는 콘텐츠가 항상 DOM에 존재하고(스크린리더가 접근
 *   가능) 포커스된 `<summary>`에서 Enter/Space로 토글되므로 "키보드로 도달 가능한 툴팁,
 *   hover 전용 아님"(`docs/UX.md` UX-004 Accessibility) 요구를 만족한다.
 */
export function MisreadRiskPanel({ risks, variant }: MisreadRiskPanelProps) {
  if (risks.length === 0) {
    return null;
  }

  if (variant === 'reduced') {
    return (
      <section aria-label={RISK_PANEL_LABEL}>
        <details>
          <summary>
            {RISK_PANEL_LABEL} {risks.length}건
          </summary>
          <ul>
            {risks.map((risk, index) => (
              <li key={index}>
                <RiskItemDetails risk={risk} />
              </li>
            ))}
          </ul>
        </details>
      </section>
    );
  }

  return (
    <section aria-label={RISK_PANEL_LABEL}>
      <h3>
        {RISK_PANEL_LABEL} {risks.length}건
      </h3>
      <ul>
        {risks.map((risk, index) => (
          <li key={index}>
            <RiskItemDetails risk={risk} />
          </li>
        ))}
      </ul>
    </section>
  );
}
