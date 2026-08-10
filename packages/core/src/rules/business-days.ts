// 침묵 감지 ① — 업무일 경과 계산. AC-044②. 담당: [BE-B] T51. `docs/Tasks.md` T51.
// `docs/API.md` "GET /api/messages" Response 절: "businessDaysElapsed = 주말 + 수신자 국가
// 공휴일 제외(AC-044②). recipientCountry가 null(데이터 없는 국가)이면 주말만 제외하고
// 계산하되 어떤 라벨도 반환하지 않는다(AC-063①)".
//
// 🔴 LLM 호출 없음, 결정적 계산이다(T31/T39/T32와 같은 원칙). 공휴일 판정은 T53의
// `holiday-conflict.ts`(`isHolidayDate`)를 그대로 재사용한다 — 중복 구현 금지.
import type { CountryCode } from '../contract';
import { REMINDER_THRESHOLD_BUSINESS_DAYS } from '../constants';
import { isHolidayDate } from './holiday-conflict';
import { addDaysToDateString, formatLocal } from './meeting-times';

// 안전장치 — `now`가 `sentAt`보다 극단적으로 나중이어도 무한루프를 만들지 않는다
// (`meeting-times.ts`의 `enumerateDates` MAX_DAYS와 같은 이유). 실사용 범위를 넉넉히 넘는다.
const MAX_SCAN_DAYS = 3660;

function toLocalDate(instant: Date, timeZone: string): string {
  return formatLocal(instant, timeZone).split(' ')[0];
}

function isWeekend(dateStr: string): boolean {
  const [year, month, day] = dateStr.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=일, 6=토
  return weekday === 0 || weekday === 6;
}

/**
 * `sentAt`(발송 시각, UTC ISO 8601)부터 `now`까지 수신자 로컬 기준으로 경과한 **업무일** 수를
 * 센다 — 발송 당일은 세지 않고(그날 아직 응답할 시간이 안 지났다는 전제), 그 다음 날부터 `now`가
 * 속한 날까지 주말·공휴일이 아닌 날만 센다.
 *
 * 🔴 `timezone`이 `null`이면(수신자 타임존 미상) UTC로 계산한다 — "수신자 로컬 기준"을 계산할
 * 근거 자체가 없을 때의 방어적 기본값이며, `sent_messages.recipient_timezone`이 nullable이라
 * 실제로 일어날 수 있는 상태다(추측으로 임의 타임존을 채우지 않는다).
 *
 * 🔴 `country`가 `null`이면 공휴일 제외 없이 주말만 제외한다(AC-063①, "수신자 국가 공휴일" 절
 * 그대로 — 데이터 없는 국가와 미상을 구분해 노출하지 않는다, `isHolidayDate`가 이미 그 규칙을
 * 구현하고 있어 여기서는 그대로 넘기기만 한다).
 */
export function businessDaysElapsed(
  sentAt: string,
  now: Date,
  timezone: string | null,
  country: CountryCode | null,
): number {
  const tz = timezone ?? 'UTC';
  const sentDate = toLocalDate(new Date(sentAt), tz);
  const nowDate = toLocalDate(now, tz);

  let count = 0;
  let cursor = addDaysToDateString(sentDate, 1);
  for (let i = 0; i < MAX_SCAN_DAYS && cursor <= nowDate; i += 1) {
    if (!isWeekend(cursor) && !isHolidayDate(cursor, country)) {
      count += 1;
    }
    cursor = addDaysToDateString(cursor, 1);
  }
  return count;
}

/** `docs/API.md` "GET /api/messages" — `reminderSuggested = businessDaysElapsed >= 2`. */
export function isReminderSuggested(businessDays: number): boolean {
  return businessDays >= REMINDER_THRESHOLD_BUSINESS_DAYS;
}
