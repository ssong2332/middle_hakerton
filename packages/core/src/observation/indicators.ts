/**
 * 관측 지표 정의 — 🔒 서버·확장 공용 단일 출처(AC-080④, `docs/API.md:319` 서버 규칙 — "경로별로
 * 두 벌을 만들어 표시 단계에서 합치는 구현은 리뷰에서 반려된다"). `docs/Tasks.md` T71.
 *
 * 🔴 **T2 스캐폴드가 예고한 "T64/T71이 채운다"는 실제로는 T71만 채운다.** T64는 착수 시점에
 * `docs/Database.md`/`docs/API.md`가 이미 고정한 `recipient_enrichments` 계약(location/company/
 * 활동 시간대 3항목)에만 저장했고, 이 파일(범용 4/6지표)은 스키마·계약 확장이 필요해 architect
 * 라우팅으로 남겼다(`apps/web/app/api/enrichment/fetch/route.ts` 헤더 주석 참조). T71 착수 시점에도
 * 그 architect 라우팅이 해소되지 않은 채였다 — 하지만 T71 자신은 `observation_samples.
 * indicator_deltas`(`docs/Database.md:252`)에 쓸 값을 반드시 계산해야만 착수할 수 있어, 이
 * 파일의 **최초 구현자**가 됐다(`packages/core` 파일 헤더 관례 "그 에러/파일을 처음 채우는
 * 태스크가 정한다"와 같은 원칙 — `packages/core/src/errors.ts` 헤더 참조).
 *
 * 🔴 **6개 필드 중 4개만 계산한다 — 나머지 2개는 스코프 갭으로 남긴다.**
 * `docs/Database.md:252`의 `indicator_deltas` 필드 목록은
 * `{ sentenceCount, emojiCount, charCount, hedgeCount, addressFormKind, deadlineMentionKind }`
 * 이지만, 이 문서 어디에도 `addressFormKind`/`deadlineMentionKind`의 **정확한 enum 값·판정
 * 규칙**이 없다(AC-080④가 나열하는 "호명 방식·기한 언급 방식"이라는 이름뿐, 값의 형태는
 * 미정 — `packages/core/src/errors.ts`가 "발생 조건을 지어내지 않는다"고 명시한 것과 같은
 * 원칙을 스키마 값에도 적용한다). 두 필드는 항상 `null`을 반환한다 — **"판정 불가"가 아니라
 * "이 필드의 정의 자체가 아직 없다"**는 뜻이며, architect가 enum을 확정하면 그때 채운다.
 * 나머지 4개(sentenceCount/emojiCount/charCount/hedgeCount)는 숫자값이라 enum 정의 없이도
 * 객관적으로 계산 가능해 이번에 구현한다.
 */
import { countCushionPhrases, countEmoji } from '../rules/pattern-detection';
import { derivePeakActivityHour } from '../rules/github-enrichment';

export interface IndicatorDeltas {
  /** 문장 수 — `.`/`!`/`?`/줄바꿈으로 끊은 뒤 빈 조각을 제외한 개수. */
  sentenceCount: number;
  /** 이모지 개수 — `pattern-detection.ts`의 `countEmoji()`(AC-056이 이미 쓰는 판정)와 동일. */
  emojiCount: number;
  /** 문자 수 — `text.length`(코드유닛 기준, 다른 지표들과 같은 원문에서 그대로 잰다). */
  charCount: number;
  /** 완충 표현(쿠션어) 개수 — `pattern-detection.ts`의 `CUSHION_PHRASES` 목록 재사용. */
  hedgeCount: number;
  /** 🔴 스코프 갭 — enum 미정의(architect 라우팅 필요). 항상 `null`. */
  addressFormKind: string | null;
  /** 🔴 스코프 갭 — enum 미정의(architect 라우팅 필요). 항상 `null`. */
  deadlineMentionKind: string | null;
}

/** `.`/`!`/`?`/줄바꿈으로 문장을 나눈다 — 형태소 분석기를 쓰지 않는다(`pattern-detection.ts`와
 * 같은 제약, 새 의존성 0개). 구두점이 전혀 없는 텍스트도 줄바꿈 없이 1문장으로 센다. */
function countSentences(text: string): number {
  const trimmed = text.trim();
  if (trimmed === '') return 0;
  return trimmed
    .split(/[.!?\n]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment !== '').length;
}

