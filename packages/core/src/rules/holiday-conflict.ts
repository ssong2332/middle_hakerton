// 마감일 ↔ 수신자 국가 연휴 충돌 판정 — AC-048/AC-057/AC-063. 담당: [BE-B] T53. `docs/Tasks.md` T53.
//
// 🔴 이 파일은 순수 계산만 한다 — `contract.ts`의 `HolidayConflict` 스키마를 채우는 함수를
// 제공할 뿐, `pipeline.ts`의 `holidayConflicts: []` 배선은 바꾸지 않는다. 그 배선은
// `RecipientContext.country`가 항상 `null`인 동안(T64/T65 수신자 보강 전) 의도적으로 빈
// 배열을 유지한다(`pipeline.ts:349-353` 주석 참조) — T53은 그 전제를 바꾸지 않는다.
import type { CountryCode } from '../contract';
import type { HolidayConflict } from '../contract';
import { HOLIDAYS_2026, type HolidayEntry } from '../data/holidays-2026';

/** 같은 국가 데이터 안에서 날짜가 하루도 안 비고 이어지는 구간(연휴)마다 1부터 매기는 일차. */
function buildDayIndexMap(entries: readonly HolidayEntry[]): Map<string, number> {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const map = new Map<string, number>();
  let streakStart = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    if (i > 0 && !isNextDay(sorted[i - 1].date, sorted[i].date)) {
      streakStart = i;
    }
    map.set(sorted[i].date, i - streakStart + 1);
  }
  return map;
}

function isNextDay(dateStr: string, nextDateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const expected = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
  return expected === nextDateStr;
}

// 국가별 day-index 맵은 데이터가 바뀌지 않는 한 고정이므로 모듈 로드 시 한 번만 계산한다.
const DAY_INDEX_BY_COUNTRY: Partial<Record<CountryCode, Map<string, number>>> = {};
function dayIndexMapFor(country: CountryCode): Map<string, number> {
  const cached = DAY_INDEX_BY_COUNTRY[country];
  if (cached) return cached;
  const built = buildDayIndexMap(HOLIDAYS_2026[country]);
  DAY_INDEX_BY_COUNTRY[country] = built;
  return built;
}

/**
 * `date`(`YYYY-MM-DD`)가 `country`의 공휴일과 겹치는지 판정한다.
 *
 * 🔴 **빈 배열의 두 원인은 이 함수 밖에서 구분되지 않는다**(AC-063①) — ① 실제로 충돌이 없다
 * ② `country`가 `null`이거나 데이터가 없는 국가다. 두 경우 모두 호출부는 화면에 아무것도
 * 렌더하지 않아야 한다. 구분이 필요하면(AC-063②) `hasHolidayData(country)`를 별도로 쓴다.
 */
export function holidayConflictsForDate(
  date: string,
  country: CountryCode | null,
): HolidayConflict[] {
  if (country === null) return [];
  const entries = HOLIDAYS_2026[country];
  const hit = entries.find((entry) => entry.date === date);
  if (!hit) return [];

  const dayIndex = dayIndexMapFor(country).get(date) ?? 1;
  return [{ date, country, holidayName: hit.name, dayIndex }];
}

/** `country`(데이터가 있는 4개국 중 하나)에서 `date`가 공휴일인지 여부만 필요할 때 쓰는 축약형. */
export function isHolidayDate(date: string, country: CountryCode | null): boolean {
  return holidayConflictsForDate(date, country).length > 0;
}

/** 데이터가 있는 국가인지(AC-063② 내부 구분용) — 화면에는 이 결과를 노출하지 않는다. */
export function hasHolidayData(country: CountryCode | null): country is CountryCode {
  return country !== null && country in HOLIDAYS_2026;
}
