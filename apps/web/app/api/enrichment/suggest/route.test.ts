/**
 * `POST /api/enrichment/suggest` — `docs/API.md:321` (UX-018 Stage 3, LLM 호출 있음) / AC-073.
 * `docs/Tasks.md` T68. 저장소·LLM 클라이언트·`runStyleSuggestion`은 모킹한다 — 판정/제안 로직
 * 자체는 `packages/core/src/steps/suggest.test.ts`·`observation/indicators.test.ts`의 몫.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/auth', () => ({
  resolveSession: vi.fn(),
}));
vi.mock('../../../../lib/samples/storage', () => ({
  getIndicatorRollupForCounterpart: vi.fn(),
}));
vi.mock('../../../../lib/enrichment/storage', () => ({
  getEnrichment: vi.fn(),
}));
vi.mock('../../../../lib/protocol/storage', () => ({
  fetchProtocol: vi.fn(),
}));
vi.mock('../../../../lib/llm/create-client', () => ({
  createLLMClient: vi.fn(),
}));

import { resolveSession } from '../../../../lib/auth';
import { getIndicatorRollupForCounterpart } from '../../../../lib/samples/storage';
import { getEnrichment } from '../../../../lib/enrichment/storage';
import { fetchProtocol } from '../../../../lib/protocol/storage';
import { createLLMClient } from '../../../../lib/llm/create-client';
import { POST } from './route';

const mockResolveSession = vi.mocked(resolveSession);
const mockGetRollup = vi.mocked(getIndicatorRollupForCounterpart);
const mockGetEnrichment = vi.mocked(getEnrichment);
const mockFetchProtocol = vi.mocked(fetchProtocol);
const mockCreateLLMClient = vi.mocked(createLLMClient);

function fakeClient(email = 'me@example.com') {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { email } }, error: null }) },
  } as never;
}

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/enrichment/suggest', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const UNTOUCHED_PROTOCOL = {
  pairKey: 'k',
  counterpart: 'tanaka@example.com',
  directnessAllowed: null,
  emojiPolicy: null,
  addressForm: null,
  deadlineStyle: null,
  authorshipState: 'untouched' as const,
  updatedAt: '2026-08-11T00:00:00Z',
};

const SUFFICIENT_ROLLUP = {
  manual: { sampleCount: 5, emojiCount: 2, hedgeCount: 0, sentenceCount: 10 },
  github: { sampleCount: 0, emojiCount: 0, hedgeCount: 0, sentenceCount: 0 },
};

const INSUFFICIENT_ROLLUP = {
  manual: { sampleCount: 1, emojiCount: 1, hedgeCount: 0, sentenceCount: 2 },
  github: { sampleCount: 0, emojiCount: 0, hedgeCount: 0, sentenceCount: 0 },
};

describe('POST /api/enrichment/suggest — AC-073', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('상대가 규약을 직접 작성했으면(counterpart_authored) 생성을 건너뛴다(AC-037/AC-074④)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient() });
    mockFetchProtocol.mockResolvedValue({ ...UNTOUCHED_PROTOCOL, authorshipState: 'counterpart_authored' });

    const response = await POST(postRequest({ recipient: 'tanaka@example.com' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ suggestions: [], protocolAlreadyAuthored: true });
    expect(mockGetRollup).not.toHaveBeenCalled();
  });

  it('표본이 임계값 미만이면 전체를 보류한다(AC-073⑤)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient() });
    mockFetchProtocol.mockResolvedValue(UNTOUCHED_PROTOCOL);
    mockGetRollup.mockResolvedValue(INSUFFICIENT_ROLLUP);
    mockGetEnrichment.mockResolvedValue(null);

    const response = await POST(postRequest({ recipient: 'tanaka@example.com' }));
    const body = await response.json();

    expect(body).toEqual({
      suggestions: [],
      insufficientSample: true,
      requiredSampleCount: 3,
      currentSampleCount: 1,
    });
    expect(mockCreateLLMClient).not.toHaveBeenCalled();
  });

  it('표본이 충분하면 LLM을 호출해 제안을 반환한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient() });
    mockFetchProtocol.mockResolvedValue(UNTOUCHED_PROTOCOL);
    mockGetRollup.mockResolvedValue(SUFFICIENT_ROLLUP);
    mockGetEnrichment.mockResolvedValue(null);
    const completeMock = vi.fn().mockResolvedValue({
      content: JSON.stringify({ emojiPolicy: 'ok', rationale: '이모지를 씁니다.' }),
      source: 'live',
    });
    mockCreateLLMClient.mockResolvedValue({ complete: completeMock });

    const response = await POST(postRequest({ recipient: 'tanaka@example.com' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockCreateLLMClient).toHaveBeenCalledWith('user-1');
    expect(body.suggestions).toEqual([
      {
        axis: 'emojiPolicy',
        value: 'ok',
        evidence: { indicatorKey: 'emojiFrequency', observedValue: 0.4 },
        evidenceCount: 5,
      },
    ]);
    expect(body.source).toBe('live');
  });

  it('recipient가 비어 있으면 400을 반환한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient() });

    const response = await POST(postRequest({ recipient: '' }));

    expect(response.status).toBe(400);
    expect(mockFetchProtocol).not.toHaveBeenCalled();
  });

  it('인증되지 않은 요청은 401을 반환한다', async () => {
    mockResolveSession.mockResolvedValue(null);

    const response = await POST(postRequest({ recipient: 'tanaka@example.com' }));

    expect(response.status).toBe(401);
    expect(mockFetchProtocol).not.toHaveBeenCalled();
  });
});
