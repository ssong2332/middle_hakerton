'use client';

import type { ResponseSource, UrgencyLevel } from '@cross-border/core';
import { NON_LIVE_NOTICE } from '../lib/non-live-notice';
import styles from './UrgencyPanel.module.css';

export interface UrgencyPanelProps {
  /** 화면에 표시할 등급 — 부모가 override(있으면)와 C1 판정 중 무엇을 보일지 계산해 넘긴다. */
  urgency: UrgencyLevel;
  /**
   * 그 등급으로 판정한 근거 문장(AC-003). 🔴 override 여부와 무관하게 항상 C1이 실제로 판단한
   * 근거를 보여준다 — override는 사용자의 수동 선택이라 그 자체의 "판단 근거 문장"이 존재하지
   * 않으며, 지어내면 `docs/CodingRules.md` Error Handling "없는 값을 지어내지 않는다" 위반이다.
   */
  urgencyReason: string;
  /** 사용자가 이 등급을 override로 선택했는지 — true면 조정 안내를 함께 보여준다. */
  isOverridden: boolean;
  /** 사용자가 select에서 등급을 바꿀 때마다 새 값을 부모에 알린다(AC-004). */
  onOverride: (value: UrgencyLevel) => void;
  /**
   * 🔴 C-1(2026-08-05, reviewer REJECTED → 수정, AC-041 회귀) — `MediationResult.stepSources.c1`
   * (ADR-0009 D3 매핑표: "c1 → urgency(판정분)·urgencyReason → `UrgencyPanel.tsx`"). 이 영역이
   * 보여주는 `urgency`/`urgencyReason`은 C1 산출물이므로 "이 영역의 진실"은 C1 전용 출처뿐이다 —
   * 합산값(`MediationResult.source`)이 아니다. `ComparisonView`/`BackTranslationPreview`와 같은
   * 패턴("폴백 응답 사용 중", `role="status"`)으로 non-live일 때 배지를 표시한다.
   */
  source: ResponseSource;
}

const URGENCY_LEVELS: UrgencyLevel[] = ['CRITICAL', 'NORMAL', 'LOW'];

/**
 * C1 긴급도 결과 표시 + override UI(`docs/UX.md` UX-004 "urgency badge ... and an override
 * control letting the user change the urgency level manually", AC-003/AC-004).
 *
 * 🔴 select는 그 자체로 네트워크 요청을 만들지 않으므로 `docs/UX.md` Interaction Patterns의
 * "Duplicate/double-click submission"(제출 컨트롤 자기 비활성화) 대상이 아니다 — 그 패턴은
 * "submit-type control"에 적용되며, 이 select는 로컬 상태만 바꾼다. override 값을 실제
 * 요청에 싣는 것은 다음 "실행"(제출 컨트롤) 클릭이고, 그 컨트롤의 자기 비활성화는
 * `MediationDemoForm`이 이미 담당한다.
 */
export function UrgencyPanel({
  urgency,
  urgencyReason,
  isOverridden,
  onOverride,
  source,
}: UrgencyPanelProps) {
  return (
    <section aria-label="긴급도" className={styles.panel}>
      {/* 접근성 — 배지는 색상만이 아니라 텍스트 라벨로도 등급을 드러낸다(`docs/UX.md` UX-004
          Accessibility "Urgency badge includes a text label, not color alone"). */}
      <div className={styles.badgeRow}>
        <span className={styles.badgeLabel}>긴급도</span>
        <p>
          <strong className={styles.badge}>{urgency}</strong>
        </p>
      </div>
      <p className={styles.reason}>{urgencyReason}</p>
      {/* AC-041, ADR-0009 D3 — 이 영역(등급/근거)의 진실은 `stepSources.c1`뿐이다. */}
      {source !== 'live' && (
        <p role="status" className={styles.notice}>
          {NON_LIVE_NOTICE}
        </p>
      )}
      {isOverridden && (
        <p role="status" className={styles.overriddenNote}>
          사용자가 등급을 조정했습니다
        </p>
      )}
      <label htmlFor="urgency-override" className={styles.overrideLabel}>
        긴급도 조정
      </label>
      <select
        id="urgency-override"
        value={urgency}
        onChange={(event) => onOverride(event.target.value as UrgencyLevel)}
      >
        {URGENCY_LEVELS.map((level) => (
          <option key={level} value={level}>
            {level}
          </option>
        ))}
      </select>
    </section>
  );
}
