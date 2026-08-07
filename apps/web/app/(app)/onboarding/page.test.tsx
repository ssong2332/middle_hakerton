/**
 * UX-003 Onboarding Profile Questionnaire — `docs/UX.md` Screen Catalog (Screen ID: UX-003).
 * AC-011, AC-046②, AC-059.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import OnboardingPage from './page';

function answerAllQuestions() {
  fireEvent.click(screen.getByLabelText('직설적으로 표현하는 편이에요'));
  fireEvent.click(screen.getByLabelText('가끔 써요'));
  fireEvent.click(screen.getByLabelText('보통'));
  fireEvent.click(screen.getByLabelText('합쇼체 (합니다/입니다)'));
}

describe('OnboardingPage (UX-003) — AC-011/AC-046②/AC-059', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('AC-011 — 직설/완곡·이모지 선호·격식도 3문항을 렌더한다', () => {
    render(<OnboardingPage />);
    expect(screen.getByText(/어느 쪽에 가깝나요/)).toBeTruthy();
    expect(screen.getByText(/이모지를 메시지에 사용/)).toBeTruthy();
    expect(screen.getByText(/격식 수준/)).toBeTruthy();
  });

  it('AC-046② — 존댓말 레벨(합쇼체/해요체) 문항을 렌더한다(EN→KO 기본값)', () => {
    render(<OnboardingPage />);
    expect(screen.getByLabelText('합쇼체 (합니다/입니다)')).toBeTruthy();
    expect(screen.getByLabelText('해요체 (해요/이에요)')).toBeTruthy();
  });

  it('문항 수는 정확히 4개다(직설/완곡·이모지·격식도·존댓말 레벨, 5개 상한 이내)', () => {
    const { container } = render(<OnboardingPage />);
    expect(container.querySelectorAll('fieldset').length).toBe(4);
  });

  // 🔴 이 파일은 `@testing-library/jest-dom`을 설치하지 않는다(`apps/web/vitest.setup.ts` 헤더
  // 참조) — `toBeDisabled()` 대신 vitest 기본 매처로 `.disabled` 프로퍼티를 직접 읽는다
  // (`apps/web/app/(auth)/signup/page.test.tsx`와 같은 관례).
  it('아무것도 답하지 않으면 완료 버튼이 비활성화된다(전부 응답 또는 전부 스킵만 허용)', () => {
    render(<OnboardingPage />);
    expect((screen.getByRole('button', { name: '완료' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('4문항을 모두 답하면 완료 버튼이 활성화된다', () => {
    render(<OnboardingPage />);
    answerAllQuestions();
    expect((screen.getByRole('button', { name: '완료' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  // M-3(reviewer) — `docs/UX.md` Interaction Patterns → Validation: hint는 첫 blur 또는 첫 제출
  // 시도에만 나타난다. 첫 페인트에서 4문항 전부 미응답이어도 힌트가 없어야 한다.
  it('M-3 — 첫 렌더에서는 미응답 힌트("선택해주세요")를 보여주지 않는다', () => {
    render(<OnboardingPage />);
    expect(screen.queryByText('선택해주세요')).toBeNull();
  });

  it('M-3 — 라디오에서 blur하면 그 문항에만 미응답 힌트를 보여준다', () => {
    render(<OnboardingPage />);
    fireEvent.blur(screen.getByLabelText('직설적으로 표현하는 편이에요'));
    expect(screen.getAllByText('선택해주세요').length).toBe(1);
  });

  it('AC-059① — 건너뛰기 버튼은 아무것도 답하지 않아도 항상 활성화되어 있다', () => {
    render(<OnboardingPage />);
    expect(
      (screen.getByRole('button', { name: '건너뛰기' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('AC-059①② — 건너뛰기를 누르면 스타일 필드 없이 skipped 상태로 저장하고 /mediate로 이동한다', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ onboardingState: 'skipped' }) });
    render(<OnboardingPage />);

    fireEvent.click(screen.getByRole('button', { name: '건너뛰기' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/profile',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ onboardingState: 'skipped' }),
        }),
      );
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/mediate');
    });
  });

  it('완료 경로 — 4개 답을 채우고 제출하면 completed 상태로 4개 값을 저장하고 /mediate로 이동한다', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ onboardingState: 'completed' }) });
    render(<OnboardingPage />);
    answerAllQuestions();

    fireEvent.click(screen.getByRole('button', { name: '완료' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/profile',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            onboardingState: 'completed',
            directness: 'direct',
            emojiPreference: 'neutral',
            formality: 'medium',
            honorificLevel: 'hapsyo',
          }),
        }),
      );
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/mediate');
    });
  });

  it('저장 실패 시 배너와 재시도 버튼을 보여주고, 이동하지 않는다', async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    render(<OnboardingPage />);

    fireEvent.click(screen.getByRole('button', { name: '건너뛰기' }));

    await waitFor(() => {
      expect(screen.getByText('저장하지 못했습니다, 다시 시도해주세요')).toBeTruthy();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('저장 실패 후 재시도를 누르면 같은 선택(건너뛰기)으로 다시 시도한다', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ onboardingState: 'skipped' }) });
    render(<OnboardingPage />);

    fireEvent.click(screen.getByRole('button', { name: '건너뛰기' }));
    await waitFor(() => {
      expect(screen.getByText('저장하지 못했습니다, 다시 시도해주세요')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/mediate');
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
