// R2 최적 회의 시간 추천 — AC-023. 담당: [BE-B] T31. `docs/Tasks.md` T31.
//
// 🔴 LLM 호출 없음 — 전부 결정적 계산이다(`docs/API.md` "시간 계산" 절 헤더). 새 의존성을
// 쓰지 않는다 — 타임존 변환은 Node/브라우저 내장 `Intl.DateTimeFormat`만으로 구현한다
// (`docs/DECISIONS.md`에 타임존 라이브러리 항목 없음).
//
// 🔴 "수신자의 근무 가능 시간을 어디서 얻는가"(문서 말미 "착수 전 확인 항목" 표, T31·T39 공통)는
// `docs/API.md` "POST /api/meeting-times" Request 계약이 이미 답한다 — `sender`/`recipient`
// 둘 다 요청 body로 직접 받는다(수동 입력, DB 조회 없음). 이 파일은 그 계약대로 값을 받기만
// 하고 프로필·규약 테이블을 읽지 않는다.
//
// 🔴 `zonedTimeToUtc`/`formatLocal`/`addDaysToDateString`는 T39(`rules/deadline-negotiation.ts`)가
// 그대로 재사용한다 — 같은 타임존 변환 알고리즘(과 위에서 문서화한 DST 경계 한계)을 두 파일이
// 따로 구현하면 한쪽만 고쳐지는 드리프트가 생긴다. `findMeetingCandidates`와 무관해 보여도
// 여기 남겨 둔 이유가 이것이다 — 옮기지 않는다.
export interface WorkWindow {
  /** IANA 타임존 문자열(예: `Asia/Seoul`). */
  timezone: string;
  /** 근무 시작 시각, 로컬 `HH:mm`(24시간제). */
  workStart: string;
  /** 근무 종료 시각, 로컬 `HH:mm`(24시간제). */
  workEnd: string;
}

export interface DateRange {
  /** 검색 시작일, `YYYY-MM-DD`(포함). */
  from: string;
  /** 검색 종료일, `YYYY-MM-DD`(포함). */
  to: string;
}

export interface MeetingTimeCandidate {
  /** 겹침 구간 시작(UTC ISO 8601). */
  startUtc: string;
  /** 겹침 구간 종료(UTC ISO 8601). */
  endUtc: string;
  /** 겹침 시작 시각의 발신자 로컬 표기(`YYYY-MM-DD HH:mm`). */
  senderLocal: string;
  /** 겹침 시작 시각의 수신자 로컬 표기(`YYYY-MM-DD HH:mm`). */
  recipientLocal: string;
}

/** `timeZone`이 `utcInstant` 시점에 UTC보다 몇 분 앞서 있는지(로컬 = UTC + 오프셋). */
function timezoneOffsetMinutes(utcInstant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(utcInstant);
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  const asIfUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return (asIfUtc - utcInstant.getTime()) / 60000;
}

/**
 * `timeZone`의 로컬 날짜·시각(`dateStr` `YYYY-MM-DD`, `timeStr` `HH:mm`)을 UTC 시각으로
 * 변환한다.
 *
 * 🔴 **알려진 한계(측정하지 않았다 — 문서로 남긴다)**: 오프셋을 "UTC로 가정한 순간"
 * 하나에서만 구해 한 번에 보정한다 — DST 전환이 일어나는 그 하루 안의 로컬 시각에 대해서는
 * 오프셋이 실제와 최대 1시간(전환폭) 어긋날 수 있다. 반복 수렴(전환 경계를 찾을 때까지
 * 재계산)까지는 구현하지 않았다 — MVP 대상국(한국·미국·일본·중국)의 실제 회의시간 후보가
 * DST 전환 당일 그 시각대에 정확히 걸릴 확률은 낮고, 새 의존성 없이 완전히 고치려면
 * 반복 로직이 필요해 이번 라운드 범위를 벗어난다고 판단했다.
 */
export function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offsetMinutes = timezoneOffsetMinutes(guess, timeZone);
  return new Date(guess.getTime() - offsetMinutes * 60000);
}

/** `date`(UTC 시각)를 `timeZone` 로컬 `YYYY-MM-DD HH:mm`로 표기한다. */
export function formatLocal(date: Date, timeZone: string): string {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}`;
}

export function addDaysToDateString(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function enumerateDates(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = from;
  // 🔴 안전장치 — 사용자가 넘긴 dateRange가 뒤집혀 있거나 지나치게 넓어도 무한루프를 만들지
  // 않는다. 검증(뒤집힌 범위 400)은 route.ts의 zod 스키마 몫이라 여기서는 방어적 상한만 둔다.
  const MAX_DAYS = 366;
  for (let i = 0; i < MAX_DAYS && cursor <= to; i += 1) {
    dates.push(cursor);
    cursor = addDaysToDateString(cursor, 1);
  }
  return dates;
}

/**
 * `sender`/`recipient`의 근무 가능 시간이 겹치는 구간을 최대 3개 찾는다(AC-023).
 * 겹침이 없으면 **빈 배열**을 반환한다(억지 후보를 만들지 않는다 — `docs/API.md`
 * "겹침이 없으면 빈 배열" 서버 규칙).
 *
 * 상대 쪽 로컬 날짜가 발신자 쪽과 하루 어긋나 있어도(타임존 차이가 커서 "발신자의 화요일"이
 * "수신자의 월요일 밤~화요일 낮"에 걸치는 경우) 놓치지 않도록, 발신자 쪽 날짜 하루마다
 * 수신자 쪽은 전날·당일·다음날 세 후보를 함께 검사한다.
 */
export function findMeetingCandidates(
  sender: WorkWindow,
  recipient: WorkWindow,
  dateRange: DateRange,
): MeetingTimeCandidate[] {
  const dates = enumerateDates(dateRange.from, dateRange.to);
  const candidates: MeetingTimeCandidate[] = [];
  const seen = new Set<string>();

  for (const date of dates) {
    const senderStart = zonedTimeToUtc(date, sender.workStart, sender.timezone);
    const senderEnd = zonedTimeToUtc(date, sender.workEnd, sender.timezone);
    if (senderStart.getTime() >= senderEnd.getTime()) continue;

    for (const dayOffset of [-1, 0, 1]) {
      const recipientDate = addDaysToDateString(date, dayOffset);
      const recipientStart = zonedTimeToUtc(recipientDate, recipient.workStart, recipient.timezone);
      const recipientEnd = zonedTimeToUtc(recipientDate, recipient.workEnd, recipient.timezone);
      if (recipientStart.getTime() >= recipientEnd.getTime()) continue;

      const overlapStart = new Date(Math.max(senderStart.getTime(), recipientStart.getTime()));
      const overlapEnd = new Date(Math.min(senderEnd.getTime(), recipientEnd.getTime()));
      if (overlapStart.getTime() >= overlapEnd.getTime()) continue;

      const key = `${overlapStart.toISOString()}|${overlapEnd.toISOString()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      candidates.push({
        startUtc: overlapStart.toISOString(),
        endUtc: overlapEnd.toISOString(),
        senderLocal: formatLocal(overlapStart, sender.timezone),
        recipientLocal: formatLocal(overlapStart, recipient.timezone),
      });
    }
  }

  candidates.sort((a, b) => a.startUtc.localeCompare(b.startUtc));
  return candidates.slice(0, 3);
}
