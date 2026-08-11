/**
 * #34 수신자 정보 공개 출처 보강 ① — GitHub REST API 호출(네트워크 I/O). 담당: [BE-B] T64.
 * `docs/API.md` "POST /api/enrichment/fetch". core는 이 파일을 모른다(AC-028) — 계산은
 * `@cross-border/core`의 `extractProfileFields`/`computeActivityHourHistogram`이 한다, 이
 * 파일은 fetch만 한다.
 *
 * 🔴 T64 스파이크 실측(2026-08-11, 근거는 `docs/Tasks.md` T64 각주) — 비인증 조회로 3개 공개
 * 프로필·활동 이벤트 전부 200을 받았다(unauthenticated rate limit 60/hr/IP, 이번 프로젝트
 * 규모의 P2 기능에는 충분하다는 사용자 판단). `Authorization` 헤더를 보내지 않는다 — 토큰
 * 도입은 이후 라운드로 미룬다(측정 결과에 근거한 스코프 결정).
 *
 * 🔴 AC-065② — 검색·크롤링·링크 추적·다른 URL 자동 조회 코드 경로가 없다. 이 파일이 호출하는
 * GitHub 엔드포인트는 정확히 2개(사용자가 붙여넣은 URL에서 얻은 username 기준의 프로필 1건 +
 * 그 계정의 공개 활동 1건) — 어느 쪽도 응답 안의 링크를 따라가 추가 조회를 하지 않는다.
 */
import { ExternalFetchFailedError, ValidationError } from '@cross-border/core';

const GITHUB_API_BASE = 'https://api.github.com';
// 🔴 GitHub 공개 이벤트 API는 페이지당 최대 100건·최대 300건(3페이지)까지만 제공한다(스파이크
// 실측 — `Link` 헤더로 확인). 페이지네이션을 따라가지 않고 첫 페이지(최대 100건)만 쓴다 —
// "1회 조회"(AC-065②)를 여러 HTTP 요청의 루프로 만들지 않기 위함이다. 활동 시간대 표본으로는
// 충분하다(임계값 30의 3배 이상).
const EVENTS_PER_PAGE = 100;

/**
 * `https://github.com/<username>` 형태의 URL에서 username을 뽑는다. GitHub 외 도메인이거나
 * username을 추출할 수 없는 형태면 `ValidationError`(400) — AC-065②의 "GitHub 공개 프로필
 * URL 1건" 범위를 벗어난 입력은 여기서 막는다(외부 fetch를 시도하지도 않는다).
 */
export function parseGitHubUsername(profileUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(profileUrl);
  } catch {
    throw new ValidationError('올바른 URL 형식이 아닙니다');
  }
  if (parsed.hostname !== 'github.com' && parsed.hostname !== 'www.github.com') {
    throw new ValidationError('GitHub 프로필 URL만 지원합니다');
  }
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length !== 1) {
    throw new ValidationError('GitHub 프로필 URL 형식이 아닙니다(예: https://github.com/username)');
  }
  return segments[0];
}

export interface GitHubFetchResult {
  location: string | null;
  company: string | null;
  activityTimestamps: string[];
}

interface GitHubUserResponse {
  location?: string | null;
  company?: string | null;
}

interface GitHubEvent {
  created_at?: string;
}

/**
 * 프로필 1건 + 공개 활동 이벤트(최대 100건) 조회. 🔴 둘 중 하나라도 네트워크 오류·5xx·404·
 * rate limit 등으로 실패하면 `ExternalFetchFailedError`(502, retryable)를 던진다 — 부분 성공을
 * 허용하지 않는다(location/company는 있는데 activityTimestamps는 조용히 빈 배열인 상태를
 * 만들지 않는다, "얻지 못한 값을 지어내지 않는다"는 원칙을 실패 자체에도 적용).
 */
export async function fetchGitHubEnrichment(username: string): Promise<GitHubFetchResult> {
  const [profileResponse, eventsResponse] = await Promise.all([
    fetch(`${GITHUB_API_BASE}/users/${encodeURIComponent(username)}`, {
      headers: { accept: 'application/vnd.github+json' },
    }).catch(() => null),
    fetch(
      `${GITHUB_API_BASE}/users/${encodeURIComponent(username)}/events/public?per_page=${EVENTS_PER_PAGE}`,
      { headers: { accept: 'application/vnd.github+json' } },
    ).catch(() => null),
  ]);

  if (!profileResponse || !profileResponse.ok) {
    throw new ExternalFetchFailedError('GitHub 프로필을 조회하지 못했습니다');
  }
  if (!eventsResponse || !eventsResponse.ok) {
    throw new ExternalFetchFailedError('GitHub 공개 활동을 조회하지 못했습니다');
  }

  const profile = (await profileResponse.json()) as GitHubUserResponse;
  const events = (await eventsResponse.json()) as GitHubEvent[];

  return {
    location: profile.location ?? null,
    company: profile.company ?? null,
    // 🔴 AC-071④ — `created_at`(타임스탬프)만 뽑는다. 이벤트 payload에 커밋 메시지·이슈 본문
    // 등이 실려 있어도 이 함수는 그 필드에 접근조차 하지 않는다(타입에도 없다).
    activityTimestamps: events.map((event) => event.created_at).filter((v): v is string => !!v),
  };
}
