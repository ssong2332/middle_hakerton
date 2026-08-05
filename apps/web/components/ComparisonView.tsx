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
 *
 * 🔴 Major 2(reviewer 재검토 → 되돌림, 2026-08-05) — 이 컴포넌트에 "폴백 응답 사용 중" 배지를
 * 추가했던 MJ-2 변경(`source?: ResponseSource` prop)을 되돌렸다. `MediationResult.source`는
 * C1/C2/C4 세 스텝을 "가장 신뢰도가 낮은 쪽이 이긴다"로 합친 **단일** 값이라(`apps/web/app/api
 * /mediate/route.ts` `combineSource`), 이 값만으로는 "이 컴포넌트가 보여주는 변환문(C2)이 실제로
 * 폴백인지" 알 수 없다 — C4만 폴백이고 C2는 라이브여도 이 배지가 떴다. 즉 라이브 콘텐츠를
 * 폴백이라고 근거 없이 표시할 수 있는 결함이 있어, 배지·prop을 모두 제거했다.
 *
 * **Open Question(architect 결정 필요)** — "어느 스텝이 폴백인지" 클라이언트가 구분하려면
 * `MediationResult`(F1, packages/core/src/contract.ts)가 스텝별 provenance(예:
 * `sources: { c1: ResponseSource; c2: ResponseSource; c4: ResponseSource }`)를 노출해야 한다.
 * 계약 확장은 architect 소유(F1은 이 컴포넌트 레벨에서 고칠 수 있는 문제가 아니다) — 계약이
 * 확장되기 전까지는 `BackTranslationPreview`의 단일 배지만 유지한다(그 배지도 사실 같은 한계를
 * 안고 있다 — 합쳐진 단일 `source` 하나만 본다 — 이건 이번 라운드가 만든 새 결함이 아니라
 * 기존 컴포넌트의 기존 한계이므로 이번 되돌림 범위 밖이다).
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
