/**
 * #34 단계 4 — 관측·신고 불일치 대조(AC-079, AC-083). `docs/Tasks.md` T70.
 * `docs/API.md:241` `GET /api/protocol/mismatches` Response 200의 `axes[]`를 이 파일이 만든다.
 *
 * 🔴 **확인 요청이지 판정이 아니다** — `mismatched: true`는 "다르다"는 사실 진술일 뿐, "상대가
 * 잘못 신고했다"는 뜻이 아니다(AC-079③, 문구는 호출부가 고정: "합의된 규칙과 관측이 다릅니다.
 * 확인해 보시겠어요?"). 이 파일은 `mismatched` boolean과 집계 어휘(`comparison`)만 만들고,
 * 어떤 문구도 직접 만들지 않는다.
 *
 * 🔴 **대조 축은 정확히 이 파일이 구현하는 2개(이모지/직설)뿐이다** — AC-083①이 정의하는 4축
 * 중 나머지 2개(호칭↔실제 호명 방식, 마감 표현↔기한 언급 방식)는 그 값을 채울 데이터가 아직
 * 없다(`packages/core/src/observation/indicators.ts`의 `addressFormKind`/`deadlineMentionKind`
 * 는 T71 착수 시점 기준 항상 `null` — enum 자체가 architect 미확정, 그 파일 헤더 주석 참조).
 * 이 파일은 그 2축을 지어내지 않는다 — **표본이 0이므로 AC-083②의 "표본 미달은 조용히
 * 건너뛴다"에 그대로 흡수되어, 호출부가 그 두 축을 요청하지 않는 것만으로 정확한 동작이 된다**
 * (architect가 두 값의 enum을 확정하면 그 축 판정 함수를 이 파일에 추가하면 된다 — 새 파일이
 * 아니라 이 파일의 확장점).
 *
 * 🔴 **임계값은 기존 4상수를 그대로 쓴다**(AC-079④/AC-083②, "AC-077의 임계값 체계를 그대로
 * 쓰고 별도 임계값을 만들지 않는다") — 이 파일은 `STYLE_SUGGESTION_SAMPLE_THRESHOLD`(GitHub)·
 * `MANUAL_STYLE_SUGGESTION_SAMPLE_THRESHOLD`(수동)를 그대로 재사용한다. "스타일 제안" 축과
 * 목적이 같다고 판단한 근거 — 둘 다 "이 사람의 스타일 성향을 판정할 만큼 표본이 있는가"를
 * 묻는다(활동 시간대 임계값과는 무관, 그건 시간대 분포 전용).
 *
 * 🔴 **출처별 임계값은 독립적으로 적용한다**(`docs/Database.md:259` "각 상수는 코드 1곳에
 * 격리", AC-082①과 같은 정신) — 이모지 축처럼 두 출처를 함께 보는 축도, "수동 표본이 그
 * 출처의 임계값을 넘으면 수동 관측치를 포함, GitHub 표본이 그 출처의 임계값을 넘으면 GitHub
 * 관측치를 포함"하는 방식으로 합산한다(문서에 정확한 합산 공식이 없어 이 부분은 구현 판단 —
 * `Database.md`에 판정 알고리즘 SQL이 없음을 확인했다, T70 착수 전 조사 참조). 어느 쪽도
 * 임계값을 못 넘으면 그 축 전체를 생략한다.
 */
import {
  MANUAL_STYLE_SUGGESTION_SAMPLE_THRESHOLD,
  STYLE_SUGGESTION_SAMPLE_THRESHOLD,
} from '../constants';
import type { PairProtocol } from '../contract';

export type MismatchAxis = 'emoji' | 'directness';
export type ObservationSource = 'manual' | 'github';

export interface MismatchAxisResult {
  axis: MismatchAxis;
  mismatched: boolean;
  /** 집계 어휘만(AC-081② 확장) — 원문·인용문을 담지 않는다. */
  comparison: string;
  sampleCount: number;
  sources: ObservationSource[];
}

/** 상대 1명에 대해 출처별로 집계된 관측치. `apps/web/lib/samples/storage.ts`의
 * `getIndicatorRollupForCounterpart()`가 이 shape을 만든다. */
export interface CounterpartObservationRollup {
  manual: { sampleCount: number; emojiCount: number; hedgeCount: number };
  github: { sampleCount: number; emojiCount: number; hedgeCount: number };
}

interface EligibleAggregate {
  count: number;
  sampleCount: number;
  sources: ObservationSource[];
}

