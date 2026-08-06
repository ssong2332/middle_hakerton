/**
 * T28 — `run()` 오케스트레이션(AC-032). `pipeline.ts` 헤더 주석이 지시한 형태
 * (`export const run: MediationPipeline = async (input, deps) => {...}`)의 **동작**을 검증한다
 * (형태 자체는 TS가 컴파일 시점에 강제한다 — 그 파일 헤더 "T28은 아래 한 가지 형태로만 구현한다"
 * 참조).
 *
 * 🔴 AC-032의 핵심 증거는 "LLM 호출이 C1 → C2 → C4 순서로 일어난다"는 것이다 — C3(프로필)·C5(사전)는
 * 별도 LLM 호출이 아니라 C2 호출의 입력으로 흡수된다(`docs/Architecture.md` Data Flow ①⑤,
 * `pipeline.ts` 헤더 주석). 아래 첫 테스트가 그 순서를 스텝 이름 배열로 고정한다.
 */
import { describe, expect, it, vi } from 'vitest';
import { run } from './pipeline';
import type { MediationDeps, MediationInput } from './pipeline';
import type { LLMClient, LLMStep } from './llm/client';

function baseInput(overrides: Partial<MediationInput> = {}): MediationInput {
  return {
    text: '금요일까지 확인 부탁드립니다.',
    sender: {
      language: 'ko',
      profile: {
        onboardingState: 'completed',
        directness: null,
        emojiPreference: null,
        formality: null,
        honorificLevel: 'haeyo',
      },
    },
    recipient: {
      identifier: 'counterpart@example.com',
      protocol: null,
      country: null,
      timezone: null,
    },
    context: {
      languageDirection: 'ko-en',
      channel: 'web',
      urgencyOverride: null,
      needDeadline: null,
    },
    ...overrides,
  };
}

function baseDeps(llm: LLMClient, overrides: Partial<MediationDeps> = {}): MediationDeps {
  return {
    llm,
    data: { dictionary: [], learnedItems: [] },
    referenceDate: '2026-08-05',
    ...overrides,
  };
}

/**
 * `complete()` 호출 순서를 `calls`에 기록하고, step별로 스키마를 만족하는 최소 응답을 돌려준다.
 * `payloads`는 각 step에 실제로 전달된 payload를 보관한다(C3/C5 배선을 payload로 검증하기 위함).
 */
function fakeLlm(
  overrides: {
    urgency?: string;
    urgencyReason?: string;
    toneTransformed?: string;
    toneUnregisteredHonorifics?: string[];
    backTranslation?: string;
  } = {},
) {
  const calls: LLMStep[] = [];
  const payloads: Record<string, unknown> = {};
  const complete = vi.fn(async (step: LLMStep, _promptVersion: string, payload: unknown) => {
    calls.push(step);
    payloads[step] = payload;
    if (step === 'c1') {
      return {
        content: JSON.stringify({
          urgency: overrides.urgency ?? 'NORMAL',
          reason: overrides.urgencyReason ?? '일반 업무 요청입니다.',
        }),
        source: 'live' as const,
      };
    }
    if (step === 'c2') {
      return {
        content: JSON.stringify({
          transformed: overrides.toneTransformed ?? 'Please confirm by Friday.',
          reason: '완곡한 요청을 명시적 요청으로 복원했습니다.',
          preserved: [],
          misreadRisks: [],
          unregisteredHonorifics: overrides.toneUnregisteredHonorifics ?? [],
        }),
        source: 'live' as const,
      };
    }
    return {
      content: JSON.stringify({ backTranslation: overrides.backTranslation ?? '금요일까지 확인 부탁드립니다.' }),
      source: 'live' as const,
    };
  });
  const llm: LLMClient = { complete };
  return { llm, calls, payloads };
}

