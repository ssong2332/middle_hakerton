'use client';

import type { PreservedItem, ResponseSource } from '@cross-border/core';
import { NON_LIVE_NOTICE } from '../lib/non-live-notice';
import styles from './ComparisonView.module.css';

export interface ComparisonViewProps {
  originalText: string;
  transformed: string;
  reason: string;
  preserved: PreservedItem[];
  /**
   * 🔴 F1-e(2026-08-05 — DECISIONS #48 · ADR-0009 D3) 복원. `MediationResult.source`(세 스텝을
   * 합친 단일 값)가 아니라 **`MediationResult.stepSources.c2`**를 받는다 — 이 영역이 보여주는
   * `transformed`/`reason`/`preserved`는 C2 산출물이므로, "이 영역의 진실"은 C2의 출처뿐이다
   * (ADR-0009 D3 매핑표). 아래 Open Question 각주가 옛 원복 사유를 남긴다.
   */
  source: ResponseSource;
}

/**
 * T12 — UX-004 원문/변환문/변환 이유 3열 비교 뷰 (AC-008) + 보존 항목 표시 (AC-006/AC-007).
 *
 * 🔴 보존 항목은 **요약 라인**으로 분리 표시한다("본문에 굵게" 방식 대신) — `transformed` 문자열
 * 안에서 `PreservedItem.transformedText`의 위치(offset)를 계약(F1)이 제공하지 않아, 본문 안에
 * 안전하게 `<strong>`을 삽입할 지점을 알 수 없다. `docs/UX.md` UX-004는 "굵게 표시되거나 별도
 * 요약 라인으로"(AC-007) 둘 중 하나를 요구하므로 요약 라인 쪽을 택했다. 각 항목은
 * `docs/UX.md` UX-004 Accessibility "Preserved items are marked bold AND labeled '(보존됨),'
 * not bold alone"을 그대로 따라 굵게 + "(보존됨)" 라벨을 함께 붙인다.
 *
 * 보존 항목이 없으면(원문에 보존 대상이 없는 정상 상태) 요약 블록 자체를 렌더하지 않는다 —
 * 빈 "보존된 항목" 박스를 보여주지 않는다(다른 화면의 "no-fabrication" 패턴과 같은 취지로,
 * 값이 없을 때 빈 컨테이너를 노출하지 않는다).
 *
 * 🔴 (2026-08-05 해소 — F1-e, `docs/DECISIONS.md` #48 · `docs/adr/0009-step-level-response
 * -provenance.md`) 아래는 이력 보존을 위해 지우지 않는다. **Major 2(2026-08-05)가 "폴백 응답
 * 사용 중" 배지를 되돌린 이유**: `MediationResult.source`는 C1/C2/C4 세 스텝을 "가장 신뢰도가
 * 낮은 쪽이 이긴다"로 합친 **단일** 값이라, 이 값만으로는 "이 컴포넌트가 보여주는 변환문(C2)이
 * 실제로 폴백인지" 알 수 없었다 — C4만 폴백이고 C2는 라이브여도 이 배지가 떴다(라이브 콘텐츠를
 * 폴백으로 오표시하는 결함).
 *
 * **그 뒤 architect가 남긴 Open Question은 ADR-0009로 해소됐다** — `MediationResult`가
 * `stepSources: { c1, c2, c4 }`(각각 `ResponseSource`)를 계약으로 노출하므로, 이 컴포넌트는
 * `stepSources.c2`만 보고 배지를 정확히 이 영역에 붙일 수 있다(ADR-0009 D3 매핑표: "c2 →
 * transformed·reason·preserved·misreadRisks"). `BackTranslationPreview`도 같은 라운드에서
 * `source` 대신 `stepSources.c4`를 받도록 갱신됐다(`SenderPanel.tsx` 배선 참조) — 두 컴포넌트가
 * 이제 **서로 다른 스텝의 진실**을 각자 정확히 본다(C2 live + C4 fallback이면 이 컴포넌트에는
 * 배지가 뜨지 않고 역번역 영역에만 뜬다).
 */
export function ComparisonView({
  originalText,
  transformed,
  reason,
  preserved,
  source,
}: ComparisonViewProps) {
  return (
    <section aria-label="원문·변환문·변환 이유 비교" className={styles.columns}>
      <div className={styles.column}>
        <h3>원문</h3>
        <p>{originalText}</p>
      </div>
      <div className={`${styles.column} ${styles.transformedColumn}`}>
        <h3>변환문</h3>
        <p>{transformed}</p>
        {preserved.length > 0 && (
          <div aria-label="보존된 항목" className={styles.preserved}>
            <h4>보존된 항목</h4>
            <ul>
              {preserved.map((item, index) => (
                <li key={`${item.kind}-${index}`}>
                  <strong>{item.transformedText}</strong> (보존됨)
                </li>
              ))}
            </ul>
          </div>
        )}
        {/* AC-041, ADR-0009 D3 — 이 영역(변환문/변환 이유)의 진실은 `stepSources.c2`뿐이다.
            전체 응답 합산값(`source`)이 아니라 C2 전용 값만 보고 판단한다. */}
        {source !== 'live' && (
          <p role="status" className={styles.notice}>
            {NON_LIVE_NOTICE}
          </p>
        )}
      </div>
      <div className={styles.column}>
        <h3>변환 이유</h3>
        <p>{reason}</p>
      </div>
    </section>
  );
}
