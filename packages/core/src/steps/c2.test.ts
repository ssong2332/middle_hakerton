/**
 * C2 톤 변환 스텝 — AC-006(보존)·AC-043(오해 사전 경고)·AC-045(KO→EN 긴급도 복원)·
 * AC-046(EN→KO 존댓말 레벨)·AC-049(날짜·숫자 정규화) 단위 테스트.
 * `LLMClient`를 모킹한다(`docs/CodingRules.md` Tests "모킹 정책" — LLM은 모킹).
 * 구조(스키마 준수·폴백·에러 계약)만 검증한다 — 변환의 의미적 정확도는 `docs/TestCases.md`를
 * 쓰는 T11 러너의 몫이다(`docs/CodingRules.md` Tests "이 프로젝트에서의 적용" 표, `c1.test.ts`와
 * 동일한 경계).
 */
import { describe, expect, it, vi } from 'vitest';
import type { LLMClient, LLMResponse } from '../llm/client';
import { LLMMalformedResponseError } from '../errors';
import { runToneTransform } from './c2';

function fakeLlm(response: LLMResponse): LLMClient {
  return { complete: vi.fn().mockResolvedValue(response) };
}

const VALID_CONTENT = JSON.stringify({
  transformed: 'Please confirm by Friday.',
  reason: '완곡한 요청을 명시적 기한과 액션 요청으로 복원했습니다.',
  preserved: [{ kind: 'deadline', sourceText: '금요일까지', transformedText: 'by Friday' }],
  misreadRisks: [],
});

