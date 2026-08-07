/**
 * C7 결정사항 자동 요약 스텝 — AC-019/020/038/050/064② 단위 테스트.
 * `LLMClient`를 모킹한다(`docs/CodingRules.md` Tests "모킹 정책" — LLM은 모킹).
 * `steps/c6.test.ts`와 같은 구조(스키마 준수·폴백·에러 계약)를 따르되, 필드 이름은
 * `authorityStatus`/`authorityEvidence`(행별, AC-064③)이고 unresolved[] 파생(AC-038)이 추가된다.
 */
import { describe, expect, it, vi } from 'vitest';
import type { LLMClient, LLMResponse } from '../llm/client';
import { LLMMalformedResponseError } from '../errors';
import { runDecisionSummary } from './c7';

function fakeLlm(response: LLMResponse): LLMClient {
  return { complete: vi.fn().mockResolvedValue(response) };
}

describe('runDecisionSummary', () => {
  it('AC-019/020 — 담당자·기한이 모두 있는 결정 항목을 그대로 반환한다(행별 authorityStatus)', async () => {
    const llm = fakeLlm({
      content: JSON.stringify({
        decisions: [
          {
            decision: '신규 배포는 매주 화요일에 진행한다.',
            owner: '김철수',
            dueDate: '2026-08-11',
            authorityStatus: '확정',
            authorityEvidence: '"이건 이미 확정된 사항입니다"라는 문장이 있습니다.',
          },
        ],
      }),
      source: 'live',
    });

    const result = await runDecisionSummary({ threadText: '스레드 원문' }, llm);

    expect(result).toEqual({
      decisions: [
        {
          decision: '신규 배포는 매주 화요일에 진행한다.',
          owner: '김철수',
          dueDate: '2026-08-11',
          authorityStatus: '확정',
          authorityEvidence: '"이건 이미 확정된 사항입니다"라는 문장이 있습니다.',
        },
      ],
      unresolved: [],
      source: 'live',
    });
  });

  it('AC-020 — 담당자·기한 근거가 없으면 null 그대로 통과시킨다(임의 생성 금지)', async () => {
    const llm = fakeLlm({
      content: JSON.stringify({
        decisions: [
          {
            decision: '다음 회의 일정은 추후 공지한다.',
            owner: null,
            dueDate: null,
            authorityStatus: '불명',
            authorityEvidence: null,
          },
        ],
      }),
      source: 'live',
    });

    const result = await runDecisionSummary({ threadText: '스레드 원문' }, llm);

    expect(result.decisions[0].owner).toBeNull();
    expect(result.decisions[0].dueDate).toBeNull();
  });

  it('빈 스레드/결정 없음은 유효한 결과다 — decisions: []는 오류가 아니다', async () => {
    const llm = fakeLlm({ content: JSON.stringify({ decisions: [] }), source: 'live' });

    const result = await runDecisionSummary({ threadText: '안녕하세요' }, llm);

    expect(result).toEqual({ decisions: [], unresolved: [], source: 'live' });
  });

  it('AC-038 — 담당자만 비어 있으면 missingFields: ["owner"]로 표시된다', async () => {
    const llm = fakeLlm({
      content: JSON.stringify({
        decisions: [
          {
            decision: 'API 키 회전 작업을 진행한다.',
            owner: null,
            dueDate: '2026-08-20',
            authorityStatus: '불명',
            authorityEvidence: null,
          },
        ],
      }),
      source: 'live',
    });

    const result = await runDecisionSummary({ threadText: '스레드 원문' }, llm);

    expect(result.unresolved).toEqual([
      { decision: 'API 키 회전 작업을 진행한다.', missingFields: ['owner'] },
    ]);
  });

  it('AC-038 — 기한만 비어 있으면 missingFields: ["dueDate"]로 표시된다', async () => {
    const llm = fakeLlm({
      content: JSON.stringify({
        decisions: [
          {
            decision: '문서 번역은 박영희가 담당한다.',
            owner: '박영희',
            dueDate: null,
            authorityStatus: '불명',
            authorityEvidence: null,
          },
        ],
      }),
      source: 'live',
    });

    const result = await runDecisionSummary({ threadText: '스레드 원문' }, llm);

    expect(result.unresolved).toEqual([
      { decision: '문서 번역은 박영희가 담당한다.', missingFields: ['dueDate'] },
    ]);
  });

  it('AC-038 — 담당자·기한이 둘 다 비어 있으면 missingFields에 둘 다 담긴다', async () => {
    const llm = fakeLlm({
      content: JSON.stringify({
        decisions: [
          {
            decision: '예산안은 추후 논의한다.',
            owner: null,
            dueDate: null,
            authorityStatus: '불명',
            authorityEvidence: null,
          },
        ],
      }),
      source: 'live',
    });

    const result = await runDecisionSummary({ threadText: '스레드 원문' }, llm);

    expect(result.unresolved).toEqual([
      { decision: '예산안은 추후 논의한다.', missingFields: ['owner', 'dueDate'] },
    ]);
  });

  it('AC-038 — 담당자·기한이 모두 있으면 unresolved에 포함되지 않는다', async () => {
    const llm = fakeLlm({
      content: JSON.stringify({
        decisions: [
          {
            decision: '신규 배포는 매주 화요일에 진행한다.',
            owner: '김철수',
            dueDate: '2026-08-11',
            authorityStatus: '확정',
            authorityEvidence: '"확정된 사항입니다"라는 문장이 있습니다.',
          },
        ],
      }),
      source: 'live',
    });

    const result = await runDecisionSummary({ threadText: '스레드 원문' }, llm);

    expect(result.unresolved).toEqual([]);
  });

  it.each([
    ['확정', '"이건 이미 확정된 사항입니다"라는 문장이 있습니다.'],
    ['내부 승인 필요', '"팀장 승인 후 진행하겠습니다"라는 문장이 있습니다.'],
    ['검토 중', '"아직 검토 중입니다"라는 문장이 있습니다.'],
  ])('AC-050/064② — authorityStatus 판정값 "%s"를 근거와 함께 그대로 반환한다', async (status, evidence) => {
    const llm = fakeLlm({
      content: JSON.stringify({
        decisions: [
          { decision: '결정 내용', owner: null, dueDate: null, authorityStatus: status, authorityEvidence: evidence },
        ],
      }),
      source: 'live',
    });

    const result = await runDecisionSummary({ threadText: 'x' }, llm);

    expect(result.decisions[0].authorityStatus).toBe(status);
    expect(result.decisions[0].authorityEvidence).toBe(evidence);
  });

  it('AC-050①/AC-064⑤ — 근거 없이 판정값(예: "확정")이 오면 resolveAuthority()가 "불명"으로 되돌린다', async () => {
    const llm = fakeLlm({
      content: JSON.stringify({
        decisions: [
          { decision: '결정 내용', owner: null, dueDate: null, authorityStatus: '확정', authorityEvidence: null },
        ],
      }),
      source: 'live',
    });

    const result = await runDecisionSummary({ threadText: 'x' }, llm);

    expect(result.decisions[0].authorityStatus).toBe('불명');
    expect(result.decisions[0].authorityEvidence).toBeNull();
  });

  it('step "c7"과 PROMPT_VERSION, payload를 그대로 LLMClient.complete()에 넘긴다', async () => {
    const llm = fakeLlm({ content: JSON.stringify({ decisions: [] }), source: 'live' });

    await runDecisionSummary({ threadText: '확인 부탁드립니다' }, llm);

    expect(llm.complete).toHaveBeenCalledWith(
      'c7',
      expect.any(String),
      expect.objectContaining({ text: '확인 부탁드립니다' }),
    );
  });

  it('cache/fallback source도 그대로 전달한다(AC-041)', async () => {
    const llm = fakeLlm({ content: JSON.stringify({ decisions: [] }), source: 'cache' });

    const result = await runDecisionSummary({ threadText: 'hi' }, llm);

    expect(result.source).toBe('cache');
  });

  it('content가 유효한 JSON이 아니면 (폴백도 없으면) LLMMalformedResponseError를 던진다', async () => {
    const llm = fakeLlm({ content: '이것은 JSON이 아닙니다', source: 'live' });

    await expect(
      runDecisionSummary({ threadText: 'hi' }, llm, { fallbackLookup: () => undefined }),
    ).rejects.toBeInstanceOf(LLMMalformedResponseError);
  });

  it('decision 항목이 스키마를 만족하지 않으면 (폴백도 없으면) LLMMalformedResponseError를 던진다', async () => {
    const llm = fakeLlm({
      content: JSON.stringify({ decisions: [{ decision: '', owner: null, dueDate: null }] }),
      source: 'live',
    });

    await expect(
      runDecisionSummary({ threadText: 'hi' }, llm, { fallbackLookup: () => undefined }),
    ).rejects.toBeInstanceOf(LLMMalformedResponseError);
  });

  it('authorityStatus가 4값 enum 밖이면 (폴백도 없으면) LLMMalformedResponseError를 던진다', async () => {
    const llm = fakeLlm({
      content: JSON.stringify({
        decisions: [
          { decision: '결정', owner: null, dueDate: null, authorityStatus: 'DECIDED', authorityEvidence: null },
        ],
      }),
      source: 'live',
    });

    await expect(
      runDecisionSummary({ threadText: 'hi' }, llm, { fallbackLookup: () => undefined }),
    ).rejects.toBeInstanceOf(LLMMalformedResponseError);
  });

  it('step 레벨 스키마 검증 실패 시에도 폴백을 먼저 조회해 200 + source:fallback을 반환한다(docs/API.md:48)', async () => {
    const llm = fakeLlm({ content: JSON.stringify({ unexpected: 'field' }), source: 'live' });
    const fallbackLookup = vi.fn().mockReturnValue({
      step: 'c7',
      content: JSON.stringify({ decisions: [] }),
    });

    const result = await runDecisionSummary({ threadText: 'hi' }, llm, { fallbackLookup });

    expect(result.source).toBe('fallback');
    expect(fallbackLookup).toHaveBeenCalledWith('c7', expect.any(String));
  });

  it('폴백 조회 결과도 없으면 LLMMalformedResponseError를 던진다', async () => {
    const llm = fakeLlm({ content: '이것은 JSON이 아닙니다', source: 'live' });
    const fallbackLookup = vi.fn().mockReturnValue(undefined);

    await expect(
      runDecisionSummary({ threadText: 'hi' }, llm, { fallbackLookup }),
    ).rejects.toBeInstanceOf(LLMMalformedResponseError);
    expect(fallbackLookup).toHaveBeenCalled();
  });

  it('fallbackLookup 미주입 시 실 FALLBACK_RESPONSES의 c7 기본값으로 정상 폴백한다', async () => {
    const llm = fakeLlm({ content: '이것은 JSON이 아닙니다', source: 'live' });

    const result = await runDecisionSummary({ threadText: '아무 원문' }, llm);

    expect(result.source).toBe('fallback');
    expect(result.decisions).toEqual([]);
    expect(result.unresolved).toEqual([]);
  });
});