describe('run() — T28 파이프라인 조립', () => {
  it('AC-032 — LLM 호출이 C1 → C2 → C4 순서로 일어난다(C3/C5는 별도 호출이 아니라 C2 입력으로 흡수)', async () => {
    const { llm, calls } = fakeLlm();

    await run(baseInput(), baseDeps(llm));

    expect(calls).toEqual(['c1', 'c2', 'c4']);
  });

  it('C3 — sender.profile.honorificLevel이 C2 payload로 그대로 전달된다', async () => {
    const { llm, payloads } = fakeLlm();

    await run(baseInput(), baseDeps(llm));

    expect(payloads.c2).toMatchObject({ honorificLevel: 'haeyo' });
  });

  it('프로필이 비어 있으면(skipped) honorificLevel이 null로 C2 payload에 전달된다(AC-059②③ — 기본값을 채우지 않는다)', async () => {
    const { llm, payloads } = fakeLlm();
    const input = baseInput({
      sender: {
        language: 'ko',
        profile: {
          onboardingState: 'skipped',
          directness: null,
          emojiPreference: null,
          formality: null,
          honorificLevel: null,
        },
      },
    });

    await run(input, baseDeps(llm));

    expect(payloads.c2).toMatchObject({ honorificLevel: null });
  });

  it('C5 — deps.data.dictionary가 C2 payload로 그대로 전달된다', async () => {
    const { llm, payloads } = fakeLlm();
    const dictionary = [
      {
        entryType: 'person' as const,
        sourceText: '김수진',
        targetText: null,
        koHonorific: '김 대리님',
        enHonorific: 'Sujin Kim',
      },
    ];

    await run(baseInput(), baseDeps(llm, { data: { dictionary, learnedItems: [] } }));

    expect(payloads.c2).toMatchObject({ dictionary });
  });

  it('F1-d — deps.referenceDate가 C2 payload의 referenceYear로 반영된다(core는 시스템 시계를 읽지 않는다)', async () => {
    const { llm, payloads } = fakeLlm();

    await run(baseInput(), baseDeps(llm, { referenceDate: '2030-01-01' }));

    expect(payloads.c2).toMatchObject({ referenceYear: '2030' });
  });

  it('C4 — backTranslation의 targetLanguage는 input.sender.language다(AC-001)', async () => {
    const { llm, payloads } = fakeLlm();

    await run(baseInput({ sender: { language: 'en', profile: baseInput().sender.profile } }), baseDeps(llm));

    expect(payloads.c4).toMatchObject({ targetLanguage: 'en' });
  });

  it('AC-004 — urgencyOverride가 있으면 C1 판정 대신 override 값이 반영된다', async () => {
    const { llm } = fakeLlm({ urgency: 'NORMAL' });
    const input = baseInput({
      context: {
        languageDirection: 'ko-en',
        channel: 'web',
        urgencyOverride: 'CRITICAL',
        needDeadline: null,
      },
    });

    const result = await run(input, baseDeps(llm));

    expect(result.urgency).toBe('CRITICAL');
    // 근거 문장은 override에 대해 지어내지 않고 C1의 원래 판단 근거를 그대로 유지한다.
    expect(result.urgencyReason).toBe('일반 업무 요청입니다.');
  });

  it('AC-005 — CRITICAL이면 (예약·지연 경로가 아직 없으므로) 톤 정제까지 정상 완료된다', async () => {
    const { llm, calls } = fakeLlm({ urgency: 'CRITICAL' });

    const result = await run(baseInput(), baseDeps(llm));

    expect(result.urgency).toBe('CRITICAL');
    expect(calls).toEqual(['c1', 'c2', 'c4']);
  });

  it('AC-046③ — en-ko 방향에서 C2 변환문에 존댓말 혼용이 있으면 warnings에 담긴다', async () => {
    const { llm } = fakeLlm({ toneTransformed: '확인 부탁드립니다. 편하실 때 연락 주세요.' });
    const input = baseInput({
      context: { languageDirection: 'en-ko', channel: 'web', urgencyOverride: null, needDeadline: null },
    });

    const result = await run(input, baseDeps(llm));

    expect(result.warnings).toContainEqual(expect.objectContaining({ type: 'honorificLevelMixed' }));
  });

  it('AC-047② — C2가 보고한 unregisteredHonorifics가 warnings에 honorificNotRegistered로 담긴다', async () => {
    const { llm } = fakeLlm({
      toneTransformed: 'Hi Minho, could you take a look?',
      toneUnregisteredHonorifics: ['Minho'],
    });
    const input = baseInput({ text: 'Hi Minho, could you take a look?' });

    const result = await run(input, baseDeps(llm));

    expect(result.warnings).toContainEqual(
      expect.objectContaining({ type: 'honorificNotRegistered', subject: 'Minho' }),
    );
  });

  it('AC-058① — 감정 신호가 없는 원문이면 ticketOption이 signal_absent로 미제시다', async () => {
    const { llm } = fakeLlm();
    const input = baseInput({ text: '확인 부탁드립니다' });

    const result = await run(input, baseDeps(llm));

    expect(result.ticketOption).toEqual({ offered: false, basis: 'signal_absent' });
  });

  it('AC-058② — 감정 신호가 있는 원문이면 ticketOption이 signal_present로 제시된다', async () => {
    const { llm } = fakeLlm();
    const input = baseInput({ text: '이건 명백히 그쪽 실수입니다' });

    const result = await run(input, baseDeps(llm));

    expect(result.ticketOption).toEqual({ offered: true, basis: 'signal_present' });
  });

  it('AC-059③/AC-066③ — 온보딩 완료 + 수신자 지정이면 personalizationApplied가 true다', async () => {
    const { llm } = fakeLlm();

    const result = await run(baseInput(), baseDeps(llm));

    expect(result.personalizationApplied).toBe(true);
  });

  it('AC-059③ — 온보딩을 건너뛴 프로필이면 수신자가 있어도 personalizationApplied가 false다', async () => {
    const { llm } = fakeLlm();
    const input = baseInput({
      sender: {
        language: 'ko',
        profile: {
          onboardingState: 'skipped',
          directness: null,
          emojiPreference: null,
          formality: null,
          honorificLevel: null,
        },
      },
    });

    const result = await run(input, baseDeps(llm));

    expect(result.personalizationApplied).toBe(false);
  });

  it('AC-066③ — 수신자가 미지정(null)이면 프로필이 완료 상태여도 personalizationApplied가 false다', async () => {
    const { llm } = fakeLlm();
    const input = baseInput({ recipient: null });

    const result = await run(input, baseDeps(llm));

    expect(result.personalizationApplied).toBe(false);
  });

  it('AC-063① — 수신자 국가 연동이 아직 없어 holidayConflicts는 항상 빈 배열이다', async () => {
    const { llm } = fakeLlm();

    const result = await run(baseInput(), baseDeps(llm));

    expect(result.holidayConflicts).toEqual([]);
  });

  it('F1-e — stepSources를 뒤섞지 않고 담고, source는 그 중 가장 신뢰도가 낮은 값이다', async () => {
    const calls: LLMStep[] = [];
    const complete = vi.fn(async (step: LLMStep) => {
      calls.push(step);
      if (step === 'c1') {
        return { content: JSON.stringify({ urgency: 'NORMAL', reason: '근거' }), source: 'cache' as const };
      }
      if (step === 'c2') {
        return {
          content: JSON.stringify({
            transformed: 'ok',
            reason: 'ok',
            preserved: [],
            misreadRisks: [],
            unregisteredHonorifics: [],
          }),
          source: 'fallback' as const,
        };
      }
      return { content: JSON.stringify({ backTranslation: 'ok' }), source: 'live' as const };
    });
    const llm: LLMClient = { complete };

    const result = await run(baseInput(), baseDeps(llm));

    expect(result.stepSources).toEqual({ c1: 'cache', c2: 'fallback', c4: 'live' });
    expect(result.source).toBe('fallback');
  });

  it('AC-013/AC-032 — deps.data.learnedItems가 있어도 예외 없이 정상 완료된다(소비 로직은 미배정 — 계약 배선만 확인)', async () => {
    const { llm } = fakeLlm();
    const learnedItems = [{ patternKey: 'emoji_removed', value: 'avoids' }];

    const result = await run(
      baseInput(),
      baseDeps(llm, { data: { dictionary: [], learnedItems } }),
    );

    expect(result.transformed).toBe('Please confirm by Friday.');
  });
});
