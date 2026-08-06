/**
 * C6 하소연 → 태스크 티켓 변환 스텝 — AC-017/018/050/058/062/064 단위 테스트.
 * `LLMClient`를 모킹한다(`docs/CodingRules.md` Tests "모킹 정책" — LLM은 모킹).
 * 구조(스키마 준수·폴백·에러 계약)와 `assessEmotionalSignal`의 `docs/TestCases.md` T-E01~T-E04
 * 기대값을 검증한다.
 */
import { describe, expect, it, vi } from 'vitest';
import type { LLMClient, LLMResponse } from '../llm/client';
import { LLMMalformedResponseError } from '../errors';
import { assessEmotionalSignal, runTicketConversion } from './c6';

function fakeLlm(response: LLMResponse): LLMClient {
  return { complete: vi.fn().mockResolvedValue(response) };
}

describe('runTicketConversion', () => {
  it('AC-017/018/050/064① — LLM 응답의 4섹션·decisionAuthority·evidence·source를 그대로 반환한다', async () => {
    const llm = fakeLlm({
      content: JSON.stringify({
        sections: {
          problem: '배포가 반복해서 지연되고 있습니다.',
          impact: '다운스트림 팀 일정에도 영향을 줍니다.',
          request: '재발 방지책과 새 일정 공유를 요청합니다.',
          concernLevel: '작성자가 반복된 지연에 강한 답답함을 표현하고 있습니다.',
        },
        decisionAuthority: '내부 승인 필요',
        decisionAuthorityEvidence: '"팀장 승인 후 진행하겠습니다"라는 문장이 있습니다.',
      }),
      source: 'live',
    });

    const result = await runTicketConversion({ text: '이거 왜 자꾸 늦어지는 거예요?' }, llm);

    expect(result).toEqual({
      sections: {
        problem: '배포가 반복해서 지연되고 있습니다.',
        impact: '다운스트림 팀 일정에도 영향을 줍니다.',
        request: '재발 방지책과 새 일정 공유를 요청합니다.',
        concernLevel: '작성자가 반복된 지연에 강한 답답함을 표현하고 있습니다.',
      },
      source: 'live',
      decisionAuthority: '내부 승인 필요',
      decisionAuthorityEvidence: '"팀장 승인 후 진행하겠습니다"라는 문장이 있습니다.',
    });
  });

  it('step "c6"과 PROMPT_VERSION, payload를 그대로 LLMClient.complete()에 넘긴다', async () => {
    const llm = fakeLlm({
      content: JSON.stringify({
        sections: { problem: '없음', impact: '없음', request: '없음', concernLevel: '없음' },
        decisionAuthority: '불명',
        decisionAuthorityEvidence: null,
      }),
      source: 'live',
    });

    await runTicketConversion({ text: '확인 부탁드립니다' }, llm);

    expect(llm.complete).toHaveBeenCalledWith(
      'c6',
      expect.any(String),
      expect.objectContaining({ text: '확인 부탁드립니다' }),
    );
  });

  // AC-062 — 4개 섹션은 근거 유무와 무관하게 항상 존재하고, 근거가 없는 섹션은 "없음"으로
  // 명시된다(빈 문자열·생략 금지). 이 테스트는 "없음" 문자열이 실제로 정상 값으로 통과함을 확인한다.
  it('AC-062 — 일부 섹션에 근거가 없으면 "없음" 문자열 그대로 통과시킨다(섹션을 생략/공백화하지 않는다)', async () => {
    const llm = fakeLlm({
      content: JSON.stringify({
        sections: {
          problem: '확인을 요청하는 메시지입니다.',
          impact: '없음',
          request: '확인 부탁드립니다.',
          concernLevel: '없음',
        },
        decisionAuthority: '불명',
        decisionAuthorityEvidence: null,
      }),
      source: 'live',
    });

    const result = await runTicketConversion({ text: '확인 부탁드립니다' }, llm);

    expect(result.sections.impact).toBe('없음');
    expect(result.sections.concernLevel).toBe('없음');
    expect(Object.keys(result.sections)).toEqual(['problem', 'impact', 'request', 'concernLevel']);
  });

  // AC-050①/AC-064⑤ — 근거 없이 판정값(예: '확정')이 오면 resolveAuthority()가 '불명'으로
  // 되돌린다(임의 판정을 지어내지 않는다). LLM이 계약을 어겨도 이 스텝이 불변식을 강제한다.
  it("AC-050①/AC-064⑤ — LLM이 근거(evidence) 없이 판정값을 보내면 resolveAuthority()가 '불명'으로 되돌린다", async () => {
    const llm = fakeLlm({
      content: JSON.stringify({
        sections: { problem: '없음', impact: '없음', request: '없음', concernLevel: '없음' },
        decisionAuthority: '확정',
        decisionAuthorityEvidence: null,
      }),
      source: 'live',
    });

    const result = await runTicketConversion({ text: 'hi' }, llm);

    expect(result.decisionAuthority).toBe('불명');
    expect(result.decisionAuthorityEvidence).toBeNull();
  });

  it('cache/fallback source도 그대로 전달한다(AC-041)', async () => {
    const llm = fakeLlm({
      content: JSON.stringify({
        sections: { problem: '없음', impact: '없음', request: '없음', concernLevel: '없음' },
        decisionAuthority: '불명',
        decisionAuthorityEvidence: null,
      }),
      source: 'cache',
    });

    const result = await runTicketConversion({ text: 'hi' }, llm);

    expect(result.source).toBe('cache');
  });

  it('content가 유효한 JSON이 아니면 (폴백도 없으면) LLMMalformedResponseError를 던진다', async () => {
    const llm = fakeLlm({ content: '이것은 JSON이 아닙니다', source: 'live' });

    await expect(
      runTicketConversion({ text: 'hi' }, llm, { fallbackLookup: () => undefined }),
    ).rejects.toBeInstanceOf(LLMMalformedResponseError);
  });

  it('sections 중 하나라도 빈 문자열이면 (폴백도 없으면) LLMMalformedResponseError를 던진다', async () => {
    const llm = fakeLlm({
      content: JSON.stringify({
        sections: { problem: '', impact: '없음', request: '없음', concernLevel: '없음' },
        decisionAuthority: '불명',
        decisionAuthorityEvidence: null,
      }),
      source: 'live',
    });

    await expect(
      runTicketConversion({ text: 'hi' }, llm, { fallbackLookup: () => undefined }),
    ).rejects.toBeInstanceOf(LLMMalformedResponseError);
  });

  it('decisionAuthority가 4값 enum 밖이면 (폴백도 없으면) LLMMalformedResponseError를 던진다', async () => {
    const llm = fakeLlm({
      content: JSON.stringify({
        sections: { problem: '없음', impact: '없음', request: '없음', concernLevel: '없음' },
        decisionAuthority: 'DECIDED',
        decisionAuthorityEvidence: null,
      }),
      source: 'live',
    });

    await expect(
      runTicketConversion({ text: 'hi' }, llm, { fallbackLookup: () => undefined }),
    ).rejects.toBeInstanceOf(LLMMalformedResponseError);
  });

  it('step 레벨 스키마 검증 실패 시에도 폴백을 먼저 조회해 200 + source:fallback을 반환한다(docs/API.md:48)', async () => {
    const llm = fakeLlm({ content: JSON.stringify({ unexpected: 'field' }), source: 'live' });
    const fallbackLookup = vi.fn().mockReturnValue({
      step: 'c6',
      content: JSON.stringify({
        sections: { problem: '폴백', impact: '폴백', request: '폴백', concernLevel: '폴백' },
        decisionAuthority: '불명',
        decisionAuthorityEvidence: null,
      }),
    });

    const result = await runTicketConversion({ text: 'hi' }, llm, { fallbackLookup });

    expect(result.source).toBe('fallback');
    expect(fallbackLookup).toHaveBeenCalledWith('c6', expect.any(String));
  });

  it('폴백 조회 결과도 없으면 LLMMalformedResponseError를 던진다', async () => {
    const llm = fakeLlm({ content: '이것은 JSON이 아닙니다', source: 'live' });
    const fallbackLookup = vi.fn().mockReturnValue(undefined);

    await expect(
      runTicketConversion({ text: 'hi' }, llm, { fallbackLookup }),
    ).rejects.toBeInstanceOf(LLMMalformedResponseError);
    expect(fallbackLookup).toHaveBeenCalled();
  });

  it('fallbackLookup 미주입 시 실 FALLBACK_RESPONSES의 c6 기본값으로 정상 폴백한다', async () => {
    const llm = fakeLlm({ content: '이것은 JSON이 아닙니다', source: 'live' });

    const result = await runTicketConversion({ text: '아무 원문' }, llm);

    expect(result.source).toBe('fallback');
    expect(Object.keys(result.sections)).toEqual(['problem', 'impact', 'request', 'concernLevel']);
    expect(result.decisionAuthority).toBe('불명');
    expect(result.decisionAuthorityEvidence).toBeNull();
  });
});

