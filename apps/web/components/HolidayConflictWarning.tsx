'use client';

/**
 * T54 — UX-004 HolidayConflict 상태(`docs/UX.md:411-441`). AC-048, AC-057②③, AC-063.
 *
 * 🔴 **`conflicts`가 비어 있으면 아무것도 렌더하지 않는다** — `MisreadRiskPanel`과 같은 원칙
 * (근거 없는 항목을 지어내지 않는다). `docs/UX.md:434` HolidayConflict 상태 주석의 요구가 더
 * 강하다: **"충돌 없음"과 "그 국가의 공휴일 데이터 자체가 없음"이 화면상 완전히 동일하게
 * 보여야 한다**(AC-063①②) — 라벨도, 회색 배지도, 빈 박스도 없다. 두 경우 모두 백엔드가 이미
 * `holidayConflicts: []`로 응답하므로(`packages/core/src/pipeline.ts`), 이 컴포넌트는 배열이
 * 비었는지만 보면 되고 그 이유를 구분할 필요도, 방법도 없다(구분은 내부 상태에만 존재 —
 * `hasHolidayData()`, 이 화면 밖의 일).
 *
 * 🔴 **고정 문구를 그대로 쓴다** — `docs/UX.md:434` *"이 마감일은 상대 국가 연휴 N일차입니다"*
 * (N = `HolidayConflict.dayIndex`). 국가명·공휴일명을 문구에 섞지 않는다(국가별 서술 금지,
 * Planning Decision #6/#50과 같은 원칙 — 이 데이터 자체는 국가 필드를 갖지만 표시 문구는
 * 그 필드를 노출하지 않는다, 문서가 명시한 문구 밖의 내용을 지어내지 않는다).
 */
import type { HolidayConflict } from '@cross-border/core';
import styles from './HolidayConflictWarning.module.css';

export interface HolidayConflictWarningProps {
  conflicts: HolidayConflict[];
  /**
   * "기한 재협상" 링크 클릭 시, 그 충돌의 마감일(UTC ISO)과 함께 호출된다(`docs/UX.md:418`
   * "pre-fills the needed-by field with the flagged deadline"). 부모(`MediationWorkspace`)가
   * `ResponseDeadlineModal`을 그 값으로 열 책임을 진다. 생략하면(예: CRITICAL이라 협상 화면
   * 자체가 열릴 수 없는 상태, AC-005) 링크를 렌더하지 않는다.
   */
  onNegotiate?: (deadlineIso: string) => void;
}

export function HolidayConflictWarning({ conflicts, onNegotiate }: HolidayConflictWarningProps) {
  if (conflicts.length === 0) return null;

  return (
    <div className={styles.list} role="status">
      {conflicts.map((conflict) => (
        <p key={`${conflict.date}-${conflict.dayIndex}`} className={styles.item}>
          이 마감일은 상대 국가 연휴 {conflict.dayIndex}일차입니다.
          {onNegotiate && (
            <button
              type="button"
              className={styles.negotiateLink}
              onClick={() => onNegotiate(conflict.date)}
            >
              기한 재협상
            </button>
          )}
        </p>
      ))}
    </div>
  );
}