/**
 * 텍스트 1건(수동 표시로 선택된 상대 메시지 또는 향후 GitHub 코멘트)에서 4개 지표를 계산한다.
 * 🔴 이 함수는 **원문을 저장하지 않는다** — 호출부(확장 콘텐츠 스크립트/서버)가 이 함수의 반환값
 * (집계 숫자)만 네트워크로 보내고 `text` 자체는 버려야 한다(AC-081①③, 이 함수는 그 보장을
 * 강제하지 않는다 — 순수 함수라 호출부가 결과를 어떻게 쓰는지 알지 못한다는 뜻이며, 실제 방어선은
 * 호출부의 코드 경로 자체에 원문을 실어 보내는 곳이 없어야 성립한다).
 */
export function computeIndicatorDeltas(text: string): IndicatorDeltas {
  return {
    sentenceCount: countSentences(text),
    emojiCount: countEmoji(text),
    charCount: text.length,
    hedgeCount: countCushionPhrases(text),
    addressFormKind: null,
    deadlineMentionKind: null,
  };
}

/**
 * T68 — `docs/API.md:317` `POST /api/enrichment/observe` Response의 `indicators[]`. 🔴 이
 * 함수가 만드는 4개 키는 `IndicatorDeltas`의 6개 필드와 **이름도 목적도 다르다** — `AC-072`가
 * 정의하는 "관측 단계 1" 지표 세트(코멘트 길이/이모지 빈도/응답 지연/활동 시간대)이고,
 * `IndicatorDeltas`는 `AC-080④`가 정의하는 "#24 규약 축과 직접 매핑되는" 확장 지표 세트다 —
 * 이 리포에 지표 정의가 의도적으로 두 벌 존재한다(하나로 합치면 `POST /api/enrichment/observe`의
 * 고정된 4-key 응답 계약을 어기게 된다, `apps/web/app/api/enrichment/observe/route.ts` 헤더
 * 주석 참조).
 *
 * 🔴 **`responseDelay`는 항상 `value: null, sampleCount: 0`이다** — 이 지표를 계산할 데이터가
 * `observation_samples.indicator_deltas`에도 없다(6개 필드 중 없음). 지어내지 않는다.
 */
export interface ObserveIndicator {
  key: 'commentLength' | 'emojiFrequency' | 'responseDelay' | 'activityHours';
  value: number | null;
  sampleCount: number;
  sampleCountBySource: { manual: number; github: number };
}

export interface ObserveIndicatorSourceTotals {
  sampleCount: number;
  sentenceCountSum: number;
  emojiCountSum: number;
}

export interface ComputeObserveIndicatorsInput {
  manual: ObserveIndicatorSourceTotals;
  github: ObserveIndicatorSourceTotals;
  /** `recipient_enrichments.activity_hour_histogram`(T64) — `observation_samples`가 아니라
   * 별도 테이블에서 온다(GitHub 전용 경로, 아직 수동 표시 쪽 활동 시간대 데이터가 없다). */
  activityHourHistogram: number[] | null;
  activitySampleCount: number;
}

function average(sum: number, count: number): number | null {
  return count === 0 ? null : sum / count;
}

export function computeObserveIndicators(input: ComputeObserveIndicatorsInput): ObserveIndicator[] {
  const totalSampleCount = input.manual.sampleCount + input.github.sampleCount;
  const sampleCountBySource = { manual: input.manual.sampleCount, github: input.github.sampleCount };

  const commentLength: ObserveIndicator = {
    key: 'commentLength',
    value: average(input.manual.sentenceCountSum + input.github.sentenceCountSum, totalSampleCount),
    sampleCount: totalSampleCount,
    sampleCountBySource,
  };

  const emojiFrequency: ObserveIndicator = {
    key: 'emojiFrequency',
    value: average(input.manual.emojiCountSum + input.github.emojiCountSum, totalSampleCount),
    sampleCount: totalSampleCount,
    sampleCountBySource,
  };

  const responseDelay: ObserveIndicator = {
    key: 'responseDelay',
    value: null,
    sampleCount: 0,
    sampleCountBySource: { manual: 0, github: 0 },
  };

  const activityHours: ObserveIndicator = {
    key: 'activityHours',
    value: derivePeakActivityHour(input.activityHourHistogram),
    sampleCount: input.activitySampleCount,
    sampleCountBySource: { manual: 0, github: input.activitySampleCount },
  };

  return [commentLength, emojiFrequency, responseDelay, activityHours];
}
