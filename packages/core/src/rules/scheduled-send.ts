// R3 비동기 예약 발송 추천("퇴근 요정") — AC-024. 담당: [BE-B] T32. `docs/Tasks.md` T32.
//
// 🔴 "수신자 로컬 아침"의 정의(`docs/UX.md:495` UX-006 Architect Handoff가 architect 결정
// 사항으로 남겨 뒀던 값)는 사용자 결정(2026-08-10)으로 확정했다 — **고정값 09:00**, "새벽"(추천
// 발동 구간)은 **수신자 로컬 21:00~다음날 07:00**(자정을 넘어간다). T31/T39처럼 사용자가 근무
// 시간을 직접 입력하는 구조가 아니다 — T32 태스크 원문이 입력 필드를 요구하지 않는다.
//
// 🔴 LLM 호출 없음, 결정적 계산이다(T31/T39와 같은 원칙). 타임존 변환은 `meeting-times.ts`가
// 이미 구현한 `formatLocal`/`zonedTimeToUtc`/`addDaysToDateString`을 그대로 재사용한다(새로
// 만들지 않는다).
import { addDaysToDateString, formatLocal, zonedTimeToUtc } from './meeting-times';

const DAWN_START = '21:00';
const DAWN_END = '07:00';
const SUGGESTED_MORNING = '09:00';

export interface ScheduleSuggestion {
  /** 지금이 수신자 기준 "새벽"(21:00~07:00)이라 예약 발송을 추천하는가. */
  recommended: boolean;
  /** 수신자 현지 시각, `YYYY-MM-DD HH:mm`(참고용 — UI가 근거로 표시할 수 있게). */
  recipientLocalNow: string;
  /** 추천 시 채울 예약 시각(UTC ISO 8601, 수신자 로컬 09:00에 대응). 추천이 아니면 `null`. */
  suggestedUtc: string | null;
}

/**
 * `now`(기본값: 호출 시점) 기준으로 수신자에게 즉시 발송하면 "새벽"에 해당하는지 판정하고,
 * 그렇다면 수신자 로컬 다음(또는 오늘 남은) 09:00을 예약 시각으로 추천한다(AC-024).
 *
 * 🔴 CRITICAL 메시지에는 이 추천이 적용되지 않는다(AC-005) — 이 함수 자체는 긴급도를 모른다
 * (T39의 `checkDeadlineFeasibility()`와 같은 원칙, 재구현 금지). CRITICAL 게이트는 호출부
 * (`apps/web/app/api/messages/route.ts`)가 `resolveDeliveryPath()` 하나로만 판정한다.
 */
export function suggestScheduledSend(
  recipientTimezone: string,
  now: Date = new Date(),
): ScheduleSuggestion {
  const [nowDate, nowTime] = formatLocal(now, recipientTimezone).split(' ');
  const recipientLocalNow = `${nowDate} ${nowTime}`;

  const isDawn = nowTime >= DAWN_START || nowTime < DAWN_END;
  if (!isDawn) {
    return { recommended: false, recipientLocalNow, suggestedUtc: null };
  }

  // 자정 이후~07:00 이전이면 같은 날 09:00, 21:00 이후면 다음날 09:00.
  const suggestedDate = nowTime < DAWN_END ? nowDate : addDaysToDateString(nowDate, 1);
  const suggestedUtc = zonedTimeToUtc(suggestedDate, SUGGESTED_MORNING, recipientTimezone).toISOString();

  return { recommended: true, recipientLocalNow, suggestedUtc };
}
