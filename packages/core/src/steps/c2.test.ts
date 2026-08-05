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
import { DEFAULT_HONORIFIC_LEVEL } from '../prompts/c2';
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
      { text: '금요일까지 부탁드립니다', languageDirection: 'ko-en', honorificLevel: null },
      llm,
    );

    expect(result).toEqual({
      transformed: 'Please confirm by Friday.',
      reason: '완곡한 요청을 명시적 기한과 액션 요청으로 복원했습니다.',
      preserved: [{ kind: 'deadline', sourceText: '금요일까지', transformedText: 'by Friday' }],
      misreadRisks: [],
      source: 'live',
    });
  });

  it('step "c2"와 PROMPT_VERSION, payload(text/languageDirection)를 그대로 LLMClient.complete()에 넘긴다', async () => {
    const llm = fakeLlm({ content: VALID_CONTENT, source: 'live' });

    await runToneTransform(
      { text: 'hello', languageDirection: 'en-ko', honorificLevel: 'hapsyo' },
      llm,
    );

    expect(llm.complete).toHaveBeenCalledWith(
      'c2',
      expect.any(String),
      expect.objectContaining({ text: 'hello', languageDirection: 'en-ko' }),
    );
  });

  it('honorificLevel이 null이면 DEFAULT_HONORIFIC_LEVEL로 채워 payload에 싣는다(AC-046②, 규약 축 부재 시 규칙 기본값)', async () => {
    const llm = fakeLlm({ content: VALID_CONTENT, source: 'live' });

    await runToneTransform({ text: 'hi', languageDirection: 'en-ko', honorificLevel: null }, llm);

    expect(llm.complete).toHaveBeenCalledWith(
      'c2',
      expect.any(String),
      expect.objectContaining({ honorificLevel: DEFAULT_HONORIFIC_LEVEL }),
    );
  });

  it('honorificLevel이 명시되면 그 값을 그대로 payload에 싣는다', async () => {
    const llm = fakeLlm({ content: VALID_CONTENT, source: 'live' });

    await runToneTransform(
      { text: 'hi', languageDirection: 'en-ko', honorificLevel: 'hapsyo' },
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
      { text: 'hi', languageDirection: 'ko-en', honorificLevel: null },
      llm,
    );

    expect(result.source).toBe('fallback');
  });

  it('content가 유효한 JSON이 아니고 폴백도 없으면 LLMMalformedResponseError를 던진다', async () => {
    const llm = fakeLlm({ content: '이것은 JSON이 아닙니다', source: 'live' });

    await expect(
      runToneTransform({ text: 'hi', languageDirection: 'ko-en', honorificLevel: null }, llm, {
        fallbackLookup: () => undefined,
      }),
    ).rejects.toBeInstanceOf(LLMMalformedResponseError);
  });

  it('transformed가 빈 문자열이면 LLMMalformedResponseError를 던진다(없는 값을 지어내지 않는다)', async () => {
    const llm = fakeLlm({
      content: JSON.stringify({ transformed: '', reason: 'x', preserved: [], misreadRisks: [] }),
      source: 'live',
    });

    await expect(
      runToneTransform({ text: 'hi', languageDirection: 'ko-en', honorificLevel: null }, llm, {
        fallbackLookup: () => undefined,
      }),
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
      runToneTransform({ text: 'hi', languageDirection: 'ko-en', honorificLevel: null }, llm, {
        fallbackLookup: () => undefined,
      }),
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
      runToneTransform({ text: 'hi', languageDirection: 'ko-en', honorificLevel: null }, llm, {
        fallbackLookup: () => undefined,
      }),
    ).rejects.toBeInstanceOf(LLMMalformedResponseError);
  });

  it('preserved/misreadRisks가 빈 배열인 응답도 정상 반환한다(둘 다 유효한 값)', async () => {
    const llm = fakeLlm({
      content: JSON.stringify({ transformed: 'x', reason: 'y', preserved: [], misreadRisks: [] }),
      source: 'live',
    });

    const result = await runToneTransform(
      { text: 'hi', languageDirection: 'ko-en', honorificLevel: null },
      llm,
    );

    expect(result.preserved).toEqual([]);
    expect(result.misreadRisks).toEqual([]);
  });

  it('step 레벨 스키마 검증 실패 시에도 폴백을 먼저 조회해 200 + source:fallback을 반환한다(docs/API.md:48, c1/c4 Major 1과 동일 패턴)', async () => {
    const llm = fakeLlm({ content: JSON.stringify({ unexpected: 'field' }), source: 'live' });
    const fallbackLookup = vi.fn().mockReturnValue({ step: 'c2', content: VALID_CONTENT });

    const result = await runToneTransform(
      { text: 'hi', languageDirection: 'ko-en', honorificLevel: null },
      llm,
      { fallbackLookup },
    );

    expect(result).toEqual({
      transformed: 'Please confirm by Friday.',
      reason: '완곡한 요청을 명시적 기한과 액션 요청으로 복원했습니다.',
      preserved: [{ kind: 'deadline', sourceText: '금요일까지', transformedText: 'by Friday' }],
      misreadRisks: [],
      source: 'fallback',
    });
    expect(fallbackLookup).toHaveBeenCalledWith('c2', expect.any(String));
  });

  it('폴백 조회 결과도 없으면 LLMMalformedResponseError를 던진다', async () => {
    const llm = fakeLlm({ content: '이것은 JSON이 아닙니다', source: 'live' });
    const fallbackLookup = vi.fn().mockReturnValue(undefined);

    await expect(
      runToneTransform({ text: 'hi', languageDirection: 'ko-en', honorificLevel: null }, llm, {
        fallbackLookup,
      }),
    ).rejects.toBeInstanceOf(LLMMalformedResponseError);
    expect(fallbackLookup).toHaveBeenCalled();
  });
});
