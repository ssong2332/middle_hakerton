// T56 — UX-016 패널 (AC-052②, AC-053, AC-010, AC-066, AC-028 서브셋). Layer 2 레지스트리가 아직
// 비어 있으므로(T57 이전) 항상 ClipboardOnly다(`docs/UX.md:763` "the everyday state").
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { MediationResult } from '@cross-border/core';

vi.mock('../shared/token-storage', () => ({
  getStoredToken: vi.fn(),
}));
vi.mock('../shared/api', () => ({
  callMediationApi: vi.fn(),
}));

import { getStoredToken } from '../shared/token-storage';
import { callMediationApi } from '../shared/api';
import { MediationPanel } from './MediationPanel';
import type { Layer2Adapter } from './registry';

const mockedGetStoredToken = vi.mocked(getStoredToken);
const mockedCallMediationApi = vi.mocked(callMediationApi);

function successResult(overrides: Partial<MediationResult> = {}): MediationResult {
  return {
    urgency: 'NORMAL',
    urgencyReason: '근거',
    transformed: 'transformed text',
    reason: '이유',
    preserved: [],
    backTranslation: 'back translated',
    warnings: [],
    misreadRisks: [],
    holidayConflicts: [],
    personalizationApplied: false,
    source: 'live',
    stepSources: { c1: 'live', c2: 'live', c4: 'live' },
    ticketOption: { offered: false, basis: 'signal_absent' },
    ...overrides,
  };
}

