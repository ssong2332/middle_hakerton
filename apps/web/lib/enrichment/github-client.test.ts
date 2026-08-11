/**
 * T64 — GitHub REST API 클라이언트. `fetch`는 모킹한다(실제 GitHub 조회는 스파이크에서 수동
 * 검증했다, `docs/Tasks.md` T64 각주 참조) — 여기서는 URL 파싱·에러 매핑·타임스탬프 추출만 본다.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ExternalFetchFailedError, ValidationError } from '@cross-border/core';
import { fetchGitHubEnrichment, parseGitHubUsername } from './github-client';

describe('parseGitHubUsername — AC-065②', () => {
  it('github.com URL에서 username을 뽑는다', () => {
    expect(parseGitHubUsername('https://github.com/torvalds')).toBe('torvalds');
  });

  it('www.github.com도 허용한다', () => {
    expect(parseGitHubUsername('https://www.github.com/torvalds')).toBe('torvalds');
  });

  it('GitHub이 아닌 도메인은 ValidationError를 던진다', () => {
    expect(() => parseGitHubUsername('https://gitlab.com/torvalds')).toThrow(ValidationError);
  });

  it('경로가 username 1개가 아니면(리포지토리 URL 등) ValidationError를 던진다', () => {
    expect(() => parseGitHubUsername('https://github.com/torvalds/linux')).toThrow(ValidationError);
  });

  it('URL 형식이 아니면 ValidationError를 던진다', () => {
    expect(() => parseGitHubUsername('not a url')).toThrow(ValidationError);
  });
});

describe('fetchGitHubEnrichment — AC-071④', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  function okResponse(body: unknown) {
    return { ok: true, json: async () => body };
  }

  it('프로필의 location/company와 이벤트의 created_at만 추출한다(그 외 필드는 접근하지 않는다)', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/events/public')) {
        return Promise.resolve(
          okResponse([
            { type: 'PushEvent', created_at: '2026-08-11T09:00:00Z', payload: { commits: ['secret msg'] } },
            { type: 'IssueCommentEvent', created_at: '2026-08-11T10:00:00Z', payload: { comment: { body: 'secret comment' } } },
          ]),
        );
      }
      return Promise.resolve(
        okResponse({ location: 'Seoul', company: '@example', email: 'x@example.com', bio: 'hi there' }),
      );
    });

    const result = await fetchGitHubEnrichment('torvalds');

    expect(result).toEqual({
      location: 'Seoul',
      company: '@example',
      activityTimestamps: ['2026-08-11T09:00:00Z', '2026-08-11T10:00:00Z'],
    });
  });

  it('프로필 조회가 실패하면(!ok) ExternalFetchFailedError를 던진다', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/events/public')) return Promise.resolve(okResponse([]));
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });

    await expect(fetchGitHubEnrichment('missing-user')).rejects.toBeInstanceOf(ExternalFetchFailedError);
  });

  it('활동 이벤트 조회가 실패하면(!ok) ExternalFetchFailedError를 던진다', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/events/public')) return Promise.resolve({ ok: false, json: async () => ({}) });
      return Promise.resolve(okResponse({ location: null, company: null }));
    });

    await expect(fetchGitHubEnrichment('torvalds')).rejects.toBeInstanceOf(ExternalFetchFailedError);
  });

  it('네트워크 오류(fetch 자체가 던짐)도 ExternalFetchFailedError로 정규화한다', async () => {
    mockFetch.mockRejectedValue(new Error('network down'));

    await expect(fetchGitHubEnrichment('torvalds')).rejects.toBeInstanceOf(ExternalFetchFailedError);
  });

  it('location/company가 없으면(null) 그대로 null을 담는다(지어내지 않는다)', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/events/public')) return Promise.resolve(okResponse([]));
      return Promise.resolve(okResponse({ location: null, company: null }));
    });

    const result = await fetchGitHubEnrichment('gaearon');

    expect(result.location).toBeNull();
    expect(result.company).toBeNull();
  });

  it('created_at이 없는 이벤트는 걸러낸다', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/events/public')) {
        return Promise.resolve(okResponse([{ type: 'PushEvent' }, { type: 'PushEvent', created_at: '2026-08-11T00:00:00Z' }]));
      }
      return Promise.resolve(okResponse({ location: null, company: null }));
    });

    const result = await fetchGitHubEnrichment('torvalds');

    expect(result.activityTimestamps).toEqual(['2026-08-11T00:00:00Z']);
  });
});
