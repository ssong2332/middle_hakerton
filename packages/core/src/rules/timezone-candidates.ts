// #34 수신자 정보 공개 출처 보강 ① — `location` 자유 문자열 → 타임존 후보. 담당: [BE-B] T64.
// `docs/Tasks.md` T64 ⓒ "타임존을 자동 확정하지 않는다 — location 문자열에서 후보만 산출하고
// 확정은 T65에서 사용자가 한다"(AC-065④). `docs/API.md` "POST /api/enrichment/fetch" Response
// `timezoneCandidates: string[]`.
//
// 🔴 GitHub `location`은 자유 텍스트라 지오코딩 서비스 없이는 정확한 매핑이 불가능하다 — 이
// 파일은 **명백한 경우만** 다루는 최소 키워드 매칭이다(외부 API 호출 없음, `holidays-2026.ts`의
// "정적 데이터, 외부 호출 0" 원칙과 같은 방향). 애매하거나 못 찾으면 **빈 배열**을 반환한다 —
// 후보를 지어내지 않는다(AC-065⑤와 같은 원칙, "후보를 못 찾음"과 "후보가 있는데 숨김"을 구분할
// 필요가 없다: 둘 다 빈 배열이 맞는 응답이다).
//
// ⚠️ 이 표는 이 리포가 이미 다루는 4개국(KR/US/JP/CN, AC-057 공휴일 대상국)의 대표 도시 + 널리
// 알려진 IT 허브 몇 곳만 담는다 — 전 세계 도시를 망라하지 않는다. 넓히는 것은 별도 태스크(정확도
// 요구가 이 태스크의 범위를 넘는다).
const KEYWORD_TO_TIMEZONE: ReadonlyArray<{ keyword: string; timezone: string }> = [
  { keyword: 'seoul', timezone: 'Asia/Seoul' },
  { keyword: 'busan', timezone: 'Asia/Seoul' },
  { keyword: 'korea', timezone: 'Asia/Seoul' },
  { keyword: 'tokyo', timezone: 'Asia/Tokyo' },
  { keyword: 'osaka', timezone: 'Asia/Tokyo' },
  { keyword: 'japan', timezone: 'Asia/Tokyo' },
  { keyword: 'beijing', timezone: 'Asia/Shanghai' },
  { keyword: 'shanghai', timezone: 'Asia/Shanghai' },
  { keyword: 'shenzhen', timezone: 'Asia/Shanghai' },
  { keyword: 'china', timezone: 'Asia/Shanghai' },
  { keyword: 'new york', timezone: 'America/New_York' },
  { keyword: 'nyc', timezone: 'America/New_York' },
  { keyword: 'boston', timezone: 'America/New_York' },
  { keyword: 'san francisco', timezone: 'America/Los_Angeles' },
  { keyword: 'los angeles', timezone: 'America/Los_Angeles' },
  { keyword: 'seattle', timezone: 'America/Los_Angeles' },
  { keyword: 'chicago', timezone: 'America/Chicago' },
  { keyword: 'austin', timezone: 'America/Chicago' },
  { keyword: 'london', timezone: 'Europe/London' },
  { keyword: 'berlin', timezone: 'Europe/Berlin' },
  { keyword: 'singapore', timezone: 'Asia/Singapore' },
  { keyword: 'india', timezone: 'Asia/Kolkata' },
  { keyword: 'bangalore', timezone: 'Asia/Kolkata' },
];

/**
 * `location` 문자열에서 키워드 매칭으로 타임존 후보를 뽑는다. 대소문자 무시, 부분 문자열 매칭.
 * 여러 키워드가 매칭돼도 같은 타임존이면 중복 없이 1개만 반환한다 — 매칭이 없으면(또는
 * `location`이 `null`이면) 빈 배열.
 */
export function deriveTimezoneCandidates(location: string | null): string[] {
  if (location === null || location.trim() === '') return [];
  const normalized = location.toLowerCase();
  const matched = new Set<string>();
  for (const { keyword, timezone } of KEYWORD_TO_TIMEZONE) {
    if (normalized.includes(keyword)) {
      matched.add(timezone);
    }
  }
  return Array.from(matched);
}
