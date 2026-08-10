/**
 * KR/US/JP/CN 2026년 공휴일 정적 데이터 (AC-048①/AC-057, T53). 외부 API 호출 0건 —
 * 이 파일 자체가 그 데이터 소스다(Planning Decision #52, `docs/API.md:280`).
 *
 * 🔴 날짜는 2026-08-10 기준 WebSearch로 각국 공식/준공식 출처(한국 정부 공휴일 발표 요약,
 * 미국 OPM 연방 공휴일, 일본 내각부 국민의 축일, 중국 국무원판공청 2026년 부분 공휴일 안배
 * 통지)를 교차 확인해 채웠다 — **기억으로 채우지 않았다**(Tasks.md 미검증 항목 표의 지시).
 * 다만 이 교차 확인은 검색 결과 대조이며 팀의 1차 공식 출처 재확인을 대체하지 않는다
 * (`docs/Tasks.md` 239·268행 "미검증" 항목은 이 커밋만으로 해소되지 않는다 — 팀 확인 필요).
 *
 * 연휴(연속 날짜) 그룹핑과 "N일차" 계산은 이 파일이 아니라 `rules/holiday-conflict.ts`가 한다 —
 * 이 파일은 순수 데이터만 담는다.
 */
import type { CountryCode } from '../contract';

export interface HolidayEntry {
  /** `YYYY-MM-DD`. */
  date: string;
  /** 공휴일 이름(해당 언어 관용 표기). */
  name: string;
}

/** 대한민국 — 대체공휴일 포함. 설날·추석은 음력 연휴 3일 그대로 등재(전날·당일·다음날). */
const KR_HOLIDAYS_2026: HolidayEntry[] = [
  { date: '2026-01-01', name: '신정' },
  { date: '2026-02-16', name: '설날 연휴(전날)' },
  { date: '2026-02-17', name: '설날' },
  { date: '2026-02-18', name: '설날 연휴(다음날)' },
  { date: '2026-03-01', name: '삼일절' },
  { date: '2026-03-02', name: '삼일절 대체공휴일' },
  { date: '2026-05-05', name: '어린이날' },
  { date: '2026-05-24', name: '부처님오신날' },
  { date: '2026-05-25', name: '부처님오신날 대체공휴일' },
  { date: '2026-06-06', name: '현충일' },
  { date: '2026-07-17', name: '제헌절' },
  { date: '2026-08-15', name: '광복절' },
  { date: '2026-08-17', name: '광복절 대체공휴일' },
  { date: '2026-09-24', name: '추석 연휴(전날)' },
  { date: '2026-09-25', name: '추석' },
  { date: '2026-09-26', name: '추석 연휴(다음날)' },
  { date: '2026-10-03', name: '개천절' },
  { date: '2026-10-05', name: '개천절 대체공휴일' },
  { date: '2026-10-09', name: '한글날' },
  { date: '2026-12-25', name: '크리스마스' },
];

/** 미국 — 연방 공휴일(OPM). 토요일과 겹치는 독립기념일은 관측일(전일 금요일)로 등재. */
const US_HOLIDAYS_2026: HolidayEntry[] = [
  { date: '2026-01-01', name: "New Year's Day" },
  { date: '2026-01-19', name: 'Martin Luther King Jr. Day' },
  { date: '2026-02-16', name: "Washington's Birthday" },
  { date: '2026-05-25', name: 'Memorial Day' },
  { date: '2026-06-19', name: 'Juneteenth' },
  { date: '2026-07-03', name: 'Independence Day (observed)' },
  { date: '2026-09-07', name: 'Labor Day' },
  { date: '2026-10-12', name: 'Columbus Day' },
  { date: '2026-11-11', name: 'Veterans Day' },
  { date: '2026-11-26', name: 'Thanksgiving Day' },
  { date: '2026-12-25', name: 'Christmas Day' },
];

/** 일본 — 내각부 국민의 축일 + 진흥휴일(振替休日). 골든위크 5/3~5/6 4일 연휴 포함. */
const JP_HOLIDAYS_2026: HolidayEntry[] = [
  { date: '2026-01-01', name: '元日' },
  { date: '2026-01-12', name: '成人の日' },
  { date: '2026-02-11', name: '建国記念の日' },
  { date: '2026-02-23', name: '天皇誕生日' },
  { date: '2026-03-20', name: '春分の日' },
  { date: '2026-04-29', name: '昭和の日' },
  { date: '2026-05-03', name: '憲法記念日' },
  { date: '2026-05-04', name: 'みどりの日' },
  { date: '2026-05-05', name: 'こどもの日' },
  { date: '2026-05-06', name: '振替休日' },
  { date: '2026-07-20', name: '海の日' },
  { date: '2026-08-11', name: '山の日' },
  { date: '2026-09-21', name: '敬老の日' },
  { date: '2026-09-23', name: '秋分の日' },
  { date: '2026-10-12', name: 'スポーツの日' },
  { date: '2026-11-03', name: '文化の日' },
  { date: '2026-11-23', name: '勤労感謝の日' },
];

/** 중국 — 국무원판공청 2026년 부분 공휴일 안배 통지(7대 법정 명절, 조정 근무일 제외). */
const CN_HOLIDAYS_2026: HolidayEntry[] = [
  { date: '2026-01-01', name: '元旦' },
  { date: '2026-01-02', name: '元旦' },
  { date: '2026-01-03', name: '元旦' },
  { date: '2026-02-15', name: '春节' },
  { date: '2026-02-16', name: '春节' },
  { date: '2026-02-17', name: '春节' },
  { date: '2026-02-18', name: '春节' },
  { date: '2026-02-19', name: '春节' },
  { date: '2026-02-20', name: '春节' },
  { date: '2026-02-21', name: '春节' },
  { date: '2026-02-22', name: '春节' },
  { date: '2026-02-23', name: '春节' },
  { date: '2026-04-04', name: '清明节' },
  { date: '2026-04-05', name: '清明节' },
  { date: '2026-04-06', name: '清明节' },
  { date: '2026-05-01', name: '劳动节' },
  { date: '2026-05-02', name: '劳动节' },
  { date: '2026-05-03', name: '劳动节' },
  { date: '2026-05-04', name: '劳动节' },
  { date: '2026-05-05', name: '劳动节' },
  { date: '2026-06-19', name: '端午节' },
  { date: '2026-06-20', name: '端午节' },
  { date: '2026-06-21', name: '端午节' },
  { date: '2026-09-25', name: '中秋节' },
  { date: '2026-09-26', name: '中秋节' },
  { date: '2026-09-27', name: '中秋节' },
  { date: '2026-10-01', name: '国庆节' },
  { date: '2026-10-02', name: '国庆节' },
  { date: '2026-10-03', name: '国庆节' },
  { date: '2026-10-04', name: '国庆节' },
  { date: '2026-10-05', name: '国庆节' },
  { date: '2026-10-06', name: '国庆节' },
  { date: '2026-10-07', name: '国庆节' },
];

/** 데이터가 있는 4개국(AC-057) — 이 맵에 없는 국가는 "데이터 없음"이며 임의로 추정하지 않는다. */
export const HOLIDAYS_2026: Record<CountryCode, HolidayEntry[]> = {
  KR: KR_HOLIDAYS_2026,
  US: US_HOLIDAYS_2026,
  JP: JP_HOLIDAYS_2026,
  CN: CN_HOLIDAYS_2026,
};
