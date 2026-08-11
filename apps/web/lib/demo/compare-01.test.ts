/**
 * T62 — COMPARE-01 데모 장면(`docs/TestCases.md:311-342`, `docs/Tasks.md` T62) 검증. 실제
 * 시드 데이터(`seed-data.ts`)로 실제 파이프라인(`packages/core`의 `run()`)을 3인분 실행해,
 * "동일 원문이 타나카·Michael·Sarah에게 서로 다른 스타일 축(직설/이모지)으로 전달된다"는 장면의
 * 핵심 주장을 통합 레벨에서 확인한다. `pipeline.test.ts`는 규약 우선순위 메커니즘 자체를 이미
 * 단위 테스트로 증명했다 — 이 파일은 그 메커니즘이 **이 리포의 실제 시드 값**으로 실행됐을 때
 * COMPARE-01이 발표에서 주장하는 결과를 정말로 만드는지를 확인하는 것이 목적이다(메커니즘
 * 재증명이 아니다).
 *
 * 🔴 **발견(2026-08-11, T62)**: 만약 발신자(박지훈)의 C3 학습값이 비어 있다면, Michael의 규약
 * (`directnessAllowed:'yes'→'direct'`, `emojiPolicy:'ok'→'neutral'`)은 박지훈의 자기신고
 * 기본값(`JIHOON_SELF_REPORT`: direct/neutral)과 **우연히 같은 값**이 되어, Michael(규약 있음)과
 * Sarah(규약 없음 → 자기신고로 폴백)가 **구분되지 않는다** — "Michael vs Sarah는 #24 규약이
 * 있어야만 갈린다"는 장면의 반박 대비 핵심 주장(`docs/TestCases.md:336-342`)이 깨진다. 실제로는
 * T61이 심은 diff 히스토리에서 `cushion_insert`가 전역 3회에 도달해(`DIFF_HISTORY_SOURCE`) 박지훈의
 * **학습된** directness가 `indirect`로 갱신되므로(Sarah는 이 학습값으로 폴백, Michael은 규약이
 * 학습값보다 우선해 `direct`를 유지) 실제로는 갈린다 — 하지만 이것은 우연이 아니라 **학습 상태에
 * 의존하는 조건**이며, 아래 테스트가 이 의존성을 명시적으로 고정한다(학습 히스토리가 바뀌어
 * cushion_insert가 3회 미만이 되면 이 테스트가 그 사실을 즉시 드러낸다).
 */
import { describe, expect, it, vi } from 'vitest';
import { run, profileValueForPattern } from '@cross-border/core';
import type {
  CommunicationProfile,
  LearnedItem,
  LLMClient,
  LLMStep,
  MediationDeps,
  MediationInput,
  PairProtocol,
} from '@cross-border/core';
import {
  buildPairProtocols,
  countByPatternKey,
  DEMO_IDENTIFIERS,
  DIFF_HISTORY_SOURCE,
  JIHOON_SELF_REPORT,
  type PairProtocolRow,
} from './seed-data';

const COMPARE_01_TEXT =
  '결제 모듈 스펙을 아직 못 받았습니다. 이번 주 안에 주셔야 다음 주 개발 착수가 가능합니다.';

const JIHOON_PROFILE: CommunicationProfile = {
  onboardingState: 'completed',
  directness: JIHOON_SELF_REPORT.directness,
  emojiPreference: JIHOON_SELF_REPORT.emojiPreference,
  formality: JIHOON_SELF_REPORT.formality,
  honorificLevel: JIHOON_SELF_REPORT.honorificLevel,
};

/** T61이 실제로 심는 diff 히스토리에서, 3회 이상 반복된 패턴만 "학습됨"으로 반영한다
 * (`profile_learned_items` CHECK 제약 `observed_count >= 3`과 같은 규칙, `pattern-learning.ts`
 * 헤더 주석 참조) — 어떤 패턴이 3회에 도달했는지를 하드코딩하지 않고 실제 시드 데이터에서
 * 계산해, 히스토리가 바뀌면 이 테스트도 함께 갱신된다. */
const patternCounts = countByPatternKey(DIFF_HISTORY_SOURCE);
const JIHOON_LEARNED_ITEMS: LearnedItem[] = Object.entries(patternCounts)
  .filter(([, count]) => count >= 3)
  .map(([patternKey]) => ({
    patternKey,
    value: profileValueForPattern(patternKey as 'cushion_insert' | 'emoji_removed'),
  }));

function toPairProtocol(row: PairProtocolRow): PairProtocol {
  return {
    directnessAllowed: row.directness_allowed,
    emojiPolicy: row.emoji_policy,
    addressForm: row.address_form,
    deadlineStyle: row.deadline_style,
  };
}

