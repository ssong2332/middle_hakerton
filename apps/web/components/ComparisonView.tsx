'use client';

import type { PreservedItem } from '@cross-border/core';

export interface ComparisonViewProps {
  originalText: string;
  transformed: string;
  reason: string;
  preserved: PreservedItem[];
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
 */
// Major 4(reviewer REJECTED → 수정) — AC-008 "원문/변환문/변환 이유가 한 화면에서 나란히 비교
// 가능하다"가 시각적으로 구현되지 않았다(리포 전체에 스타일 0건 — 이 클러스터가 만든 회귀는
// 아니다). 정교한 디자인 시스템 없이 최소 flex 레이아웃으로 "나란히" 조건만 충족한다.
const columnsStyle = { display: 'flex', gap: '16px' } as const;
const columnStyle = { flex: '1 1 0%', minWidth: 0 } as const;

export function ComparisonView({
  originalText,
  transformed,
  reason,
  preserved,
}: ComparisonViewProps) {
  return (
    <section aria-label="원문·변환문·변환 이유 비교" style={columnsStyle}>
      <div style={columnStyle}>
        <h3>원문</h3>
        <p>{originalText}</p>
      </div>
      <div style={columnStyle}>
        <h3>변환문</h3>
        <p>{transformed}</p>
        {preserved.length > 0 && (
          <div aria-label="보존된 항목">
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
      </div>
      <div style={columnStyle}>
        <h3>변환 이유</h3>
        <p>{reason}</p>
      </div>
    </section>
  );
}
