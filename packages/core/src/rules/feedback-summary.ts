// R4 피드백 루프 — 응답 소요 시간 계산 + 중재 전/후 비교. AC-025(응답 시간 부분), AC-070①.
// 담당: [BE-B] T33. `docs/Tasks.md` T33 · `docs/API.md` "GET /api/feedback".
//
// 🔴 감정 분류는 만들지 않는다(AC-070②③, v2.8 범위 축소 — PRD Planning Decision #94). 이
// 파일에 감정/sentiment 관련 필드·로직이 전혀 없다 — 답장 본문 자체를 입력으로 받지 않는다
// (mock-send라 답장 본문이 애초에 존재하지 않는다, `docs/Tasks.md` T33 "제거 근거").
//
// 🔴 LLM 호출 없음, 결정적 계산이다(T31/T39/T32와 같은 원칙).
export interface RepliedMessageRecord {
  id: string;
  /** 발송 시각(ISO 8601). */
  sentAt: string;
  /** "답장 받음" 수동 마킹 시각(ISO 8601) — T50 `updateSentMessage`가 채운다. */
  repliedMarkedAt: string;
  mediationApplied: boolean;
}

export interface FeedbackItem {
  messageId: string;
  sentAt: string;
  repliedMarkedAt: string;
  elapsedHours: number;
  mediationApplied: boolean;
}

export interface FeedbackGroup {
  count: number;
  /** 표본이 0이면 `null` — 0이나 임의값으로 채우지 않는다(`docs/API.md` "GET /api/feedback"). */
  medianHours: number | null;
}

export interface FeedbackSummary {
  withMediation: FeedbackGroup;
  withoutMediation: FeedbackGroup;
  items: FeedbackItem[];
}

/** 소수 둘째 자리로 반올림 — 시간 단위 표시에 충분한 정밀도(임의 로직 변경이 아니라 표시 반올림). */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function elapsedHoursBetween(sentAt: string, repliedMarkedAt: string): number {
  const ms = new Date(repliedMarkedAt).getTime() - new Date(sentAt).getTime();
  return round2(ms / 3600000);
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return round2(value);
}

/**
 * 답장 받음으로 마킹된 발송 건들에서 (a) 개별 응답 소요 시간과 (b) 중재 적용 여부(`mediationApplied`)
 * 로 나눈 그룹별 표본수·중앙값을 계산한다(AC-070①). `records`는 이미 `replied: true`인 행만
 * 걸러져 들어온다는 전제다(호출부 `fetchRepliedMessages` 참조) — 이 함수 자체는 그 필터링을
 * 하지 않는다(단일 책임).
 */
export function summarizeFeedback(records: readonly RepliedMessageRecord[]): FeedbackSummary {
  const items: FeedbackItem[] = records.map((record) => ({
    messageId: record.id,
    sentAt: record.sentAt,
    repliedMarkedAt: record.repliedMarkedAt,
    elapsedHours: elapsedHoursBetween(record.sentAt, record.repliedMarkedAt),
    mediationApplied: record.mediationApplied,
  }));

  const withMediationHours = items.filter((item) => item.mediationApplied).map((item) => item.elapsedHours);
  const withoutMediationHours = items
    .filter((item) => !item.mediationApplied)
    .map((item) => item.elapsedHours);

  return {
    withMediation: { count: withMediationHours.length, medianHours: median(withMediationHours) },
    withoutMediation: {
      count: withoutMediationHours.length,
      medianHours: median(withoutMediationHours),
    },
    items,
  };
}