/** `pipeline.test.ts`의 `fakeLlm()`과 같은 패턴 — C2에 실제로 전달된 payload를 캡처한다.
 * LLM 응답 내용 자체(변환문)는 검증 대상이 아니다(실LLM 호출 없이 결정적으로 검증 가능한
 * "무엇을 입력으로 보냈는가"만 본다 — 실LLM 결과 검증은 T35 리허설의 몫). */
function captureC2Payload() {
  let captured: { directness: unknown; emojiPreference: unknown } | null = null;
  const complete = vi.fn(async (step: LLMStep, _version: string, payload: unknown) => {
    if (step === 'c2') {
      captured = payload as { directness: unknown; emojiPreference: unknown };
      return {
        content: JSON.stringify({
          transformed: 'stub',
          reason: 'stub',
          preserved: [],
          misreadRisks: [],
          unregisteredHonorifics: [],
        }),
        source: 'live' as const,
      };
    }
    if (step === 'c1') {
      return { content: JSON.stringify({ urgency: 'NORMAL', reason: 'stub' }), source: 'live' as const };
    }
    return { content: JSON.stringify({ backTranslation: 'stub' }), source: 'live' as const };
  });
  const llm: LLMClient = { complete };
  return { llm, getCaptured: () => captured };
}

async function runForRecipient(
  protocol: PairProtocol | null,
  languageDirection: 'ko-en' | 'en-ko',
): Promise<{ directness: unknown; emojiPreference: unknown }> {
  const { llm, getCaptured } = captureC2Payload();
  const input: MediationInput = {
    text: COMPARE_01_TEXT,
    sender: { language: 'ko', profile: JIHOON_PROFILE },
    recipient: { identifier: 'recipient@example.com', protocol, country: null, timezone: null },
    context: { languageDirection, channel: 'web', urgencyOverride: null, needDeadline: null },
  };
  const deps: MediationDeps = {
    llm,
    data: { dictionary: [], learnedItems: JIHOON_LEARNED_ITEMS },
    referenceDate: '2026-08-11',
  };
  await run(input, deps);
  const captured = getCaptured();
  if (!captured) throw new Error('c2가 호출되지 않았다');
  return captured;
}

describe('COMPARE-01 — 실제 시드 규약으로 3인 C2 payload가 갈린다(docs/TestCases.md:311-342)', () => {
  const [tanakaRow, michaelRow] = buildPairProtocols(DEMO_IDENTIFIERS);

  it('전제 — cushion_insert가 실제로 3회 도달해 있다(이 전제가 깨지면 아래 검증 전체의 의미가 바뀐다)', () => {
    expect(patternCounts.cushion_insert).toBeGreaterThanOrEqual(3);
    expect(JIHOON_LEARNED_ITEMS).toContainEqual({ patternKey: 'cushion_insert', value: 'indirect' });
  });

  it('타나카 — 규약(직설 불허/이모지 회피)이 C2 payload에 그대로 반영된다', async () => {
    const result = await runForRecipient(toPairProtocol(tanakaRow), 'ko-en');
    expect(result).toMatchObject({ directness: 'indirect', emojiPreference: 'avoids' });
  });

  it('Michael — 규약(직설 허용/이모지 ok)이 C2 payload에 반영되고, 학습값(indirect)에 덮이지 않는다(AC-037 규약 우선)', async () => {
    const result = await runForRecipient(toPairProtocol(michaelRow), 'ko-en');
    expect(result).toMatchObject({ directness: 'direct', emojiPreference: 'neutral' });
  });

  it('Sarah — 규약이 없으므로 C3 학습값(cushion_insert→indirect)으로 폴백한다(cold start)', async () => {
    const result = await runForRecipient(null, 'ko-en');
    expect(result).toMatchObject({ directness: 'indirect', emojiPreference: 'neutral' });
  });

  it('핵심 반박 대비 주장 — Michael과 Sarah는 규약 유무만으로 갈린다(둘 다 영어권, 언어쌍 무관, docs/TestCases.md:336-342)', async () => {
    const michael = await runForRecipient(toPairProtocol(michaelRow), 'ko-en');
    const sarah = await runForRecipient(null, 'ko-en');

    expect(michael.directness).not.toBe(sarah.directness);
  });

  it('타나카와 Michael도 서로 다르다(규약 자체가 다른 값이므로 언어쌍과 무관하게도 갈린다)', async () => {
    const tanaka = await runForRecipient(toPairProtocol(tanakaRow), 'ko-en');
    const michael = await runForRecipient(toPairProtocol(michaelRow), 'ko-en');

    expect(tanaka).not.toEqual(michael);
  });
});
