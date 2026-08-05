/**
 * C1 긴급도 분류 스텝 — AC-003("CRITICAL/NORMAL/LOW + 판단 근거 문장") 단위 테스트.
 * `LLMClient`를 모킹한다(`docs/CodingRules.md` Tests "모킹 정책" — LLM은 모킹).
 * 구조(스키마 준수·폴백·에러 계약)만 검증한다 — 분류의 의미적 정확도는 `docs/TestCases.md`를
 * 쓰는 T11 러너의 몫이다(`docs/CodingRules.md` Tests "이 프로젝트에서의 적용" 표).
 */
import { describe, expect, it, vi } from 'vitest';
import type { LLMClient, LLMResponse } from '../llm/client';
import { LLMMalformedResponseError } from '../errors';
import { runUrgencyClassification } from './c1';

function fakeLlm(response: LLMResponse): LLMClient {
  return { complete: vi.fn().mockResolvedValue(response) };
}

describe('runUrgencyClassification', () => {
  it('LLM 응답의 urgency/reason/source를 그대로 반환한다(AC-003)', async () => {
    const llm = fakeLlm({
      content: JSON.stringify({
        urgency: 'CRITICAL',
        reason: '프로덕션 장애로 즉시 대응이 필요합니다.',
      }),
      source: 'live',
    });

    const result = await runUrgencyClassification({ text: '지금 프로덕션이 다운됐습니다' }, llm);

    expect(result).toEqual({
      urgency: 'CRITICAL',
      reason: '프로덕션 장애로 즉시 대응이 필요합니다.',
      source: 'live',
    });
  });

  it('step "c1"과 PROMPT_VERSION, payload를 그대로 LLMClient.complete()에 넘긴다', async () => {
    const llm = fakeLlm({
      content: JSON.stringify({ urgency: 'NORMAL', reason: '일반 업무 요청입니다.' }),
      source: 'live',
    });

    await runUrgencyClassification({ text: '확인 부탁드립니다' }, llm);

    expect(llm.complete).toHaveBeenCalledWith(
      'c1',
      expect.any(String),
      expect.objectContaining({ text: '확인 부탁드립니다' }),
    );
  });

  it('cache/fallback source도 그대로 전달한다(AC-041)', async () => {
    const llm = fakeLlm({
      content: JSON.stringify({ urgency: 'LOW', reason: '시간 압박이 없습니다.' }),
      source: 'fallback',
    });

    const result = await runUrgencyClassification({ text: '참고로 보내드립니다' }, llm);

    expect(result.source).toBe('fallback');
  });

  // 🔴 T16 — `FALLBACK_RESPONSES`가 채워지기 전에는 `fallbackLookup`을 생략해도 "폴백 없음"과
  // 같았다. 이제 기본값에 실 c1 데이터가 있으므로, 아래 3건은 "폴백조차 없을 때"의 던지기 경로를
  // 독립적으로 검증하려면 `fallbackLookup: () => undefined`로 명시적으로 꺼야 한다
  // (`c2.test.ts`의 동일 패턴 테스트가 이미 이렇게 해왔다).
  it('content가 유효한 JSON이 아니면 LLMMalformedResponseError를 던진다', async () => {
    const llm = fakeLlm({ content: '이것은 JSON이 아닙니다', source: 'live' });

    await expect(
      runUrgencyClassification({ text: 'hi' }, llm, { fallbackLookup: () => undefined }),
    ).rejects.toBeInstanceOf(LLMMalformedResponseError);
  });

  it('JSON이지만 urgency가 3단계 enum 밖의 값이면 LLMMalformedResponseError를 던진다', async () => {
    const llm = fakeLlm({
      content: JSON.stringify({ urgency: 'URGENT', reason: '근거' }),
      source: 'live',
    });

    await expect(
      runUrgencyClassification({ text: 'hi' }, llm, { fallbackLookup: () => undefined }),
    ).rejects.toBeInstanceOf(LLMMalformedResponseError);
  });

  it('reason이 빈 문자열이면 LLMMalformedResponseError를 던진다(없는 값을 지어내지 않는다)', async () => {
    const llm = fakeLlm({
      content: JSON.stringify({ urgency: 'NORMAL', reason: '' }),
      source: 'live',
    });

    await expect(
      runUrgencyClassification({ text: 'hi' }, llm, { fallbackLookup: () => undefined }),
    ).rejects.toBeInstanceOf(LLMMalformedResponseError);
  });

  it('step 레벨 스키마 검증 실패 시에도 폴백을 먼저 조회해 200 + source:fallback을 반환한다(docs/API.md:48, C4 Major 1과 동일 패턴)', async () => {
    const llm = fakeLlm({ content: JSON.stringify({ unexpected: 'field' }), source: 'live' });
    const fallbackLookup = vi.fn().mockReturnValue({
      step: 'c1',
      content: JSON.stringify({ urgency: 'NORMAL', reason: '폴백 근거' }),
    });

    const result = await runUrgencyClassification({ text: 'hi' }, llm, { fallbackLookup });

    expect(result).toEqual({ urgency: 'NORMAL', reason: '폴백 근거', source: 'fallback' });
    expect(fallbackLookup).toHaveBeenCalledWith('c1', expect.any(String));
  });

  it('폴백 조회 결과도 없으면 LLMMalformedResponseError를 던진다', async () => {
    const llm = fakeLlm({ content: '이것은 JSON이 아닙니다', source: 'live' });
    const fallbackLookup = vi.fn().mockReturnValue(undefined);

    await expect(
      runUrgencyClassification({ text: 'hi' }, llm, { fallbackLookup }),
    ).rejects.toBeInstanceOf(LLMMalformedResponseError);
    expect(fallbackLookup).toHaveBeenCalled();
  });

  // T16(AC-041) — `fallbackLookup`을 주입하지 않으면 기본값(`../data/fallback-responses`의
  // 실제 `FALLBACK_RESPONSES`)이 쓰인다. 위 테스트 중 폴백 경로를 타는 것들(65~116행, 스키마
  // 검증 실패·malformed 케이스)은 전부 가짜 fallbackLookup을 주입했으므로(처음 세 테스트는 폴백
  // 경로 자체를 타지 않는다 — live 응답이 스키마를 통과해 곧바로 반환된다) T16이 채운 실 데이터가
  // 실제로 이 스텝의 스키마를 통과하는지는 이 테스트가 처음 증명한다.
  it('T16 — fallbackLookup 미주입 시 실 FALLBACK_RESPONSES의 c1 기본값으로 정상 폴백한다', async () => {
    const llm = fakeLlm({ content: '이것은 JSON이 아닙니다', source: 'live' });

    const result = await runUrgencyClassification({ text: '아무 원문' }, llm);

    expect(result.source).toBe('fallback');
    expect(['CRITICAL', 'NORMAL', 'LOW']).toContain(result.urgency);
    expect(result.reason.length).toBeGreaterThan(0);
  });
});
