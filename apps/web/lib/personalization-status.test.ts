/**
 * T86 인접 — `checkPersonalizationActive()`. `docs/UX.md` UX-004 "개인화 프로필 적용 중" 배지 판정.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockGetUser, mockCreateClient, mockFetchSenderProfile, mockFetchLearnedItems } = vi.hoisted(
  () => ({
    mockGetUser: vi.fn(),
    mockCreateClient: vi.fn(),
    mockFetchSenderProfile: vi.fn(),
    mockFetchLearnedItems: vi.fn(),
  }),
);

vi.mock('./supabase/server', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

vi.mock('./profile/storage', () => ({
  fetchSenderProfile: (...args: unknown[]) => mockFetchSenderProfile(...args),
  fetchLearnedItems: (...args: unknown[]) => mockFetchLearnedItems(...args),
}));

import { checkPersonalizationActive } from './personalization-status';

function profileWith(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    onboardingState: 'completed',
    directness: null,
    emojiPreference: null,
    formality: null,
    honorificLevel: null,
    ...overrides,
  };
}

describe('checkPersonalizationActive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateClient.mockResolvedValue({ auth: { getUser: mockGetUser } });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockFetchLearnedItems.mockResolvedValue([]);
  });

  it('onboardingState가 completed이고 자기신고 필드가 하나라도 있으면 true다', async () => {
    mockFetchSenderProfile.mockResolvedValue(profileWith({ directness: 'direct' }));

    expect(await checkPersonalizationActive()).toBe(true);
  });

  it('학습된 항목이 하나라도 있으면(자기신고가 전부 null이어도) true다', async () => {
    mockFetchSenderProfile.mockResolvedValue(profileWith());
    mockFetchLearnedItems.mockResolvedValue([{ patternKey: 'emoji_removed', value: 'avoids' }]);

    expect(await checkPersonalizationActive()).toBe(true);
  });

  it('onboardingState가 skipped이고 학습된 항목도 없으면 false다', async () => {
    mockFetchSenderProfile.mockResolvedValue(profileWith({ onboardingState: 'skipped' }));

    expect(await checkPersonalizationActive()).toBe(false);
  });

  it('completed지만 자기신고 4필드가 전부 null이고 학습된 항목도 없으면 false다', async () => {
    mockFetchSenderProfile.mockResolvedValue(profileWith());

    expect(await checkPersonalizationActive()).toBe(false);
  });

  it('인증 사용자가 없으면 false다(조회 자체를 하지 않는다)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    expect(await checkPersonalizationActive()).toBe(false);
    expect(mockFetchSenderProfile).not.toHaveBeenCalled();
  });

  it('fail-open — createClient()가 던지면 로그만 남기고 false를 반환한다(화면을 막지 않는다)', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockCreateClient.mockRejectedValue(new Error('env missing'));

    await expect(checkPersonalizationActive()).resolves.toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('fail-open — fetchSenderProfile()이 던져도 로그만 남기고 false를 반환한다', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetchSenderProfile.mockRejectedValue({ code: '42P01', message: 'relation missing' });

    await expect(checkPersonalizationActive()).resolves.toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
