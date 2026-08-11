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
 *
 * 🔴 **판정 기준(2026-08-10 reviewer 재검토로 확정, 사용자 결정)**: 마감이 **근무 시작 시각
 * 이후**이고 **공휴일이 아니면** 실현 가능하다 — 근무 종료 이후 마감은 오히려 하루 전체를 쓸
 * 수 있으므로 문제가 되지 않는다(회의 시간 추천의 "그 순간에 응답해야 한다"는 해석과 다르다,
 * `docs/Tasks.md` T39 각주 참조). 불가능한 두 경우만 있다: ① 근무 시작 **전**(아직 근무가
 * 시작되지 않아 그 시각까지 처리할 시간이 없다) ② 공휴일(그날 근무 자체가 없다).
 */
export function checkDeadlineFeasibility(
  neededBy: string,
  recipient: DeadlineRecipient,
): DeadlineCheckResult {
  const instant = new Date(neededBy);
  const { date: localDate, time: localTime } = splitLocal(instant, recipient.timezone);

  const beforeWorkStarts = localTime < recipient.workStart;
  const onHoliday = isHolidayDate(localDate, recipient.country);

  if (!beforeWorkStarts && !onHoliday) {
    return {
      feasible: true,
      reason: `${localDate} ${localTime}(수신자 현지 시각)은 수신자 근무 시작(${recipient.workStart}) 이후이며 공휴일과 겹치지 않습니다`,
      counterOffers: [],
    };
  }

  const reason = onHoliday
    ? `${localDate}은 수신자 국가의 공휴일과 겹칩니다`
    : `${localDate} ${localTime}(수신자 현지 시각)은 수신자 근무 시작(${recipient.workStart}) 이전입니다`;

  // 같은 날이 근무시작 전이라서만 불가능하면(공휴일 아님) 그날 근무시작 시각을 첫 대안으로 쓸 수
  // 있어 그날부터, 공휴일이면 그날 자체가 근무일이 아니므로 다음날부터 스캔한다.
  const scanFrom = onHoliday ? addDaysToDateString(localDate, 1) : localDate;

  return {
    feasible: false,
    reason,
    counterOffers: findCounterOffers(scanFrom, recipient, MAX_COUNTER_OFFERS),
  };
}