describe('MediationPanel', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // AC-052② — 선택된 텍스트가 입력으로 채워진 상태로 패널이 열린다.
  it('opens pre-filled with the selected text', async () => {
    mockedGetStoredToken.mockResolvedValue('tok');
    render(<MediationPanel initialText="선택된 원문" onClose={vi.fn()} />);

    await waitFor(() => {
      expect((screen.getByLabelText('선택한 텍스트') as HTMLTextAreaElement).value).toBe(
        '선택된 원문',
      );
    });
  });

  // NotLoggedIn — 토큰이 없으면 실행을 시도하지 않고 로그인 안내를 보여준다.
  it('shows the NotLoggedIn state when no token is stored', async () => {
    mockedGetStoredToken.mockResolvedValue(null);
    render(<MediationPanel initialText="hello" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('로그인');
    });
    expect(mockedCallMediationApi).not.toHaveBeenCalled();
  });

  // AC-028 — 웹앱과 동일한 core 호출(`callMediationApi`가 그 경로). AC-066③ — 개인화 미적용 표시.
  it('runs mediation on explicit click and shows the personalization-off indicator', async () => {
    mockedGetStoredToken.mockResolvedValue('tok');
    mockedCallMediationApi.mockResolvedValue({ ok: true, data: successResult() });
    render(<MediationPanel initialText="hello" onClose={vi.fn()} />);

    await waitFor(() => screen.getByLabelText('선택한 텍스트'));
    fireEvent.click(screen.getByRole('button', { name: '중재 실행' }));

    await waitFor(() => {
      expect(screen.getByText(/개인화 미적용/)).toBeTruthy();
    });
    expect(mockedCallMediationApi).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'hello',
        context: expect.objectContaining({ channel: 'extension' }),
      }),
    );
  });

  // AC-053②③ — Layer 2 레지스트리가 비어 있으므로 "입력창에 삽입" 컨트롤은 절대 렌더되지 않는다
  // (absent, not disabled — `docs/UX.md:929`).
  it('never renders an Insert control (no Layer 2 adapter registered yet)', async () => {
    mockedGetStoredToken.mockResolvedValue('tok');
    mockedCallMediationApi.mockResolvedValue({ ok: true, data: successResult() });
    render(<MediationPanel initialText="hello" onClose={vi.fn()} />);

    await waitFor(() => screen.getByLabelText('선택한 텍스트'));
    fireEvent.click(screen.getByRole('button', { name: '중재 실행' }));
    await waitFor(() => screen.getByText(/개인화 미적용/));

    expect(screen.queryByRole('button', { name: /삽입/ })).toBeNull();
  });

  // AC-010/AC-053 — 클립보드 복사는 명시적 클릭에서만 일어나고, 결과가 없으면 복사 버튼이 없다.
  it('copies the final text to the clipboard only on an explicit click', async () => {
    mockedGetStoredToken.mockResolvedValue('tok');
    mockedCallMediationApi.mockResolvedValue({ ok: true, data: successResult() });
    render(<MediationPanel initialText="hello" onClose={vi.fn()} />);

    expect(screen.queryByRole('button', { name: '클립보드에 복사' })).toBeNull();

    await waitFor(() => screen.getByLabelText('선택한 텍스트'));
    fireEvent.click(screen.getByRole('button', { name: '중재 실행' }));
    await waitFor(() => screen.getByRole('button', { name: '클립보드에 복사' }));

    fireEvent.click(screen.getByRole('button', { name: '클립보드에 복사' }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('transformed text');
      expect(screen.getByText('복사됨')).toBeTruthy();
    });
  });

  // Fallback 배지 — stepSources.c2가 live가 아니면 NON_LIVE_NOTICE를 보여준다(AC-041).
  it('shows the non-live notice when the c2 step source is not live', async () => {
    mockedGetStoredToken.mockResolvedValue('tok');
    mockedCallMediationApi.mockResolvedValue({
      ok: true,
      data: successResult({
        stepSources: { c1: 'live', c2: 'fallback', c4: 'fallback' },
        source: 'fallback',
      }),
    });
    render(<MediationPanel initialText="hello" onClose={vi.fn()} />);

    await waitFor(() => screen.getByLabelText('선택한 텍스트'));
    fireEvent.click(screen.getByRole('button', { name: '중재 실행' }));

    await waitFor(() => {
      expect(screen.getByText('폴백 응답 사용 중')).toBeTruthy();
    });
  });

  // Error — LLM/네트워크 실패 시 배너 + 재시도, 원문은 유지된다(AC-029와 같은 패턴).
  it('shows an error banner and retains the pre-filled text on failure', async () => {
    mockedGetStoredToken.mockResolvedValue('tok');
    mockedCallMediationApi.mockResolvedValue({
      ok: false,
      reason: 'request-failed',
      error: { code: 'INTERNAL', message: '처리에 실패했습니다.', retryable: true },
    });
    render(<MediationPanel initialText="hello" onClose={vi.fn()} />);

    await waitFor(() => screen.getByLabelText('선택한 텍스트'));
    fireEvent.click(screen.getByRole('button', { name: '중재 실행' }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('처리에 실패했습니다.');
    });
    expect((screen.getByLabelText('선택한 텍스트') as HTMLTextAreaElement).value).toBe('hello');
  });

  it('calls onClose on Escape', async () => {
    mockedGetStoredToken.mockResolvedValue('tok');
    const onClose = vi.fn();
    render(<MediationPanel initialText="hello" onClose={onClose} />);

    await waitFor(() => screen.getByLabelText('선택한 텍스트'));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // M-3(reviewer) — navigator.clipboard.writeText가 거부되면(비-보안 컨텍스트, 포커스 상실,
  // 권한 거부 등) 조용히 죽지 않고 눈에 보이는 실패 메시지를 보여준다. "복사됨"으로 바뀌지 않는다.
  it('shows a visible error and does not report success when clipboard write fails', async () => {
    mockedGetStoredToken.mockResolvedValue('tok');
    mockedCallMediationApi.mockResolvedValue({ ok: true, data: successResult() });
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('clipboard denied')) },
    });
    render(<MediationPanel initialText="hello" onClose={vi.fn()} />);

    await waitFor(() => screen.getByLabelText('선택한 텍스트'));
    fireEvent.click(screen.getByRole('button', { name: '중재 실행' }));
    await waitFor(() => screen.getByRole('button', { name: '클립보드에 복사' }));

    fireEvent.click(screen.getByRole('button', { name: '클립보드에 복사' }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/복사/);
    });
    expect(screen.queryByText('복사됨')).toBeNull();
  });

  // M-4(reviewer) — chrome.storage.session이 access-level race 등으로 throw해도(getStoredToken이
  // reject해도) "확인 중…"에 무한히 머물지 않고 NotLoggedIn으로 빠진다.
  it('falls through to NotLoggedIn when getStoredToken rejects on mount', async () => {
    mockedGetStoredToken.mockRejectedValue(new Error('storage access error'));
    render(<MediationPanel initialText="hello" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('로그인');
    });
    expect(mockedCallMediationApi).not.toHaveBeenCalled();
  });

  // T57 — Layer 2 어댑터가 매칭되면 "입력창에 삽입"이 실제 활성화된 버튼으로 렌더된다
  // (AC-053② — 비활성/회색 버튼 금지). 클릭하면 findInput → insert 순으로 호출되고 성공 시
  // 확인 메시지가 뜬다. AC-040 — insert() 호출 외에 어떤 전송/제출 코드도 실행하지 않는다.
  describe('Insert into input field (Layer 2 adapter present)', () => {
    async function runToSuccess(adapter: Layer2Adapter) {
      mockedGetStoredToken.mockResolvedValue('tok');
      mockedCallMediationApi.mockResolvedValue({ ok: true, data: successResult() });
      render(<MediationPanel initialText="hello" onClose={vi.fn()} adapter={adapter} />);

      await waitFor(() => screen.getByLabelText('선택한 텍스트'));
      fireEvent.click(screen.getByRole('button', { name: '중재 실행' }));
      await waitFor(() => screen.getByRole('button', { name: '클립보드에 복사' }));
    }

    it('renders Insert as a real enabled button when an adapter matches', async () => {
      const inputEl = document.createElement('textarea');
      const insert = vi.fn().mockReturnValue(true);
      const adapter: Layer2Adapter = {
        id: 'github',
        matches: () => true,
        findInput: () => inputEl,
        insert,
      };
      await runToSuccess(adapter);

      const insertButton = screen.getByRole('button', { name: '입력창에 삽입' });
      expect(insertButton).not.toBeDisabled();
    });

    it('clicking Insert calls findInput then insert and shows a success confirmation', async () => {
      const inputEl = document.createElement('textarea');
      const findInput = vi.fn().mockReturnValue(inputEl);
      const insert = vi.fn().mockReturnValue(true);
      const adapter: Layer2Adapter = { id: 'github', matches: () => true, findInput, insert };
      await runToSuccess(adapter);

      fireEvent.click(screen.getByRole('button', { name: '입력창에 삽입' }));

      expect(findInput).toHaveBeenCalledTimes(1);
      expect(insert).toHaveBeenCalledWith(inputEl, 'transformed text');
      await waitFor(() => {
        expect(screen.getByText('삽입됨')).toBeTruthy();
      });
    });

    it('shows InsertFailed and keeps Copy working when findInput() returns null', async () => {
      const adapter: Layer2Adapter = {
        id: 'github',
        matches: () => true,
        findInput: () => null,
        insert: vi.fn().mockReturnValue(true),
      };
      await runToSuccess(adapter);

      fireEvent.click(screen.getByRole('button', { name: '입력창에 삽입' }));

      await waitFor(() => {
        expect(screen.getByRole('alert').textContent).toMatch(/삽입/);
      });
      expect(adapter.insert).not.toHaveBeenCalled();

      // Copy는 Insert 실패로 깨지지 않는다 (UX-016 InsertFailed — AC-053①).
      fireEvent.click(screen.getByRole('button', { name: '클립보드에 복사' }));
      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('transformed text');
        expect(screen.getByText('복사됨')).toBeTruthy();
      });
    });

    it('shows InsertFailed when insert() returns false', async () => {
      const inputEl = document.createElement('textarea');
      const adapter: Layer2Adapter = {
        id: 'github',
        matches: () => true,
        findInput: () => inputEl,
        insert: vi.fn().mockReturnValue(false),
      };
      await runToSuccess(adapter);

      fireEvent.click(screen.getByRole('button', { name: '입력창에 삽입' }));

      await waitFor(() => {
        expect(screen.getByRole('alert').textContent).toMatch(/삽입/);
      });
      expect(screen.queryByText('삽입됨')).toBeNull();
    });
  });
});
