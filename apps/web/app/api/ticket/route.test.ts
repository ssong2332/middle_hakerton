/**
 * `POST /api/ticket` — T24 범위(`docs/API.md` "POST /api/ticket", UX-007/UF-004).
 * `resolveSession()`(T45 스텁)과 OpenAI 호출(`createOpenAiLLMClient`)은 모킹한다 — 이 라우트가
 * `runTicketConversion`(core)에 배선하는 것만 본다. C6의 의미적 정확도(변환 품질)는 이 파일이
 * 아니라 `packages/core/src/steps/c6.test.ts`와 T11 러너의 몫이다.
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
  return new Request('http://localhost/api/ticket', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const validTicketContent = JSON.stringify({
  sections: {
    problem: '배포가 반복해서 지연되고 있습니다.',
    impact: '없음',
    request: '재발 방지책을 요청합니다.',
    concernLevel: '작성자가 반복된 지연에 답답함을 느끼고 있습니다.',
  },
  decisionAuthority: '내부 승인 필요',
  decisionAuthorityEvidence: '"팀장 승인 후 진행하겠습니다"라는 문장이 있습니다.',
});

describe('POST /api/ticket', () => {
  it('세션이 없으면 401 AUTH_REQUIRED를 반환한다', async () => {
    mockResolveSession.mockResolvedValue(null);

    const response = await POST(
      postRequest({ text: '이건 명백히 그쪽 실수입니다', context: { channel: 'web' } }),
    );

    expect(response.status).toBe(401);
  });

  it('text가 비어 있으면 400 VALIDATION_FAILED를 반환한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });

    const response = await POST(postRequest({ text: '', context: { channel: 'web' } }));

    expect(response.status).toBe(400);
  });

  it('AC-017/018/050/062/064① — sections·decisionAuthority·evidence·source를 그대로 응답에 담는다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient(fakeLlm(validTicketContent));

    const response = await POST(
      postRequest({ text: '이건 명백히 그쪽 실수입니다', context: { channel: 'web' } }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sections).toEqual({
      problem: '배포가 반복해서 지연되고 있습니다.',
      impact: '없음',
      request: '재발 방지책을 요청합니다.',
      concernLevel: '작성자가 반복된 지연에 답답함을 느끼고 있습니다.',
    });
    expect(body.decisionAuthority).toBe('내부 승인 필요');
    expect(body.decisionAuthorityEvidence).toBe(
      '"팀장 승인 후 진행하겠습니다"라는 문장이 있습니다.',
    );
    expect(body.source).toBe('live');
  });

  it('응답이 정확히 4개 키(sections/decisionAuthority/decisionAuthorityEvidence/source)만 갖는다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient(fakeLlm(validTicketContent));

    const response = await POST(
      postRequest({ text: 'hello', context: { channel: 'web' } }),
    );
    const body = await response.json();

    expect(Object.keys(body).sort()).toEqual(
      ['decisionAuthority', 'decisionAuthorityEvidence', 'sections', 'source'].sort(),
    );
  });

  it('C6 응답이 스키마 검증에 실패해도 실 FALLBACK_RESPONSES로 폴백해 200을 반환한다(AC-041)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient(fakeLlm('유효하지 않은 JSON'));

    const response = await POST(postRequest({ text: 'hello', context: { channel: 'web' } }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.source).toBe('fallback');
    expect(body.decisionAuthority).toBe('불명');
    expect(body.decisionAuthorityEvidence).toBeNull();
  });

  it('M-4와 동일 배선 — createOpenAiLLMClient를 직접 부르지 않고 createLLMClient(userId)를 거친다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-42' });
    mockCreateClient(fakeLlm(validTicketContent));

    await POST(postRequest({ text: 'hello', context: { channel: 'web' } }));

    expect(mockCreateLLMClient).toHaveBeenCalledWith('user-42');
  });

  it('AC-030과 동일 원칙 — 응답 어디에도 OPENAI_API_KEY 값이 노출되지 않는다', async () => {
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-test-secret-value-should-not-leak';
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient(fakeLlm(validTicketContent));

    const response = await POST(postRequest({ text: 'hello', context: { channel: 'web' } }));
    const bodyText = await response.text();

    expect(bodyText).not.toContain('sk-test-secret-value-should-not-leak');
    process.env.OPENAI_API_KEY = previous;
  });
});
