// 응답 기한 협상 — 역제안 로직. AC-036, AC-057, AC-005(지연 절반). 담당: [BE-B] T39.
// `docs/Tasks.md` T39 · `docs/API.md` "POST /api/deadline/check" · `docs/UX.md` UX-005.
//
// 🔴 CRITICAL 자기 배제(AC-005)는 이 파일이 아니라 라우트(`apps/web/app/api/deadline/check/route.ts`)가
// `resolveDeliveryPath()`(`rules/urgency-routing.ts`) 하나로 판정한다 — 이 파일은 긴급도를
// 아예 모른다(재구현 금지, `docs/API.md:279`). 이 파일은 NORMAL/LOW에서만 호출된다는 전제로
// "실현 가능한가"만 계산한다.
//
// 🔴 T31의 데이터 모델(`WorkWindow`)과 타임존 변환(`zonedTimeToUtc`/`formatLocal`)을 그대로
// 재사용한다(`docs/Tasks.md` T39 "T31의 근무시간 데이터 모델을 재사용"). 새로 만들지 않는다.
import type { CountryCode } from '../contract';
import { isHolidayDate } from './holiday-conflict';
import { addDaysToDateString, formatLocal, zonedTimeToUtc, type WorkWindow } from './meeting-times';

export interface DeadlineRecipient extends WorkWindow {
  /** 공휴일 대조 대상 국가. 데이터가 없는 국가·미상이면 `null`(AC-057, AC-063①). */
  country: CountryCode | null;
}

export interface CounterOffer {
  /** 대체 기한(UTC ISO 8601) — `neededBy`와 같은 표현. */
  date: string;
  /** 이 날짜를 고른 이유(사람이 읽는 문장). */
  rationale: string;
}

export interface DeadlineCheckResult {
  feasible: boolean;
  reason: string;
  counterOffers: CounterOffer[];
}

const MAX_COUNTER_OFFERS = 3;
// 🔴 안전장치 — `findCounterOffers`가 근무일이 극단적으로 좁거나 대상국 공휴일이 길게 이어져도
// 무한루프를 만들지 않는다(`meeting-times.ts`의 `enumerateDates` MAX_DAYS와 같은 이유).
const MAX_SCAN_DAYS = 366;

function splitLocal(instant: Date, timeZone: string): { date: string; time: string } {
  const [date, time] = formatLocal(instant, timeZone).split(' ');
  return { date, time };
}

function findCounterOffers(
  fromLocalDate: string,
  recipient: DeadlineRecipient,
  maxOffers: number,
): CounterOffer[] {
  const offers: CounterOffer[] = [];
  let cursor = fromLocalDate;
  for (let i = 0; i < MAX_SCAN_DAYS && offers.length < maxOffers; i += 1) {
    if (!isHolidayDate(cursor, recipient.country)) {
      const offerInstant = zonedTimeToUtc(cursor, recipient.workStart, recipient.timezone);
      offers.push({
        date: offerInstant.toISOString(),
        rationale: `${cursor} ${recipient.workStart}(수신자 현지 시각, ${recipient.timezone}) — 수신자 근무시간 내이며 공휴일과 겹치지 않습니다`,
      });
    }
    cursor = addDaysToDateString(cursor, 1);
  }
  return offers;
}

/**
 * `neededBy`(발신자가 입력한 필요 기한, UTC ISO 8601)가 수신자 근무시간·공휴일 기준으로
 * 실현 가능한지 판정한다(AC-036 a). 불가능하면 대체 기한을 최소 1개(최대 3개) 역제안한다
 * (AC-036 b) — **자동으로 기한을 바꾸지 않는다**, 역제안만 반환하고 선택은 호출부(사용자)가
 * 한다(AC-036 c, `docs/API.md:276`).
 */
export function checkDeadlineFeasibility(
  neededBy: string,
  recipient: DeadlineRecipient,
): DeadlineCheckResult {
  const instant = new Date(neededBy);
  const { date: localDate, time: localTime } = splitLocal(instant, recipient.timezone);

  const inWorkWindow = localTime >= recipient.workStart && localTime <= recipient.workEnd;
  const onHoliday = isHolidayDate(localDate, recipient.country);

  if (inWorkWindow && !onHoliday) {
    return {
      feasible: true,
      reason: `${localDate} ${localTime}(수신자 현지 시각)은 수신자 근무시간(${recipient.workStart}~${recipient.workEnd}) 내이며 공휴일과 겹치지 않습니다`,
      counterOffers: [],
    };
  }

  const reason = onHoliday
    ? `${localDate}은 수신자 국가의 공휴일과 겹칩니다`
    : `${localDate} ${localTime}(수신자 현지 시각)은 수신자 근무시간(${recipient.workStart}~${recipient.workEnd}) 밖입니다`;

  // 같은 날이 근무시간 위반으로만 불가능하면(공휴일 아님) 그날부터, 공휴일이면 다음날부터 스캔한다.
  const scanFrom = onHoliday ? addDaysToDateString(localDate, 1) : localDate;

  return {
    feasible: false,
    reason,
    counterOffers: findCounterOffers(scanFrom, recipient, MAX_COUNTER_OFFERS),
  };
}
