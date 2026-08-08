/**
 * `POST /api/summary` — T26 범위(`docs/API.md` "POST /api/summary", UX-008/UF-005).
 * `resolveSession()`과 OpenAI 호출(`createOpenAiLLMClient`)은 모킹한다 — 이 라우트가
 * `runDecisionSummary`(core)에 배선하는 것만 본다. `apps/web/app/api/ticket/route.test.ts`와
 * 동일한 패턴.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/auth', () => ({
  resolveSession: vi.fn(),
}));
vi.mock('../../../lib/llm/openai', () => ({
  createOpenAiLLMClient: vi.fn(),
}));
vi.mock('../../../lib/llm/create-client', () => ({
  createLLMClient: vi.fn(),
}));

import { resolveSession } from '../../../lib/auth';
import { createOpenAiLLMClient } from '../../../lib/llm/openai';
import { createLLMClient } from '../../../lib/llm/create-client';
import { POST } from './route';

const mockResolveSession = vi.mocked(resolveSession);
const mockCreateOpenAiClient = vi.mocked(createOpenAiLLMClient);
const mockCreateLLMClient = vi.mocked(createLLMClient);

function mockCreateClient(llm: ReturnType<typeof createOpenAiLLMClient>) {
  mockCreateOpenAiClient.mockReturnValue(llm);
  mockCreateLLMClient.mockResolvedValue(llm);
}

function fakeLlm(content: string, source: 'live' | 'cache' | 'fallback' = 'live') {
  return { complete: vi.fn().mockResolvedValue({ content, source }) };
}

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/summary', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const validSummaryContent = JSON.stringify({
  decisions: [
    {
      decision: '신규 배포는 매주 화요일에 진행한다.',
      owner: '김철수',
      dueDate: null,
      authorityStatus: '내부 승인 필요',
      authorityEvidence: '"팀장 승인 후 진행하겠습니다"라는 문장이 있습니다.',
    },
  ],
});

describe('POST /api/summary', () => {
  it('세션이 없으면 401 AUTH_REQUIRED를 반환한다', async () => {
    mockResolveSession.mockResolvedValue(null);

    const response = await POST(
      postRequest({ threadText: '스레드 원문', context: { channel: 'web' } }),
    );

    expect(response.status).toBe(401);
  });

  it('threadText가 비어 있으면 400 VALIDATION_FAILED를 반환한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });

    const response = await POST(postRequest({ threadText: '', context: { channel: 'web' } }));

    expect(response.status).toBe(400);
  });

  it('AC-019/020/050/064② — decisions·unresolved·source를 그대로 응답에 담는다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient(fakeLlm(validSummaryContent));

    const response = await POST(
      postRequest({ threadText: '스레드 원문', context: { channel: 'web' } }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.decisions).toEqual([
      {
        decision: '신규 배포는 매주 화요일에 진행한다.',
        owner: '김철수',
        dueDate: null,
        authorityStatus: '내부 승인 필요',
        authorityEvidence: '"팀장 승인 후 진행하겠습니다"라는 문장이 있습니다.',
      },
    ]);
    expect(body.unresolved).toEqual([
      { decision: '신규 배포는 매주 화요일에 진행한다.', missingFields: ['dueDate'] },
    ]);
    expect(body.source).toBe('live');
  });

  it('응답이 정확히 3개 키(decisions/unresolved/source)만 갖는다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient(fakeLlm(validSummaryContent));

    const response = await POST(postRequest({ threadText: 'hello', context: { channel: 'web' } }));
    const body = await response.json();

    expect(Object.keys(body).sort()).toEqual(['decisions', 'source', 'unresolved'].sort());
  });

  it('결정 사항이 없는 스레드는 decisions: [], unresolved: []로 200을 반환한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient(fakeLlm(JSON.stringify({ decisions: [] })));

    const response = await POST(postRequest({ threadText: '안녕하세요', context: { channel: 'web' } }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.decisions).toEqual([]);
    expect(body.unresolved).toEqual([]);
  });

  it('C7 응답이 스키마 검증에 실패해도 실 FALLBACK_RESPONSES로 폴백해 200을 반환한다(AC-041)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient(fakeLlm('유효하지 않은 JSON'));

    const response = await POST(postRequest({ threadText: 'hello', context: { channel: 'web' } }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.source).toBe('fallback');
    expect(body.decisions).toEqual([]);
  });

  it('createOpenAiLLMClient를 직접 부르지 않고 createLLMClient(userId)를 거친다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-42' });
    mockCreateClient(fakeLlm(validSummaryContent));

    await POST(postRequest({ threadText: 'hello', context: { channel: 'web' } }));

    expect(mockCreateLLMClient).toHaveBeenCalledWith('user-42');
  });

  it('AC-030과 동일 원칙 — 응답 어디에도 OPENAI_API_KEY 값이 노출되지 않는다', async () => {
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-test-secret-value-should-not-leak';
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient(fakeLlm(validSummaryContent));

    const response = await POST(postRequest({ threadText: 'hello', context: { channel: 'web' } }));
    const bodyText = await response.text();

    expect(bodyText).not.toContain('sk-test-secret-value-should-not-leak');
    process.env.OPENAI_API_KEY = previous;
  });
});