describe('runToneTransform', () => {
  it('LLM 응답의 transformed/reason/preserved/misreadRisks/source를 그대로 반환한다(AC-006/043)', async () => {
    const llm = fakeLlm({ content: VALID_CONTENT, source: 'live' });

    const result = await runToneTransform(
      {
        text: '금요일까지 부탁드립니다',
        languageDirection: 'ko-en',
        honorificLevel: null,
        referenceDate: '2026-08-05',
      },
      llm,
    );

    expect(result).toEqual({
      transformed: 'Please confirm by Friday.',
      reason: '완곡한 요청을 명시적 기한과 액션 요청으로 복원했습니다.',
      preserved: [{ kind: 'deadline', sourceText: '금요일까지', transformedText: 'by Friday' }],
      misreadRisks: [],
      unregisteredHonorifics: [],
      source: 'live',
    });
  });

  it('step "c2"와 PROMPT_VERSION, payload(text/languageDirection)를 그대로 LLMClient.complete()에 넘긴다', async () => {
    const llm = fakeLlm({ content: VALID_CONTENT, source: 'live' });

    await runToneTransform(
      {
        text: 'hello',
        languageDirection: 'en-ko',
        honorificLevel: 'hapsyo',
        referenceDate: '2026-08-05',
      },
      llm,
    );

    expect(llm.complete).toHaveBeenCalledWith(
      'c2',
      expect.any(String),
      expect.objectContaining({ text: 'hello', languageDirection: 'en-ko' }),
    );
  });

  it('honorificLevel이 null이면 null을 그대로 payload에 싣는다(기본값으로 채우지 않는다 — DECISIONS #40, ADR-0007)', async () => {
    const llm = fakeLlm({ content: VALID_CONTENT, source: 'live' });

    await runToneTransform(
      { text: 'hi', languageDirection: 'en-ko', honorificLevel: null, referenceDate: '2026-08-05' },
      llm,
    );

    expect(llm.complete).toHaveBeenCalledWith(
      'c2',
      expect.any(String),
      expect.objectContaining({ honorificLevel: null }),
    );
  });

  it('honorificLevel이 명시되면 그 값을 그대로 payload에 싣는다', async () => {
    const llm = fakeLlm({ content: VALID_CONTENT, source: 'live' });

    await runToneTransform(
      {
        text: 'hi',
        languageDirection: 'en-ko',
        honorificLevel: 'hapsyo',
        referenceDate: '2026-08-05',
      },
      llm,
    );

    expect(llm.complete).toHaveBeenCalledWith(
      'c2',
      expect.any(String),
      expect.objectContaining({ honorificLevel: 'hapsyo' }),
    );
  });

  it('cache/fallback source도 그대로 전달한다(AC-041)', async () => {
    const llm = fakeLlm({ content: VALID_CONTENT, source: 'fallback' });

    const result = await runToneTransform(
      {
        text: 'hi',
        languageDirection: 'ko-en',
        honorificLevel: null,
        referenceDate: '2026-08-05',
      },
      llm,
    );

    expect(result.source).toBe('fallback');
  });

  it('content가 유효한 JSON이 아니고 폴백도 없으면 LLMMalformedResponseError를 던진다', async () => {
    const llm = fakeLlm({ content: '이것은 JSON이 아닙니다', source: 'live' });

    await expect(
      runToneTransform(
        {
          text: 'hi',
          languageDirection: 'ko-en',
          honorificLevel: null,
          referenceDate: '2026-08-05',
        },
        llm,
        {
          fallbackLookup: () => undefined,
        },
      ),
    ).rejects.toBeInstanceOf(LLMMalformedResponseError);
  });

  it('transformed가 빈 문자열이면 LLMMalformedResponseError를 던진다(없는 값을 지어내지 않는다)', async () => {
    const llm = fakeLlm({
      content: JSON.stringify({ transformed: '', reason: 'x', preserved: [], misreadRisks: [] }),
      source: 'live',
    });

    await expect(
      runToneTransform(
        {
          text: 'hi',
          languageDirection: 'ko-en',
          honorificLevel: null,
          referenceDate: '2026-08-05',
        },
        llm,
        {
          fallbackLookup: () => undefined,
        },
      ),
    ).rejects.toBeInstanceOf(LLMMalformedResponseError);
  });

  it('preserved 항목의 kind가 3종 밖이면 LLMMalformedResponseError를 던진다', async () => {
    const llm = fakeLlm({
      content: JSON.stringify({
        transformed: 'x',
        reason: 'y',
        preserved: [{ kind: 'urgency', sourceText: 'a', transformedText: 'b' }],
        misreadRisks: [],
      }),
      source: 'live',
    });

    await expect(
      runToneTransform(
        {
          text: 'hi',
          languageDirection: 'ko-en',
          honorificLevel: null,
          referenceDate: '2026-08-05',
        },
        llm,
        {
          fallbackLookup: () => undefined,
        },
      ),
    ).rejects.toBeInstanceOf(LLMMalformedResponseError);
  });

  it('misreadRisks 항목에 evidence가 빠지면 LLMMalformedResponseError를 던진다(AC-043① 3요소 필수)', async () => {
    const llm = fakeLlm({
      content: JSON.stringify({
        transformed: 'x',
        reason: 'y',
        preserved: [],
        misreadRisks: [{ quote: 'a', misreading: 'b' }],
      }),
      source: 'live',
    });

    await expect(
      runToneTransform(
        {
          text: 'hi',
          languageDirection: 'ko-en',
          honorificLevel: null,
          referenceDate: '2026-08-05',
        },
        llm,
        {
          fallbackLookup: () => undefined,
        },
      ),
    ).rejects.toBeInstanceOf(LLMMalformedResponseError);
  });

  it('preserved/misreadRisks가 빈 배열인 응답도 정상 반환한다(둘 다 유효한 값)', async () => {
    const llm = fakeLlm({
      content: JSON.stringify({ transformed: 'x', reason: 'y', preserved: [], misreadRisks: [] }),
      source: 'live',
    });

    const result = await runToneTransform(
      {
        text: 'hi',
        languageDirection: 'ko-en',
        honorificLevel: null,
        referenceDate: '2026-08-05',
      },
      llm,
    );

    expect(result.preserved).toEqual([]);
    expect(result.misreadRisks).toEqual([]);
  });

  it('preserved 항목의 transformedText가 실제 transformed 문자열에 없으면(자기신고 불일치) 그 항목을 제외한다(reviewer 후속 Major 3, 교차 검증)', async () => {
    const llm = fakeLlm({
      content: JSON.stringify({
        transformed: 'Please confirm the payment issue.',
        reason: 'x',
        preserved: [
          // 날조 — 'by Friday'는 transformed 어디에도 없다.
          { kind: 'deadline', sourceText: '금요일까지', transformedText: 'by Friday' },
        ],
        misreadRisks: [],
      }),
      source: 'live',
    });

    const result = await runToneTransform(
      {
        text: '금요일까지 부탁드립니다',
        languageDirection: 'ko-en',
        honorificLevel: null,
        referenceDate: '2026-08-05',
      },
      llm,
    );

    expect(result.preserved).toEqual([]);
  });

  it('preserved 항목 중 실제 transformed에 있는 것만 남기고 없는 것만 제외한다(부분 불일치)', async () => {
    const llm = fakeLlm({
      content: JSON.stringify({
        transformed: 'Please confirm the payment API issue by Friday.',
        reason: 'x',
        preserved: [
          { kind: 'deadline', sourceText: '금요일까지', transformedText: 'by Friday' }, // 실제로 있음
          {
            kind: 'action',
            sourceText: '확인 부탁드립니다',
            transformedText: 'not present anywhere',
          }, // 날조
        ],
        misreadRisks: [],
      }),
      source: 'live',
    });

    const result = await runToneTransform(
      {
        text: '금요일까지 결제 API 확인 부탁드립니다',
        languageDirection: 'ko-en',
        honorificLevel: null,
        referenceDate: '2026-08-05',
      },
      llm,
    );

    expect(result.preserved).toEqual([
      { kind: 'deadline', sourceText: '금요일까지', transformedText: 'by Friday' },
    ]);
  });

  it('step 레벨 스키마 검증 실패 시에도 폴백을 먼저 조회해 200 + source:fallback을 반환한다(docs/API.md:48, c1/c4 Major 1과 동일 패턴)', async () => {
    const llm = fakeLlm({ content: JSON.stringify({ unexpected: 'field' }), source: 'live' });
    const fallbackLookup = vi.fn().mockReturnValue({ step: 'c2', content: VALID_CONTENT });

    const result = await runToneTransform(
      {
        text: 'hi',
        languageDirection: 'ko-en',
        honorificLevel: null,
        referenceDate: '2026-08-05',
      },
      llm,
      { fallbackLookup },
    );

    expect(result).toEqual({
      transformed: 'Please confirm by Friday.',
      reason: '완곡한 요청을 명시적 기한과 액션 요청으로 복원했습니다.',
      preserved: [{ kind: 'deadline', sourceText: '금요일까지', transformedText: 'by Friday' }],
      misreadRisks: [],
      unregisteredHonorifics: [],
      source: 'fallback',
    });
    expect(fallbackLookup).toHaveBeenCalledWith('c2', expect.any(String));
  });

  it('폴백 조회 결과도 없으면 LLMMalformedResponseError를 던진다', async () => {
    const llm = fakeLlm({ content: '이것은 JSON이 아닙니다', source: 'live' });
    const fallbackLookup = vi.fn().mockReturnValue(undefined);

    await expect(
      runToneTransform(
        {
          text: 'hi',
          languageDirection: 'ko-en',
          honorificLevel: null,
          referenceDate: '2026-08-05',
        },
        llm,
        {
          fallbackLookup,
        },
      ),
    ).rejects.toBeInstanceOf(LLMMalformedResponseError);
    expect(fallbackLookup).toHaveBeenCalled();
  });

  // T16(AC-041) — `fallbackLookup`을 주입하지 않으면 기본값(`../data/fallback-responses`의 실제
  // `FALLBACK_RESPONSES`)이 쓰인다. T16이 채운 실 데이터가 이 스텝의 스키마(preserved[]가 자기신고
  // 불일치 필터까지 통과하는지 포함)를 만족하는지 증명한다.
  it('T16 — fallbackLookup 미주입 시 실 FALLBACK_RESPONSES의 c2 기본값으로 정상 폴백한다', async () => {
    const llm = fakeLlm({ content: '이것은 JSON이 아닙니다', source: 'live' });

    const result = await runToneTransform(
      {
        text: '아무 원문',
        languageDirection: 'ko-en',
        honorificLevel: null,
        referenceDate: '2026-08-05',
      },
      llm,
    );

    expect(result.source).toBe('fallback');
    expect(result.transformed.length).toBeGreaterThan(0);
    expect(result.reason.length).toBeGreaterThan(0);
    expect(Array.isArray(result.preserved)).toBe(true);
    expect(Array.isArray(result.misreadRisks)).toBe(true);
  });

  /**
   * 🔴 QA 정적 분석 후속 — `docs/TestCases.md` P-03/P-09/D-01/D-03/D-06(연도 없는 원문에 연도
   * 포함 출력을 요구)이 payload에서 연도 정보를 실제로 받는지 검증한다(실 LLM 호출 없이,
   * `LLMClient`를 모킹해 `runToneTransform`이 넘기는 payload만 캡처 — 헤더 주석의 경계와 동일).
   */
  describe('referenceDate → payload.referenceYear(QA 정적 분석 후속)', () => {
    async function capturePayload(referenceDate: string): Promise<unknown> {
      let captured: unknown;
      const llm: LLMClient = {
        complete: vi.fn().mockImplementation((_step, _promptVersion, payload) => {
          captured = payload;
          return Promise.resolve({ content: VALID_CONTENT, source: 'live' });
        }),
      };
      await runToneTransform(
        { text: 'hi', languageDirection: 'ko-en', honorificLevel: null, referenceDate },
        llm,
      );
      return captured;
    }

    it('P-03 원문("8월 12일 14시")처럼 연도 없는 날짜가 있는 케이스도 payload.referenceYear를 받는다', async () => {
      const payload = (await capturePayload('2026-08-05')) as { referenceYear: string };
      expect(payload.referenceYear).toBe('2026');
    });

    it('referenceDate의 연도가 그대로 payload.referenceYear로 전달된다(월/일은 버려진다)', async () => {
      const payload = (await capturePayload('2027-01-31')) as { referenceYear: string };
      expect(payload.referenceYear).toBe('2027');
    });

    it('instruction에 실제 기준 연도가 반영된다(하드코딩된 연도가 아니다)', async () => {
      const payload = (await capturePayload('2030-05-01')) as { instruction: string };
      expect(payload.instruction).toContain('2030');
    });
  });

  /**
   * T22 — C5 용어사전 주입(AC-015/AC-047) 배선 검증. 의미적 정확도(LLM이 실제로 사전 값을
   * 지킬지)는 여기서 검증하지 않는다(`docs/TestCases.md` AC-047 표를 쓰는 T11 러너의 몫) —
   * 이 스텝이 (a) `input.dictionary`를 `buildC2Payload`에 그대로 넘기는지, (b) 응답의
   * `unregisteredHonorifics`를 원문과 교차 검증해 파싱하는지만 본다(`preserved[]`의 기존
   * 교차 검증 테스트와 같은 경계).
   */
  describe('dictionary(T22, AC-015/AC-047)', () => {
    const DICTIONARY = [
      {
        entryType: 'person' as const,
        sourceText: '김수진',
        targetText: null,
        koHonorific: '김 대리님',
        enHonorific: 'Sujin Kim',
      },
    ];

    it('input.dictionary를 payload.dictionary로 그대로 LLMClient.complete()에 넘긴다', async () => {
      const llm = fakeLlm({ content: VALID_CONTENT, source: 'live' });

      await runToneTransform(
        {
          text: 'hi',
          languageDirection: 'ko-en',
          honorificLevel: null,
          referenceDate: '2026-08-05',
          dictionary: DICTIONARY,
        },
        llm,
      );

      expect(llm.complete).toHaveBeenCalledWith(
        'c2',
        expect.any(String),
        expect.objectContaining({ dictionary: DICTIONARY }),
      );
    });

    it('input.dictionary를 생략하면 payload.dictionary가 빈 배열이다', async () => {
      const llm = fakeLlm({ content: VALID_CONTENT, source: 'live' });

      await runToneTransform(
        { text: 'hi', languageDirection: 'ko-en', honorificLevel: null, referenceDate: '2026-08-05' },
        llm,
      );

      expect(llm.complete).toHaveBeenCalledWith(
        'c2',
        expect.any(String),
        expect.objectContaining({ dictionary: [] }),
      );
    });

    it('AC-047② — 응답의 unregisteredHonorifics를 결과에 그대로 반환한다(원문에 실제로 있는 경우)', async () => {
      const llm = fakeLlm({
        content: JSON.stringify({
          transformed: 'Hi Minho, could you take a look?',
          reason: 'x',
          preserved: [],
          misreadRisks: [],
          unregisteredHonorifics: ['Minho'],
        }),
        source: 'live',
      });

      const result = await runToneTransform(
        {
          text: 'Hi Minho, could you take a look?',
          languageDirection: 'en-ko',
          honorificLevel: null,
          referenceDate: '2026-08-05',
        },
        llm,
      );

      expect(result.unregisteredHonorifics).toEqual(['Minho']);
    });

    it('unregisteredHonorifics가 원문(input.text)에 실제로 없으면 그 항목을 제외한다(자기신고 불일치 교차 검증, reviewer Major 3과 동일 패턴)', async () => {
      const llm = fakeLlm({
        content: JSON.stringify({
          transformed: 'x',
          reason: 'y',
          preserved: [],
          misreadRisks: [],
          // 날조 — '박 과장님'은 원문 어디에도 없다.
          unregisteredHonorifics: ['박 과장님'],
        }),
        source: 'live',
      });

      const result = await runToneTransform(
        {
          text: 'Please loop in Alex.',
          languageDirection: 'en-ko',
          honorificLevel: null,
          referenceDate: '2026-08-05',
        },
        llm,
      );

      expect(result.unregisteredHonorifics).toEqual([]);
    });

    it('응답에 unregisteredHonorifics 필드가 아예 없으면(구 폴백 데이터 등) 빈 배열로 기본값 처리한다', async () => {
      const llm = fakeLlm({
        content: JSON.stringify({ transformed: 'x', reason: 'y', preserved: [], misreadRisks: [] }),
        source: 'live',
      });

      const result = await runToneTransform(
        { text: 'hi', languageDirection: 'ko-en', honorificLevel: null, referenceDate: '2026-08-05' },
        llm,
      );

      expect(result.unregisteredHonorifics).toEqual([]);
    });
  });
});