// AC-058 — `docs/TestCases.md` 표 B의 T-E 그룹을 그대로 기대값으로 쓴다
// (`docs/adr/0005-c6-ticket-gate-field.md` Follow-up #4 "케이스를 새로 만들지 않는다").
describe('assessEmotionalSignal (AC-058)', () => {
  it('T-E01 — "이거 왜 자꾸 늦어지는 거예요? 답답하네요" → signal_present(감정형)', () => {
    expect(assessEmotionalSignal('이거 왜 자꾸 늦어지는 거예요? 답답하네요')).toBe('signal_present');
  });

  it('T-E02 — "이건 명백히 그쪽 실수입니다" → signal_present(감정형)', () => {
    expect(assessEmotionalSignal('이건 명백히 그쪽 실수입니다')).toBe('signal_present');
  });

  it('T-E03 — "확인 부탁드립니다" → signal_absent(대조군, 오탐 방지 핵심 케이스)', () => {
    expect(assessEmotionalSignal('확인 부탁드립니다')).toBe('signal_absent');
  });

  it('T-E04 — "저번에도 이러셨는데 또 이러시네요" → signal_present(감정형)', () => {
    expect(assessEmotionalSignal('저번에도 이러셨는데 또 이러시네요')).toBe('signal_present');
  });

  it('공백뿐인 입력은 undetermined(fail-closed, 판정 근거 자체가 없다)', () => {
    expect(assessEmotionalSignal('   ')).toBe('undetermined');
  });

  it('"항상 제시"가 아님을 증명한다 — 대조군과 감정형이 같은 값으로 뭉개지지 않는다(AC-058)', () => {
    const control = assessEmotionalSignal('확인 부탁드립니다');
    const emotional = assessEmotionalSignal('이건 명백히 그쪽 실수입니다');
    expect(control).not.toBe(emotional);
  });
});
