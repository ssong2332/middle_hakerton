import { describe, expect, it, vi } from 'vitest';
import { runStyleSuggestion } from './suggest';
import type { LLMClient, LLMResponse } from '../llm/client';
import { LLMMalformedResponseError } from '../errors';

function fakeLlm(response: LLMResponse): LLMClient {
  return { complete: vi.fn().mockResolvedValue(response) };
}

describe('runStyleSuggestion — AC-073, T68', () => {
  it('LLM 응답을 이모지 축 제안 1건으로 변환한다', async () => {
    const llm = fakeLlm({
      content: JSON.stringify({ emojiPolicy: 'ok', rationale: '이모지를 평균 0.5개 사용했습니다.' }),
      source: 'live',
    });

    const result = await runStyleSuggestion({ emojiFrequency: 0.5, sampleCount: 12 }, llm);

    expect(result).toEqual({
      suggestions: [
        {
          axis: 'emojiPolicy',
          value: 'ok',
          evidence: { indicatorKey: 'emojiFrequency', observedValue: 0.5 },
          evidenceCount: 12,
        },
      ],
      source: 'live',
    });
  });

  it('제안 축은 emojiPolicy 1개뿐이다(AC-073②, 5번째 축을 만들지 않는다 — 여기선 아예 1개만)', async () => {
    const llm = fakeLlm({
      content: JSON.stringify({ emojiPolicy: 'avoid', rationale: '이모지 사용이 관측되지 않았습니다.' }),
      source: 'live',
    });

    const result = await runStyleSuggestion({ emojiFrequency: 0, sampleCount: 5 }, llm);

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].axis).toBe('emojiPolicy');
  });

  it('AC-073③ — 근거(evidence) 없는 제안 항목은 만들지 않는다(제안 항목엔 항상 evidence가 있다)', async () => {
    const llm = fakeLlm({
      content: JSON.stringify({ emojiPolicy: 'ok', rationale: 'x' }),
      source: 'live',
    });

    const result = await runStyleSuggestion({ emojiFrequency: 1.2, sampleCount: 20 }, llm);

    for (const suggestion of result.suggestions) {
      expect(suggestion.evidence).toBeDefined();
      expect(suggestion.evidence.indicatorKey).toBe('emojiFrequency');
    }
  });

  it('폴백이면 근거 없는 값을 지어내지 않고 suggestions를 비운다', async () => {
    const llm = fakeLlm({ content: 'not valid json', source: 'live' });

    const result = await runStyleSuggestion({ emojiFrequency: 0.5, sampleCount: 12 }, llm);

    expect(result).toEqual({ suggestions: [], source: 'fallback' });
  });

  it('응답이 스키마 검증에 실패하고(deps로 폴백 없음을 강제) 폴백도 없으면 에러를 던진다', async () => {
    const llm = fakeLlm({ content: 'not valid json', source: 'live' });

    await expect(
      runStyleSuggestion({ emojiFrequency: 0.5, sampleCount: 12 }, llm, {
        fallbackLookup: () => undefined,
      }),
    ).rejects.toThrow(LLMMalformedResponseError);
  });

  it('emojiPolicy가 ok/avoid 외의 값이면 스키마 검증 실패로 처리한다(폴백 경로)', async () => {
    const llm = fakeLlm({
      content: JSON.stringify({ emojiPolicy: 'maybe', rationale: 'x' }),
      source: 'live',
    });

    const result = await runStyleSuggestion({ emojiFrequency: 0.5, sampleCount: 12 }, llm);

    expect(result.source).toBe('fallback');
  });
});
