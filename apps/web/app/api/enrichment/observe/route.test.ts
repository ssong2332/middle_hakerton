/**
 * `POST /api/enrichment/observe` — `docs/API.md:309` / AC-072, AC-080④, AC-082. `docs/Tasks.md`
 * T68. `getIndicatorRollupForCounterpart()`/`getEnrichment()`는 모킹한다 — 집계 계산 자체는
 * `packages/core/src/observation/indicators.test.ts`의 몫.
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

import { resolveSession } from '../../../../lib/auth';
import { getIndicatorRollupForCounterpart } from '../../../../lib/samples/storage';
import { getEnrichment } from '../../../../lib/enrichment/storage';
import { POST } from './route';

const mockResolveSession = vi.mocked(resolveSession);
const mockGetRollup = vi.mocked(getIndicatorRollupForCounterpart);
const mockGetEnrichment = vi.mocked(getEnrichment);

function fakeClient() {
  return {} as never;
}

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/enrichment/observe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const EMPTY_ROLLUP = {
  manual: { sampleCount: 0, emojiCount: 0, hedgeCount: 0, sentenceCount: 0 },
  github: { sampleCount: 0, emojiCount: 0, hedgeCount: 0, sentenceCount: 0 },
};

describe('POST /api/enrichment/observe — AC-072', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('두 저장소를 조회해 4개 지표를 반환한다(원문 필드는 응답에 없다)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient() });
    mockGetRollup.mockResolvedValue({
      manual: { sampleCount: 2, emojiCount: 1, hedgeCount: 0, sentenceCount: 6 },
      github: { sampleCount: 0, emojiCount: 0, hedgeCount: 0, sentenceCount: 0 },
    });
    mockGetEnrichment.mockResolvedValue(null);

    const response = await POST(postRequest({ recipient: 'tanaka@example.com' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockGetRollup).toHaveBeenCalledWith(expect.anything(), 'user-1', 'tanaka@example.com');
    expect(mockGetEnrichment).toHaveBeenCalledWith(expect.anything(), 'user-1', 'tanaka@example.com');
    expect(body.indicators.map((i: { key: string }) => i.key)).toEqual([
      'commentLength',
      'emojiFrequency',
      'responseDelay',
      'activityHours',
    ]);
    expect(body.indicators.find((i: { key: string }) => i.key === 'commentLength').value).toBe(3);
    const keys = JSON.stringify(body);
    expect(keys).not.toMatch(/rawText|excerpt|quote|commitMessage/i);
  });

  it('recipient_enrichments 조회 결과(activity_hour_histogram)를 activityHours 지표에 반영한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient() });
    mockGetRollup.mockResolvedValue(EMPTY_ROLLUP);
    const histogram = new Array(24).fill(0);
    histogram[9] = 30;
    mockGetEnrichment.mockResolvedValue({
      location: null,
      company: null,
      activityHourHistogram: histogram,
      activitySampleCount: 30,
      activityTimezoneConfirmed: null,
      fetchedAt: '2026-08-11T00:00:00Z',
      sourceUrl: 'https://github.com/octocat',
    });

    const response = await POST(postRequest({ recipient: 'tanaka@example.com' }));
    const body = await response.json();

    const activityHours = body.indicators.find((i: { key: string }) => i.key === 'activityHours');
    expect(activityHours).toMatchObject({ value: 9, sampleCount: 30 });
  });

  it('recipient가 비어 있으면 400을 반환한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient() });

    const response = await POST(postRequest({ recipient: '' }));

    expect(response.status).toBe(400);
    expect(mockGetRollup).not.toHaveBeenCalled();
  });

  it('인증되지 않은 요청은 401을 반환한다', async () => {
    mockResolveSession.mockResolvedValue(null);

    const response = await POST(postRequest({ recipient: 'tanaka@example.com' }));

    expect(response.status).toBe(401);
    expect(mockGetRollup).not.toHaveBeenCalled();
  });
});