/** 출처별 임계값을 독립 적용해, 임계값을 넘는 출처의 표본만 합산한다. 어느 출처도 못 넘으면
 * `null`(그 축 자체를 만들지 않는다는 뜻 — 호출부가 이 반환을 축 생략 신호로 쓴다). */
function aggregateEligibleSources(
  rollup: CounterpartObservationRollup,
  pick: (bucket: { sampleCount: number; emojiCount: number; hedgeCount: number }) => number,
): EligibleAggregate | null {
  const sources: ObservationSource[] = [];
  let count = 0;
  let sampleCount = 0;
  if (rollup.manual.sampleCount >= MANUAL_STYLE_SUGGESTION_SAMPLE_THRESHOLD) {
    sources.push('manual');
    count += pick(rollup.manual);
    sampleCount += rollup.manual.sampleCount;
  }
  if (rollup.github.sampleCount >= STYLE_SUGGESTION_SAMPLE_THRESHOLD) {
    sources.push('github');
    count += pick(rollup.github);
    sampleCount += rollup.github.sampleCount;
  }
  if (sources.length === 0) return null;
  return { count, sampleCount, sources };
}

/**
 * AC-083① 이모지 축 — 두 경로 모두 대조 대상이다. 규약이 "이모지 사용 지양"(`emojiPolicy:
 * 'avoid'`)으로 합의됐는데 실제 관측된 이모지 사용이 1건이라도 있으면 불일치로 본다.
 *
 * 🔴 반대 방향(`emojiPolicy: 'ok'`인데 관측 이모지가 0건)은 판정하지 않는다 — AC-079⑥이 명시한
 * 검증 예시가 "규약 이모지 미사용 + 관측 빈도 높음"뿐이고, 반대 방향은 PRD 어디에도 요구되지
 * 않는다(이모지를 쓸 수 있는데 안 쓴 것은 "문제"가 아니다 — 억지 매핑을 만들지 않는다는
 * AC-083③과 같은 정신).
 */
function checkEmojiAxis(protocol: PairProtocol, rollup: CounterpartObservationRollup): MismatchAxisResult | null {
  if (protocol.emojiPolicy !== 'avoid') return null;
  const eligible = aggregateEligibleSources(rollup, (bucket) => bucket.emojiCount);
  if (!eligible) return null;
  const mismatched = eligible.count > 0;
  return {
    axis: 'emoji',
    mismatched,
    comparison: `규약: 이모지 사용 지양 · 관측: 이모지 ${eligible.count}건 (표본 ${eligible.sampleCount}건)`,
    sampleCount: eligible.sampleCount,
    sources: eligible.sources,
  };
}

/**
 * AC-083① 직설(직설 허용 ↔ 완곡 표현 빈도) 축 — **수동 표시 표본에서만** 대조한다(GitHub
 * 표본만 있는 상대에게는 이 축을 만들지 않는다 — GitHub 코멘트에서 완곡 표현 빈도를 재는 것은
 * 대응이 약하다는 Planning Decision #106의 판단을 그대로 따른다).
 *
 * 규약이 "직설 허용"(`directnessAllowed: 'yes'`)인데 완곡 표현(`hedgeCount`)이 1건이라도
 * 관측되면 불일치로 본다. 반대 방향은 이모지 축과 같은 이유로 판정하지 않는다.
 */
function checkDirectnessAxis(
  protocol: PairProtocol,
  rollup: CounterpartObservationRollup,
): MismatchAxisResult | null {
  if (protocol.directnessAllowed !== 'yes') return null;
  if (rollup.manual.sampleCount < MANUAL_STYLE_SUGGESTION_SAMPLE_THRESHOLD) return null;
  const mismatched = rollup.manual.hedgeCount > 0;
  return {
    axis: 'directness',
    mismatched,
    comparison: `규약: 직설 허용 · 관측: 완곡 표현 ${rollup.manual.hedgeCount}건 (표본 ${rollup.manual.sampleCount}건)`,
    sampleCount: rollup.manual.sampleCount,
    sources: ['manual'],
  };
}

/** `docs/API.md:243` Response 200의 `axes[]`를 만든다. 판정 불가(표본 미달·합의값 없음)인
 * 축은 배열에서 완전히 빠진다 — 빈 항목·`null`로도 넣지 않는다(AC-083②). */
export function computeProtocolMismatches(
  protocol: PairProtocol,
  rollup: CounterpartObservationRollup,
): MismatchAxisResult[] {
  const results = [checkEmojiAxis(protocol, rollup), checkDirectnessAxis(protocol, rollup)];
  return results.filter((result): result is MismatchAxisResult => result !== null);
}
