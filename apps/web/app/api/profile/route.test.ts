/**
 * `PUT /api/profile` — `docs/API.md` "GET / PUT / DELETE /api/profile" · `docs/Tasks.md` T19.
 * `resolveSession()`과 저장소 함수(`saveOnboardingProfile`)는 모킹한다 — 실제 upsert 구성
 * 검증은 `apps/web/lib/profile/storage.test.ts`의 몫이다. 여기서는 라우트 배선(검증 → 저장
 * 호출 → 응답 조합 → 200)만 본다. AC-011, AC-046②, AC-059.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/auth', () => ({
  resolveSession: vi.fn(),
}));
vi.mock('../../../lib/profile/storage', () => ({
  saveOnboardingProfile: vi.fn(),
  fetchProfileWithMeta: vi.fn(),
  resetProfile: vi.fn(),
}));

import { resolveSession } from '../../../lib/auth';
import {
  fetchProfileWithMeta,
  resetProfile,
  saveOnboardingProfile,
} from '../../../lib/profile/storage';
import { DELETE, GET, PUT } from './route';

const mockResolveSession = vi.mocked(resolveSession);
const mockSaveOnboardingProfile = vi.mocked(saveOnboardingProfile);
const mockFetchProfileWithMeta = vi.mocked(fetchProfileWithMeta);
const mockResetProfile = vi.mocked(resetProfile);

const fakeClient = { from: vi.fn() } as never;

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/profile', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function plainRequest(method: string): Request {
  return new Request('http://localhost/api/profile', { method });
}

describe('PUT /api/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient });
  });

  it('AC-011/AC-046② — 완료 요청을 세션 userId로 saveOnboardingProfile에 위임하고 200으로 응답한다', async () => {
    mockSaveOnboardingProfile.mockResolvedValue({
      onboardingState: 'completed',
      directness: 'direct',
      emojiPreference: 'neutral',
      formality: 'medium',
      honorificLevel: 'hapsyo',
      updatedAt: '2026-08-07T00:00:00Z',
    });

    const response = await PUT(
      jsonRequest({
        onboardingState: 'completed',
        directness: 'direct',
        emojiPreference: 'neutral',
        formality: 'medium',
        honorificLevel: 'hapsyo',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockSaveOnboardingProfile).toHaveBeenCalledWith(
      fakeClient,
      'user-1',
      expect.objectContaining({
        onboardingState: 'completed',
        directness: 'direct',
        emojiPreference: 'neutral',
        formality: 'medium',
        honorificLevel: 'hapsyo',
      }),
    );
    expect(body).toEqual({
      onboardingState: 'completed',
      directness: 'direct',
      emojiPreference: 'neutral',
      formality: 'medium',
      honorificLevel: 'hapsyo',
      updatedAt: '2026-08-07T00:00:00Z',
    });
  });

  it('AC-059① — 인증되지 않은 요청은 401 AUTH_REQUIRED를 반환하고 saveOnboardingProfile을 호출하지 않는다', async () => {
    mockResolveSession.mockResolvedValue(null);

    const response = await PUT(jsonRequest({ onboardingState: 'skipped' }));

    expect(response.status).toBe(401);
    expect(mockSaveOnboardingProfile).not.toHaveBeenCalled();
  });

  it('AC-059② — 스킵 요청은 스타일 필드 없이도 통과하고 그대로 위임한다(필드를 지어내지 않는다)', async () => {
    mockSaveOnboardingProfile.mockResolvedValue({
      onboardingState: 'skipped',
      directness: null,
      emojiPreference: null,
      formality: null,
      honorificLevel: null,
      updatedAt: '2026-08-07T00:00:00Z',
    });

    const response = await PUT(jsonRequest({ onboardingState: 'skipped' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockSaveOnboardingProfile).toHaveBeenCalledWith(
      fakeClient,
      'user-1',
      expect.objectContaining({ onboardingState: 'skipped' }),
    );
    expect(body.onboardingState).toBe('skipped');
    expect(body.directness).toBeNull();
  });

  it('알 수 없는 onboardingState 값은 400 VALIDATION_FAILED를 반환한다', async () => {
    const response = await PUT(jsonRequest({ onboardingState: 'bogus' }));

    expect(response.status).toBe(400);
    expect(mockSaveOnboardingProfile).not.toHaveBeenCalled();
  });
});

describe('GET /api/profile — T21(UX-009 화면 조회), AC-014/AC-059', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient });
  });

  it('세션 userId로 fetchProfileWithMeta에 위임하고 200으로 응답한다', async () => {
    mockFetchProfileWithMeta.mockResolvedValue({
      onboardingState: 'completed',
      directness: 'direct',
      emojiPreference: 'neutral',
      formality: 'medium',
      honorificLevel: 'hapsyo',
      updatedAt: '2026-08-07T00:00:00Z',
    });

    const response = await GET(plainRequest('GET'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockFetchProfileWithMeta).toHaveBeenCalledWith(fakeClient, 'user-1');
    expect(body.onboardingState).toBe('completed');
    expect(body.updatedAt).toBe('2026-08-07T00:00:00Z');
  });

  it('인증되지 않은 요청은 401 AUTH_REQUIRED를 반환하고 fetchProfileWithMeta를 호출하지 않는다', async () => {
    mockResolveSession.mockResolvedValue(null);

    const response = await GET(plainRequest('GET'));

    expect(response.status).toBe(401);
    expect(mockFetchProfileWithMeta).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/profile — T21(UX-009 다시 시작), AC-014/AC-059', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient });
  });

  it('세션 userId로 resetProfile에 위임하고 not_started 상태를 200으로 응답한다', async () => {
    mockResetProfile.mockResolvedValue({
      onboardingState: 'not_started',
      directness: null,
      emojiPreference: null,
      formality: null,
      honorificLevel: null,
      updatedAt: '2026-08-07T00:00:00Z',
    });

    const response = await DELETE(plainRequest('DELETE'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockResetProfile).toHaveBeenCalledWith(fakeClient, 'user-1');
    expect(body.onboardingState).toBe('not_started');
    expect(body.directness).toBeNull();
  });

  it('인증되지 않은 요청은 401 AUTH_REQUIRED를 반환하고 resetProfile을 호출하지 않는다', async () => {
    mockResolveSession.mockResolvedValue(null);

    const response = await DELETE(plainRequest('DELETE'));

    expect(response.status).toBe(401);
    expect(mockResetProfile).not.toHaveBeenCalled();
  });
});
