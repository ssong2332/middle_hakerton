/**
 * C4 역번역 스텝 — AC-001("변환문을 원어로 역번역한 결과") 단위 테스트.
 * `LLMClient`를 모킹한다(`docs/CodingRules.md` Tests "모킹 정책" — LLM은 모킹).
 */
import { describe, expect, it, vi } from 'vitest';
import type { LLMClient, LLMResponse } from '../llm/client';
import { LLMMalformedResponseError } from '../errors';
import { runBackTranslation } from './c4';

function fakeLlm(response: LLMResponse): LLMClient {
  return { complete: vi.fn().mockResolvedValue(response) };
}

describe('runBackTranslation', () => {
  it('LLM 응답의 backTranslation과 source를 그대로 반환한다(AC-001)', async () => {
    const llm = fakeLlm({
      content: JSON.stringify({ backTranslation: 'Please confirm by tomorrow.' }),
      source: 'live',
    });

    const result = await runBackTranslation(
      { text: '내일까지 확인 부탁드립니다.', targetLanguage: 'en' },
      llm,
    );

    expect(result).toEqual({ backTranslation: 'Please confirm by tomorrow.', source: 'live' });
  });

  it('step "c4"와 PROMPT_VERSION, payload를 그대로 LLMClient.complete()에 넘긴다', async () => {
    const llm = fakeLlm({ content: JSON.stringify({ backTranslation: 'x' }), source: 'live' });

    await runBackTranslation({ text: 'hello', targetLanguage: 'ko' }, llm);

    expect(llm.complete).toHaveBeenCalledWith(
      'c4',
      expect.any(String),
      expect.objectContaining({ text: 'hello', targetLanguage: 'ko' }),
    );
  });

  it('cache/fallback source도 그대로 전달한다(AC-041)', async () => {
    const llm = fakeLlm({
      content: JSON.stringify({ backTranslation: '폴백 역번역문' }),
      source: 'fallback',
    });

    const result = await runBackTranslation({ text: 'hi', targetLanguage: 'ko' }, llm);

    expect(result.source).toBe('fallback');
  });

  it('content가 유효한 JSON이 아니면 LLMMalformedResponseError를 던진다', async () => {
    const llm = fakeLlm({ content: '이것은 JSON이 아닙니다', source: 'live' });

    await expect(
      runBackTranslation({ text: 'hi', targetLanguage: 'ko' }, llm),
    ).rejects.toBeInstanceOf(LLMMalformedResponseError);
  });

  it('JSON이지만 backTranslation 필드가 없으면 LLMMalformedResponseError를 던진다', async () => {
    const llm = fakeLlm({ content: JSON.stringify({ unexpected: 'field' }), source: 'live' });

    await expect(
      runBackTranslation({ text: 'hi', targetLanguage: 'ko' }, llm),
    ).rejects.toBeInstanceOf(LLMMalformedResponseError);
  });

  it('backTranslation이 빈 문자열이면 LLMMalformedResponseError를 던진다(없는 값을 지어내지 않는다)', async () => {
    const llm = fakeLlm({ content: JSON.stringify({ backTranslation: '' }), source: 'live' });

    await expect(
      runBackTranslation({ text: 'hi', targetLanguage: 'ko' }, llm),
    ).rejects.toBeInstanceOf(LLMMalformedResponseError);
  });

  it('Major 1 — step 레벨 스키마 검증 실패 시에도 폴백을 먼저 조회해 200 + source:fallback을 반환한다(docs/API.md:48)', async () => {
    const llm = fakeLlm({ content: JSON.stringify({ unexpected: 'field' }), source: 'live' });
    const fallbackLookup = vi.fn().mockReturnValue({
      step: 'c4',
      content: JSON.stringify({ backTranslation: '폴백 역번역문' }),
    });

    const result = await runBackTranslation({ text: 'hi', targetLanguage: 'ko' }, llm, {
      fallbackLookup,
    });

    expect(result).toEqual({ backTranslation: '폴백 역번역문', source: 'fallback' });
    expect(fallbackLookup).toHaveBeenCalledWith('c4', expect.any(String));
  });

  it('Major 1 — 폴백 조회 결과도 없으면 기존과 동일하게 LLMMalformedResponseError를 던진다', async () => {
    const llm = fakeLlm({ content: '이것은 JSON이 아닙니다', source: 'live' });
    const fallbackLookup = vi.fn().mockReturnValue(undefined);

    await expect(
      runBackTranslation({ text: 'hi', targetLanguage: 'ko' }, llm, { fallbackLookup }),
    ).rejects.toBeInstanceOf(LLMMalformedResponseError);
    expect(fallbackLookup).toHaveBeenCalled();
  });
});
