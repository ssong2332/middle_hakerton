// #34 수신자 정보 공개 출처 보강 ① — 순수 계산부. 담당: [BE-B] T64.
// `docs/Tasks.md` T64 · `docs/API.md` "POST /api/enrichment/fetch" · `docs/Database.md`
// "recipient_enrichments" · AC-065, AC-071.
//
// 🔴 GitHub REST API 호출(네트워크 I/O)은 core 밖(`apps/web/lib/enrichment/github-client.ts`)의
// 몫이다(AC-028 — core는 구현을 모른다, `docs/Architecture.md` Conventions 11). 이 파일은 이미
// 받은 응답 데이터에서 값을 추출·집계하는 순수 함수만 갖는다.
//
// 🔴 저장 대상은 정확히 `location`·`company`·활동 시간대뿐이다(`docs/Database.md:225`,
// AC-065③). 이 파일도 그 외 필드를 만들지 않는다 — GitHub 프로필 응답에 다른 필드(email, bio,
// avatar_url 등)가 있어도 이 파일의 함수들은 애초에 그 값을 받지 않는다(타입에서부터 제외).
import { ACTIVITY_HOUR_SAMPLE_THRESHOLD } from '../constants';

/** GitHub `GET /users/{username}` 응답에서 이 태스크가 쓰는 두 필드만 — 나머지는 타입에도 없다. */
export interface GitHubProfileFields {
  location: string | null;
  company: string | null;
}

/**
 * 🔴 AC-065⑤ — 얻지 못한 값은 `null`("미등록")이며 지어내지 않는다. GitHub API는 빈 문자열
 * (`""`)을 돌려줄 수도 있어(필드가 있지만 비어 있음) `null`과 동치로 정규화한다 — 빈 문자열과
 * 미등록을 화면에서 다르게 다룰 근거가 없다.
 */
export function extractProfileFields(profile: {
  location?: string | null;
  company?: string | null;
}): GitHubProfileFields {
  const normalize = (value: string | null | undefined): string | null => {
    if (value === null || value === undefined) return null;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  };
  return { location: normalize(profile.location), company: normalize(profile.company) };
}

export interface ActivityHourResult {
  /** 24버킷 시간대별 활동 건수(UTC 기준 — GitHub 이벤트 `created_at`이 UTC라 그대로 쓴다,
   * 로컬 변환은 하지 않는다: 이 화면이 만드는 것은 "활동 시간대 후보"이지 확정 타임존이 아니다).
   * 표본이 임계값 미만이면 `null`(AC-071②). */
  histogram: number[] | null;
  /** 실제 이벤트 표본 수 — 임계값 미달이어도 항상 기록한다(AC-072③, "몇 건에서 나왔는지"). */
  sampleCount: number;
}

/**
 * GitHub 공개 활동 이벤트의 `created_at`(ISO 8601, UTC) 배열에서 24버킷 시간대 분포를 만든다.
 * 🔴 AC-071② — `sampleCount < ACTIVITY_HOUR_SAMPLE_THRESHOLD`이면 `histogram: null`(표본 부족을
 * 지어낸 분포로 가리지 않는다). `sampleCount`는 항상 실제 값을 담는다.
 */
export function computeActivityHourHistogram(
  createdAtTimestamps: string[],
  threshold: number = ACTIVITY_HOUR_SAMPLE_THRESHOLD,
): ActivityHourResult {
  const sampleCount = createdAtTimestamps.length;
  if (sampleCount < threshold) {
    return { histogram: null, sampleCount };
  }
  const histogram = new Array<number>(24).fill(0);
  for (const timestamp of createdAtTimestamps) {
    const hour = new Date(timestamp).getUTCHours();
    histogram[hour] += 1;
  }
  return { histogram, sampleCount };
}
