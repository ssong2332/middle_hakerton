/**
 * `POST /api/enrichment/fetch` — `docs/API.md` "POST /api/enrichment/fetch" · `docs/Tasks.md`
 * T64. `fetchGitHubEnrichment`/`upsertEnrichment`는 모킹한다 — 각 함수 자체의 동작은
 * `github-client.test.ts`/`storage.test.ts`가 검증한다. 여기서는 라우트 배선(검증 → username
 * 파싱 → 조회 → 계산 → 저장 → 응답 조합)만 본다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/auth', () => ({
  resolveSession: vi.fn(),
}));
vi.mock('../../../../lib/enrichment/github-client', () => ({
  fetchGitHubEnrichment: vi.fn(),
  parseGitHubUsername: vi.fn(),
}));
vi.mock('../../../../lib/enrichment/storage', () => ({
  upsertEnrichment: vi.fn(),
}));

import { ValidationError } from '@cross-border/core';
import { resolveSession } from '../../../../lib/auth';
import { fetchGitHubEnrichment, parseGitHubUsername } from '../../../../lib/enrichment/github-client';
import { upsertEnrichment } from '../../../../lib/enrichment/storage';
import { POST } from './route';

const mockResolveSession = vi.mocked(resolveSession);
const mockFetchGitHubEnrichment = vi.mocked(fetchGitHubEnrichment);
const mockParseGitHubUsername = vi.mocked(parseGitHubUsername);
const mockUpsertEnrichment = vi.mocked(upsertEnrichment);

const fakeClient = { from: vi.fn() } as never;

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/enrichment/fetch', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const validBody = { recipient: 'boss@example.com', profileUrl: 'https://github.com/octocat' };

describe('POST /api/enrichment/fetch — AC-065, AC-071', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient });
    mockParseGitHubUsername.mockReturnValue('octocat');
    mockFetchGitHubEnrichment.mockResolvedValue({
      location: 'San Francisco',
      company: '@github',
      activityTimestamps: [],
    });
    mockUpsertEnrichment.mockResolvedValue({
      location: 'San Francisco',
      company: '@github',
      activityHourHistogram: null,
      activitySampleCount: 0,
      fetchedAt: '2026-08-11T00:00:00Z',
      sourceUrl: 'https://github.com/octocat',
    });
  });

  it('username을 파싱해 조회하고, 계산 결과를 저장한 뒤 timezoneCandidates를 포함한 응답을 반환한다', async () => {
    const response = await POST(jsonRequest(validBody));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockParseGitHubUsername).toHaveBeenCalledWith('https://github.com/octocat');
    expect(mockFetchGitHubEnrichment).toHaveBeenCalledWith('octocat');
    expect(mockUpsertEnrichment).toHaveBeenCalledWith(
      fakeClient,
      expect.objectContaining({
        userId: 'user-1',
        recipientIdentifier: 'boss@example.com',
        sourceUrl: 'https://github.com/octocat',
        location: 'San Francisco',
        company: '@github',
      }),
    );
    expect(body).toEqual({
      location: 'San Francisco',
      company: '@github',
      activityHourHistogram: null,
      activitySampleCount: 0,
      timezoneCandidates: ['America/Los_Angeles'],
      fetchedAt: '2026-08-11T00:00:00Z',
      sourceUrl: 'https://github.com/octocat',
    });
  });

  it('location이 null이면 timezoneCandidates는 빈 배열이다(지어내지 않는다)', async () => {
    mockFetchGitHubEnrichment.mockResolvedValue({ location: null, company: null, activityTimestamps: [] });
    mockUpsertEnrichment.mockResolvedValue({
      location: null,
      company: null,
      activityHourHistogram: null,
      activitySampleCount: 0,
      fetchedAt: '2026-08-11T00:00:00Z',
      sourceUrl: 'https://github.com/octocat',
    });

    const response = await POST(jsonRequest(validBody));
    const body = await response.json();

    expect(body.timezoneCandidates).toEqual([]);
  });

  it('GitHub이 아닌 URL이면(parseGitHubUsername이 ValidationError) 400을 반환하고 조회하지 않는다', async () => {
    mockParseGitHubUsername.mockImplementation(() => {
      throw new ValidationError('GitHub 프로필 URL만 지원합니다');
    });

    const response = await POST(jsonRequest({ ...validBody, profileUrl: 'https://gitlab.com/x' }));

    expect(response.status).toBe(400);
    expect(mockFetchGitHubEnrichment).not.toHaveBeenCalled();
  });

  it('필수 필드가 없으면 400 VALIDATION_FAILED를 반환하고 아무것도 호출하지 않는다', async () => {
    const response = await POST(jsonRequest({ recipient: 'boss@example.com' }));

    expect(response.status).toBe(400);
    expect(mockParseGitHubUsername).not.toHaveBeenCalled();
  });

  it('세션이 없으면 401 AUTH_REQUIRED를 반환한다', async () => {
    mockResolveSession.mockResolvedValue(null);

    const response = await POST(jsonRequest(validBody));

    expect(response.status).toBe(401);
    expect(mockFetchGitHubEnrichment).not.toHaveBeenCalled();
  });
});
