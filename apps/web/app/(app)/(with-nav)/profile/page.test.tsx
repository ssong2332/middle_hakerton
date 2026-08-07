/**
 * UX-009 Profile Management Screen — `docs/UX.md` Screen Catalog (Screen ID: UX-009).
 * AC-014, AC-012/AC-013(뒷단이지만 이 화면이 노출), AC-046, AC-059. `docs/Tasks.md` T21.
 *
 * Reviewer Major 수정(M-1~M-4, 리뷰 후속): 스킵/미시작 사용자의 학습 항목 열람·삭제(M-1),
 * 학습 항목을 차원별 1행으로 병합해 원시 patternKey 노출 제거(M-2), 자기신고 4항목을 모두
 * 삭제한 경우의 개인화-꺼짐 표시(M-3), not_started 전용 문구(M-4) — 아래 "M-N —" 표시 테스트.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import ProfilePage from './page';

const COMPLETED_PROFILE = {
  onboardingState: 'completed',
  directness: 'direct',
  emojiPreference: 'neutral',
  formality: 'medium',
  honorificLevel: 'hapsyo',
  updatedAt: '2026-08-07T00:00:00Z',
};

const COMPLETED_ALL_NULL_PROFILE = {
  onboardingState: 'completed',
  directness: null,
  emojiPreference: null,
  formality: null,
  honorificLevel: null,
  updatedAt: '2026-08-07T00:00:00Z',
};

const SKIPPED_PROFILE = {
  onboardingState: 'skipped',
  directness: null,
  emojiPreference: null,
  formality: null,
  honorificLevel: null,
  updatedAt: null,
};

const NOT_STARTED_PROFILE = {
  onboardingState: 'not_started',
  directness: null,
  emojiPreference: null,
  formality: null,
  honorificLevel: null,
  updatedAt: null,
};

function jsonOk(body: unknown) {
  return { ok: true, json: async () => body };
}

function mockLoadSuccess(profile: unknown, learnedItems: unknown[] = []) {
  mockFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url === '/api/profile' && method === 'GET') {
      return Promise.resolve(jsonOk(profile));
    }
    if (url === '/api/profile/learned' && method === 'GET') {
      return Promise.resolve(jsonOk({ items: learnedItems }));
    }
    return Promise.reject(new Error(`unexpected fetch: ${method} ${url}`));
  });
}

describe('ProfilePage (UX-009) — AC-014/AC-046/AC-059', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Loading — 초기 렌더에서 스켈레톤을 보여준다', () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // never resolves
    render(<ProfilePage />);

    expect(screen.getByLabelText('프로필 불러오는 중')).toBeTruthy();
  });

  it('Error — 조회 실패 시 에러 배너와 재시도 버튼을 보여준다', async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('불러오지 못했습니다, 다시 시도해주세요')).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy();
  });

  it('Error → 재시도를 누르면 다시 조회해 성공하면 화면을 보여준다', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    render(<ProfilePage />);
    await waitFor(() => {
      expect(screen.getByText('불러오지 못했습니다, 다시 시도해주세요')).toBeTruthy();
    });

    mockLoadSuccess(COMPLETED_PROFILE, []);
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    await waitFor(() => {
      expect(screen.getByText('직설/완곡')).toBeTruthy();
    });
  });

  it('AC-059② — SkippedProfile: 스킵된 프로필은 전용 메시지와 온보딩 완료 버튼을 보여준다', async () => {
    mockLoadSuccess(SKIPPED_PROFILE, []);
    render(<ProfilePage />);

    await waitFor(() => {
      expect(
        screen.getByText('온보딩을 건너뛰었습니다 — 개인화가 꺼져 있습니다'),
      ).toBeTruthy();
    });
  });

  it('M-4 — not_started 프로필은 스킵 문구가 아닌 전용 문구를 보여준다(같은 "온보딩 완료하기" 액션)', async () => {
    mockLoadSuccess(NOT_STARTED_PROFILE, []);
    render(<ProfilePage />);

    await waitFor(() => {
      expect(
        screen.getByText('온보딩이 아직 완료되지 않았습니다 — 개인화가 꺼져 있습니다'),
      ).toBeTruthy();
    });
    expect(screen.queryByText('온보딩을 건너뛰었습니다 — 개인화가 꺼져 있습니다')).toBeNull();
    expect(screen.getByRole('button', { name: '온보딩 완료하기' })).toBeTruthy();
  });

  it('AC-059④ — "온보딩 완료하기" 클릭 시 /onboarding으로 이동한다', async () => {
    mockLoadSuccess(SKIPPED_PROFILE, []);
    render(<ProfilePage />);
    await waitFor(() => screen.getByText('온보딩을 건너뛰었습니다 — 개인화가 꺼져 있습니다'));

    fireEvent.click(screen.getByRole('button', { name: '온보딩 완료하기' }));

    expect(mockPush).toHaveBeenCalledWith('/onboarding');
  });

  it('M-3 — 자기신고 4항목을 모두 삭제한 completed 프로필도 개인화-꺼짐 표시를 보여준다', async () => {
    mockLoadSuccess(COMPLETED_ALL_NULL_PROFILE, []);
    render(<ProfilePage />);

    await waitFor(() => {
      expect(
        screen.getByText('온보딩을 건너뛰었습니다 — 개인화가 꺼져 있습니다'),
      ).toBeTruthy();
    });
  });

  it('M-1 — 스킵된 사용자도 학습된 항목을 보고 삭제할 수 있다', async () => {
    mockLoadSuccess(SKIPPED_PROFILE, [
      { id: 'item-1', patternKey: 'emoji_removed', value: 'avoids' },
    ]);
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('온보딩을 건너뛰었습니다 — 개인화가 꺼져 있습니다')).toBeTruthy();
    });
    // 학습된 항목(이모지 선호 차원)이 스킵 상태에서도 보여야 한다.
    const emojiRow = screen.getByText('이모지 선호').closest('li') as HTMLElement;
    expect(within(emojiRow).getByText('학습됨')).toBeTruthy();

    fireEvent.click(within(emojiRow).getByRole('button', { name: '삭제' }));
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'item-1' }) });
    const confirmBox = within(emojiRow).getByRole('alert');
    fireEvent.click(within(confirmBox).getByRole('button', { name: '삭제' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/profile/learned/item-1', {
        method: 'DELETE',
      });
    });
  });

  it('MJ-1 — 스킵된 사용자의 미설정(자기신고) 행은 수정/삭제 버튼을 렌더하지 않는다(삭제로 onboardingState가 completed로 바뀌면 안 됨)', async () => {
    mockLoadSuccess(SKIPPED_PROFILE, []);
    render(<ProfilePage />);
    await waitFor(() => {
      expect(screen.getByText('온보딩을 건너뛰었습니다 — 개인화가 꺼져 있습니다')).toBeTruthy();
    });

    const directnessRow = screen.getByText('직설/완곡').closest('li') as HTMLElement;
    expect(within(directnessRow).queryByRole('button', { name: '수정' })).toBeNull();
    expect(within(directnessRow).queryByRole('button', { name: '삭제' })).toBeNull();

    // PUT은 전혀 호출되지 않는다 — 특히 onboardingState: 'completed'로 바뀌는 호출은 없어야 한다.
    expect(mockFetch).not.toHaveBeenCalledWith(
      '/api/profile',
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('MJ-1 — not_started 사용자의 미설정 행도 수정/삭제 버튼을 렌더하지 않는다', async () => {
    mockLoadSuccess(NOT_STARTED_PROFILE, []);
    render(<ProfilePage />);
    await waitFor(() => {
      expect(
        screen.getByText('온보딩이 아직 완료되지 않았습니다 — 개인화가 꺼져 있습니다'),
      ).toBeTruthy();
    });

    const formalityRow = screen.getByText('격식도').closest('li') as HTMLElement;
    expect(within(formalityRow).queryByRole('button', { name: '수정' })).toBeNull();
    expect(within(formalityRow).queryByRole('button', { name: '삭제' })).toBeNull();
  });

  it('Empty — 완료된 프로필인데 학습 항목이 없으면 자기신고 항목은 보이고 "아직 학습된 항목이 없습니다"를 보여준다', async () => {
    mockLoadSuccess(COMPLETED_PROFILE, []);
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('직설/완곡')).toBeTruthy();
    });
    expect(screen.getByText('아직 학습된 항목이 없습니다')).toBeTruthy();
  });

  it('M-2 — 학습된 항목은 해당 차원 행에 병합되어 표시되고, 원시 patternKey/enum 값은 노출되지 않는다(AC-046②)', async () => {
    mockLoadSuccess(COMPLETED_PROFILE, [
      { id: 'item-1', patternKey: 'emoji_removed', value: 'avoids' },
    ]);
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('존댓말 레벨')).toBeTruthy();
    });
    // 이모지 선호 차원 하나만 학습됨으로 바뀌고, 나머지 3개는 자기신고로 남는다 — 별도의
    // 원시 리스트(raw patternKey/enum)는 더 이상 존재하지 않는다.
    expect(screen.getAllByText('자기신고').length).toBe(3);
    expect(screen.getByText('학습됨')).toBeTruthy();
    expect(screen.queryByText('emoji_removed')).toBeNull();
    expect(screen.queryByText('avoids')).toBeNull();

    const emojiRow = screen.getByText('이모지 선호').closest('li') as HTMLElement;
    expect(within(emojiRow).getByText('학습됨')).toBeTruthy();
    expect(within(emojiRow).getByText('거의 안 써요')).toBeTruthy();
    // 학습된 행은 수정 불가(View + Delete만) — 기존 리뷰 승인 사항(항목 1) 유지.
    expect(within(emojiRow).queryByRole('button', { name: '수정' })).toBeNull();
    expect(within(emojiRow).getByRole('button', { name: '삭제' })).toBeTruthy();
  });

  it('자기신고 4항목이 정확히 렌더된다(직설/완곡·이모지 선호·격식도·존댓말 레벨)', async () => {
    mockLoadSuccess(COMPLETED_PROFILE, []);
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('직설/완곡')).toBeTruthy();
    });
    expect(screen.getByText('이모지 선호')).toBeTruthy();
    expect(screen.getByText('격식도')).toBeTruthy();
    expect(screen.getByText('존댓말 레벨')).toBeTruthy();
  });

  it('수정 — 항목을 편집해 저장하면 현재 값을 전부 채워 PUT하고 화면 값을 갱신한다', async () => {
    mockLoadSuccess(COMPLETED_PROFILE, []);
    render(<ProfilePage />);
    await waitFor(() => screen.getByText('직설/완곡'));

    const directnessRow = screen.getByText('직설/완곡').closest('li') as HTMLElement;
    fireEvent.click(
      within(directnessRow).getByRole('button', { name: '수정' }),
    );
    fireEvent.click(screen.getByLabelText('완곡하게 표현하는 편이에요'));

    mockFetch.mockResolvedValueOnce(jsonOk({ ...COMPLETED_PROFILE, directness: 'indirect' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/profile',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            onboardingState: 'completed',
            directness: 'indirect',
            emojiPreference: 'neutral',
            formality: 'medium',
            honorificLevel: 'hapsyo',
          }),
        }),
      );
    });
    await waitFor(() => {
      expect(screen.getByText('완곡하게 표현하는 편이에요')).toBeTruthy();
    });
  });

  it('값 선택 없이 저장하면 차단되고 안내 문구를 보여준다(필드가 이미 비어 있는 경우)', async () => {
    // 자기신고 항목은 편집을 열면 현재 값이 미리 선택되므로(onboarding 라디오와 같은 관례),
    // "선택 없음"은 이미 null인 필드(이전에 삭제된 필드)를 다시 편집할 때만 재현된다.
    mockLoadSuccess({ ...COMPLETED_PROFILE, directness: null }, []);
    render(<ProfilePage />);
    await waitFor(() => screen.getByText('직설/완곡'));

    const directnessRow = screen.getByText('직설/완곡').closest('li') as HTMLElement;
    fireEvent.click(within(directnessRow).getByRole('button', { name: '수정' }));
    fireEvent.click(within(directnessRow).getByRole('button', { name: '저장' }));

    expect(screen.getByText('값을 선택해주세요')).toBeTruthy();
    expect(mockFetch).not.toHaveBeenCalledWith(
      '/api/profile',
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('삭제 — 확인 없이는 삭제되지 않고, 확인을 눌러야 필드가 비워진다', async () => {
    mockLoadSuccess(COMPLETED_PROFILE, []);
    render(<ProfilePage />);
    await waitFor(() => screen.getByText('직설/완곡'));

    const directnessRow = screen.getByText('직설/완곡').closest('li') as HTMLElement;
    fireEvent.click(within(directnessRow).getByRole('button', { name: '삭제' }));

    expect(screen.getByText('삭제하시겠습니까?')).toBeTruthy();
    expect(mockFetch).not.toHaveBeenCalledWith(
      '/api/profile',
      expect.objectContaining({ method: 'PUT' }),
    );

    mockFetch.mockResolvedValueOnce(jsonOk({ ...COMPLETED_PROFILE, directness: null }));
    const confirmBox = within(directnessRow).getByRole('alert');
    fireEvent.click(within(confirmBox).getByRole('button', { name: '삭제' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/profile',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            onboardingState: 'completed',
            emojiPreference: 'neutral',
            formality: 'medium',
            honorificLevel: 'hapsyo',
          }),
        }),
      );
    });
  });

  it('학습된 항목 삭제 — 확인 후 DELETE /api/profile/learned/{id}를 호출하고 목록에서 제거한다', async () => {
    mockLoadSuccess(COMPLETED_PROFILE, [
      { id: 'item-1', patternKey: 'emoji_removed', value: 'avoids' },
    ]);
    render(<ProfilePage />);
    await waitFor(() => screen.getByText('이모지 선호'));

    const learnedRow = screen.getByText('이모지 선호').closest('li') as HTMLElement;
    fireEvent.click(within(learnedRow).getByRole('button', { name: '삭제' }));

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'item-1' }) });
    const confirmBox = within(learnedRow).getByRole('alert');
    fireEvent.click(within(confirmBox).getByRole('button', { name: '삭제' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/profile/learned/item-1', {
        method: 'DELETE',
      });
    });
    await waitFor(() => {
      expect(within(learnedRow).queryByText('학습됨')).toBeNull();
    });
  });

  it('실패 — 학습된 항목 삭제가 실패하면 인라인 에러를 보여주고 항목은 남는다(UX-009 Failure)', async () => {
    mockLoadSuccess(COMPLETED_PROFILE, [
      { id: 'item-1', patternKey: 'emoji_removed', value: 'avoids' },
    ]);
    render(<ProfilePage />);
    await waitFor(() => screen.getByText('이모지 선호'));

    const learnedRow = screen.getByText('이모지 선호').closest('li') as HTMLElement;
    fireEvent.click(within(learnedRow).getByRole('button', { name: '삭제' }));

    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    const confirmBox = within(learnedRow).getByRole('alert');
    fireEvent.click(within(confirmBox).getByRole('button', { name: '삭제' }));

    await waitFor(() => {
      expect(within(learnedRow).getByText('삭제하지 못했습니다, 다시 시도해주세요')).toBeTruthy();
    });
    expect(within(learnedRow).getByText('학습됨')).toBeTruthy();
  });
});
