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
  fetchKnownCounterparts: vi.fn(),
  addSample: vi.fn(),
}));

import { getStoredToken } from '../shared/token-storage';
import { addSample, callMediationApi, fetchKnownCounterparts } from '../shared/api';
import { MediationPanel } from './MediationPanel';
import type { Layer2Adapter } from './registry';

const mockedGetStoredToken = vi.mocked(getStoredToken);
const mockedCallMediationApi = vi.mocked(callMediationApi);
const mockedFetchKnownCounterparts = vi.mocked(fetchKnownCounterparts);
const mockedAddSample = vi.mocked(addSample);

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
    // T66 — 대부분의 기존 테스트는 수신자 후보와 무관하다. 기본값을 "규약 0건"으로 둬서
    // 각 테스트가 매번 이 목을 채우지 않아도 되게 한다(AC-067④와 같은 이유 — 빈 배열이 정상).
    mockedFetchKnownCounterparts.mockResolvedValue({ ok: true, counterparts: [] });
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

  // AC-061① — 4,500자 미만이면 길이 카운터가 뜨지 않는다.
  it('does not show the length counter under 4,500 characters', async () => {
    mockedGetStoredToken.mockResolvedValue('tok');
    render(<MediationPanel initialText={'a'.repeat(4499)} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText('선택한 텍스트')).toBeTruthy();
    });
    expect(screen.queryByText(/\/ 5,000자/)).toBeNull();
  });

  // AC-061①②③ — 6,000자(캡 초과)에서도 실행이 막히지 않고 카운터가 뜬다(웹앱과 동일 규칙).
  it('shows the length counter and keeps mediation enabled past the 5,000-char cap', async () => {
    mockedGetStoredToken.mockResolvedValue('tok');
    render(<MediationPanel initialText={'a'.repeat(6000)} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('6,000 / 5,000자')).toBeTruthy();
    });
    const button = screen.getByRole('button', { name: '중재 실행' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  // T66(AC-067④) — 규약이 0건이면 목록 컨트롤 자체가 없다(비활성 아님).
  it('does not render a recipient control when there are no known counterparts', async () => {
    mockedGetStoredToken.mockResolvedValue('tok');
    mockedFetchKnownCounterparts.mockResolvedValue({ ok: true, counterparts: [] });
    render(<MediationPanel initialText="hello" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText('선택한 텍스트')).toBeTruthy();
    });
    expect(screen.queryByLabelText('받는 사람 (선택)')).toBeNull();
  });

  // T66(AC-067①) — 규약이 있으면 상대 목록이 select 옵션으로 뜬다.
  it('renders known counterparts as select options', async () => {
    mockedGetStoredToken.mockResolvedValue('tok');
    mockedFetchKnownCounterparts.mockResolvedValue({
      ok: true,
      counterparts: ['tanaka@sakuradigital.example', 'michael@vertexlabs.example'],
    });
    render(<MediationPanel initialText="hello" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText('받는 사람 (선택)')).toBeTruthy();
    });
    const select = screen.getByLabelText('받는 사람 (선택)') as HTMLSelectElement;
    const optionValues = [...select.options].map((option) => option.value);
    expect(optionValues).toEqual(['', 'tanaka@sakuradigital.example', 'michael@vertexlabs.example']);
    expect(select.value).toBe(''); // 기본값 미지정 — 자동 선택하지 않는다.
  });

  // T66(AC-067①) — 상대를 고르고 실행하면 그 값이 recipient로 전달된다.
  it('sends the selected counterpart as recipient when running mediation', async () => {
    mockedGetStoredToken.mockResolvedValue('tok');
    mockedFetchKnownCounterparts.mockResolvedValue({
      ok: true,
      counterparts: ['tanaka@sakuradigital.example'],
    });
    mockedCallMediationApi.mockResolvedValue({ ok: true, data: successResult() });
    render(<MediationPanel initialText="hello" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText('받는 사람 (선택)')).toBeTruthy();
    });
    fireEvent.change(screen.getByLabelText('받는 사람 (선택)'), {
      target: { value: 'tanaka@sakuradigital.example' },
    });
    fireEvent.click(screen.getByRole('button', { name: '중재 실행' }));

    await waitFor(() => {
      expect(mockedCallMediationApi).toHaveBeenCalledWith(
        expect.objectContaining({ recipient: 'tanaka@sakuradigital.example' }),
      );
    });
  });

  // T66(AC-067④) — 조회가 실패해도(로그인 문제 등) 기존 미지정 경로가 그대로 동작한다.
  it('still runs mediation with recipient null when the counterparts fetch fails', async () => {
    mockedGetStoredToken.mockResolvedValue('tok');
    mockedFetchKnownCounterparts.mockResolvedValue({
      ok: false,
      reason: 'request-failed',
      error: { code: 'INTERNAL', message: 'boom', retryable: true },
    });
    mockedCallMediationApi.mockResolvedValue({ ok: true, data: successResult() });
    render(<MediationPanel initialText="hello" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText('선택한 텍스트')).toBeTruthy();
    });
    expect(screen.queryByLabelText('받는 사람 (선택)')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '중재 실행' }));

    await waitFor(() => {
      expect(mockedCallMediationApi).toHaveBeenCalledWith(
        expect.objectContaining({ recipient: null }),
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

      const insertButton = screen.getByRole('button', {
        name: '입력창에 삽입',
      }) as HTMLButtonElement;
      expect(insertButton.disabled).toBe(false);
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

    // M-1(reviewer) — `docs/UX.md:763`(States) · `docs/UX.md:760`(Exit) · `docs/UX.md:187`
    // (UF-011 step 7) 세 곳 모두 "성공적으로 삽입되면 패널이 닫힌다"고 명시한다.
    it('closes the panel (calls onClose) after a successful insert', async () => {
      const inputEl = document.createElement('textarea');
      const insert = vi.fn().mockReturnValue(true);
      const adapter: Layer2Adapter = { id: 'github', matches: () => true, findInput: () => inputEl, insert };
      mockedGetStoredToken.mockResolvedValue('tok');
      mockedCallMediationApi.mockResolvedValue({ ok: true, data: successResult() });
      const onClose = vi.fn();
      render(<MediationPanel initialText="hello" onClose={onClose} adapter={adapter} />);

      await waitFor(() => screen.getByLabelText('선택한 텍스트'));
      fireEvent.click(screen.getByRole('button', { name: '중재 실행' }));
      await waitFor(() => screen.getByRole('button', { name: '클립보드에 복사' }));

      fireEvent.click(screen.getByRole('button', { name: '입력창에 삽입' }));

      await waitFor(() => {
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    });

    // M-1(reviewer) — 실패 시에는 패널이 닫히면 안 된다. 사용자가 InsertFailed 메시지를 보고
    // 여전히 Copy를 쓸 수 있어야 한다(위 "keeps Copy working" 테스트와 같은 전제).
    it('does not close the panel when insert fails', async () => {
      const adapter: Layer2Adapter = {
        id: 'github',
        matches: () => true,
        findInput: () => null,
        insert: vi.fn().mockReturnValue(true),
      };
      mockedGetStoredToken.mockResolvedValue('tok');
      mockedCallMediationApi.mockResolvedValue({ ok: true, data: successResult() });
      const onClose = vi.fn();
      render(<MediationPanel initialText="hello" onClose={onClose} adapter={adapter} />);

      await waitFor(() => screen.getByLabelText('선택한 텍스트'));
      fireEvent.click(screen.getByRole('button', { name: '중재 실행' }));
      await waitFor(() => screen.getByRole('button', { name: '클립보드에 복사' }));

      fireEvent.click(screen.getByRole('button', { name: '입력창에 삽입' }));

      await waitFor(() => {
        expect(screen.getByRole('alert').textContent).toMatch(/삽입/);
      });
      expect(onClose).not.toHaveBeenCalled();
    });

    // M-2(reviewer) — 층 2 어댑터는 임의의 서드파티 페이지 DOM을 건드린다. `findInput`/`insert`가
    // throw해도 조용히 아무 일도 없는 것처럼 보이면 안 되고, InsertFailed와 동일하게 처리한다.
    it('shows InsertFailed (instead of crashing) when findInput() throws', async () => {
      const adapter: Layer2Adapter = {
        id: 'github',
        matches: () => true,
        findInput: () => {
          throw new Error('DOM structure changed');
        },
        insert: vi.fn().mockReturnValue(true),
      };
      mockedGetStoredToken.mockResolvedValue('tok');
      mockedCallMediationApi.mockResolvedValue({ ok: true, data: successResult() });
      const onClose = vi.fn();
      render(<MediationPanel initialText="hello" onClose={onClose} adapter={adapter} />);

      await waitFor(() => screen.getByLabelText('선택한 텍스트'));
      fireEvent.click(screen.getByRole('button', { name: '중재 실행' }));
      await waitFor(() => screen.getByRole('button', { name: '클립보드에 복사' }));

      fireEvent.click(screen.getByRole('button', { name: '입력창에 삽입' }));

      await waitFor(() => {
        expect(screen.getByRole('alert').textContent).toMatch(/삽입/);
      });
      expect(onClose).not.toHaveBeenCalled();

      // Copy는 여전히 동작해야 한다 (findInput이 throw해도 dead end가 아니다).
      fireEvent.click(screen.getByRole('button', { name: '클립보드에 복사' }));
      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('transformed text');
        expect(screen.getByText('복사됨')).toBeTruthy();
      });
    });

    it('shows InsertFailed (instead of crashing) when insert() throws', async () => {
      const inputEl = document.createElement('textarea');
      const adapter: Layer2Adapter = {
        id: 'github',
        matches: () => true,
        findInput: () => inputEl,
        insert: () => {
          throw new Error('detached node');
        },
      };
      mockedGetStoredToken.mockResolvedValue('tok');
      mockedCallMediationApi.mockResolvedValue({ ok: true, data: successResult() });
      render(<MediationPanel initialText="hello" onClose={vi.fn()} adapter={adapter} />);

      await waitFor(() => screen.getByLabelText('선택한 텍스트'));
      fireEvent.click(screen.getByRole('button', { name: '중재 실행' }));
      await waitFor(() => screen.getByRole('button', { name: '클립보드에 복사' }));

      fireEvent.click(screen.getByRole('button', { name: '입력창에 삽입' }));

      await waitFor(() => {
        expect(screen.getByRole('alert').textContent).toMatch(/삽입/);
      });
    });
  });
});

// 🔴 (2026-08-12, T81) 사용자 요청 ② — 패널이 항상 우상단 고정 위치에 떴고 선택 위치와 무관했다.
// `panel-mount.tsx`가 갖고 있던 `payload.rect`를 버리지 않고 `anchorRect` prop으로 넘기게
// 고쳤다 — 이 describe는 그 prop이 실제로 위치 계산(`computeClampedPosition` 재사용)에
// 쓰이는지, 그리고 prop이 없을 때는 기존 동작(우상단 고정)이 그대로 유지되는지 검증한다.
describe('MediationPanel — T81 anchorRect positioning', () => {
  beforeEach(() => {
    mockedGetStoredToken.mockResolvedValue('tok');
    mockedFetchKnownCounterparts.mockResolvedValue({ ok: true, counterparts: [] });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function fakeRect(overrides: Partial<DOMRect>): DOMRect {
    return {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON() {
        return this;
      },
      ...overrides,
    } as DOMRect;
  }

  it('positions near the anchorRect instead of the default top-right corner', async () => {
    const anchorRect = fakeRect({ top: 100, bottom: 120, left: 50, right: 150 });
    render(<MediationPanel initialText="x" onClose={vi.fn()} anchorRect={anchorRect} />);

    const panel = await screen.findByRole('dialog');
    // jsdom은 실제 레이아웃 엔진이 없어 패널 크기가 0×0으로 측정된다 — selection.test.ts와
    // 같은 제약(파일 상단 주석 참조). computeClampedPosition(anchorRect, {0,0}, jsdom 기본
    // 뷰포트)의 순수 산술 결과만 검증한다: below = 120+4 = 124(오버플로 없음), left = 50.
    expect(panel.style.top).toBe('124px');
    expect(panel.style.left).toBe('50px');
    expect(panel.style.right).toBe('');
  });

  it('falls back to the default top-right position when no anchorRect is given', async () => {
    render(<MediationPanel initialText="x" onClose={vi.fn()} />);

    const panel = await screen.findByRole('dialog');
    expect(panel.style.top).toBe('16px');
    expect(panel.style.right).toBe('16px');
    expect(panel.style.left).toBe('');
  });
});

// 🔴 (2026-08-12, T82) 사용자 재신고 — "패널이 드래그(스크롤) 시 여전히 고정돼 있다." T81은
// anchorRect로 마운트 시점 1회만 위치를 잡았고 스크롤을 반영하지 않았다.
//
// 🔴 (2026-08-12, T83) 첫 수정(`window.scrollY` 기반)이 중첩 스크롤 컨테이너에서 또 실패해
// `origin` 엘리먼트의 `getBoundingClientRect()` 델타 방식으로 교체했다 — 이 describe는
// `window.scrollY`가 **전혀 바뀌지 않아도**(중첩 컨테이너 스크롤을 흉내낸다) origin 엘리먼트의
// 측정값이 달라지면 패널이 그만큼 따라 움직이는지 검증한다. `getBoundingClientRect`는 jsdom에서
// 항상 0을 반환하므로(레이아웃 엔진 없음 — `selection.test.ts`와 같은 제약) 호출마다 다른 값을
// 주도록 스텁한다(1회차=마운트 시 측정, 2회차=스크롤 후 측정).
describe('MediationPanel — T82/T83 panel tracks scroll after opening', () => {
  function fakeRect(overrides: Partial<DOMRect>): DOMRect {
    return {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON() {
        return this;
      },
      ...overrides,
    } as DOMRect;
  }

  beforeEach(() => {
    mockedGetStoredToken.mockResolvedValue('tok');
    mockedFetchKnownCounterparts.mockResolvedValue({ ok: true, counterparts: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('repositions to follow the origin element even when window.scrollY never changes (nested scroll container)', async () => {
    const originEl = document.createElement('div');
    document.body.appendChild(originEl);
    // 마운트 시 origin을 두 번 읽는다(useLayoutEffect의 기준점 측정 1회 + 그 안에서 곧바로
    // 부르는 repositionNearAnchor()의 델타 계산용 측정 1회) — 둘 다 아직 스크롤 전이므로 같은
    // 값(300)이어야 한다. 이후 컨테이너 스크롤로 100px 위로 이동했다고 가정(3회차부터 200).
    const originRectSpy = vi
      .spyOn(originEl, 'getBoundingClientRect')
      .mockReturnValueOnce({ top: 300, left: 50 } as DOMRect)
      .mockReturnValueOnce({ top: 300, left: 50 } as DOMRect)
      .mockReturnValue({ top: 200, left: 50 } as DOMRect);

    // 클램프(0 이하로 내려가지 않음)에 걸리지 않도록 뷰포트 안쪽 값을 쓴다 — 이 테스트의
    // 목적은 스크롤 추적 산술 자체이지 clamp 경계 동작이 아니다(clamp 자체는
    // `computeClampedPosition`의 기존 단위 테스트가 이미 커버한다).
    const anchorRect = fakeRect({ top: 300, bottom: 320, left: 50, right: 150 });
    render(
      <MediationPanel initialText="x" onClose={vi.fn()} anchorRect={anchorRect} origin={originEl} />,
    );
    const panel = await screen.findByRole('dialog');
    expect(panel.style.top).toBe('324px');

    // window.scrollY는 건드리지 않는다 — 스크롤이 중첩 컨테이너 안에서 일어난 상황을 흉내낸다.
    // origin 엘리먼트가 100px 위로 이동한 것으로 측정되면(위 spy 2회차) 패널도 그만큼 따라가야
    // 한다. React state를 통해 갱신되므로(버튼의 직접 DOM 조작과 달리) `waitFor`로 리렌더를
    // 기다린다.
    document.dispatchEvent(new Event('scroll'));

    await waitFor(() => {
      expect(panel.style.top).toBe(`${324 - 100}px`);
    });
    expect(originRectSpy).toHaveBeenCalled();
  });

  it('does nothing when no anchorRect was given (default corner position is not scroll-tracked)', async () => {
    render(<MediationPanel initialText="x" onClose={vi.fn()} />);
    const panel = await screen.findByRole('dialog');
    expect(panel.style.top).toBe('16px');

    Object.defineProperty(window, 'scrollY', { value: 200, configurable: true });
    expect(() => document.dispatchEvent(new Event('scroll'))).not.toThrow();

    expect(panel.style.top).toBe('16px');
  });
});

// 🔴 (2026-08-12, T81) 사용자 요청 ① — 다크모드에서 패널 텍스트가 제대로 보이지 않았다(host
// 페이지 CSS를 상속하지 않는 Shadow DOM인데도 배경/텍스트가 하드코딩 라이트 팔레트 고정이었다).
// 실제 색상값이 아니라 "OS/브라우저가 다크를 선호하면 라이트 렌더와 다른 팔레트를 쓴다"는
// 구조적 사실만 검증한다(정확한 hex는 `theme.test.ts`가 이미 커버).
describe('MediationPanel — T81 dark mode', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    mockedGetStoredToken.mockResolvedValue('tok');
    mockedFetchKnownCounterparts.mockResolvedValue({ ok: true, counterparts: [] });
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    vi.clearAllMocks();
  });

  function mockPrefersDark(matches: boolean) {
    window.matchMedia = vi.fn().mockReturnValue({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia;
  }

  it('renders a different background/text color when the OS/browser prefers dark', async () => {
    mockPrefersDark(false);
    const { unmount } = render(<MediationPanel initialText="x" onClose={vi.fn()} />);
    const lightPanel = await screen.findByRole('dialog');
    const lightBg = lightPanel.style.background;
    unmount();

    mockPrefersDark(true);
    render(<MediationPanel initialText="x" onClose={vi.fn()} />);
    const darkPanel = await screen.findByRole('dialog');

    expect(darkPanel.style.background).not.toBe(lightBg);
  });
});

// T71(AC-080/081) — Mark 모드. 기본 모드는 여전히 "중재"(위 기존 테스트 전부가 이 기본값에
// 의존하므로 바꾸지 않는다) — 라디오로 "상대가 쓴 것으로 표시"를 선택해야 Mark UI가 나온다.
describe('MediationPanel — T71 Mark 모드', () => {
  beforeEach(() => {
    mockedFetchKnownCounterparts.mockResolvedValue({ ok: true, counterparts: [] });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function switchToMarkMode() {
    fireEvent.click(screen.getByRole('radio', { name: '상대가 쓴 것으로 표시' }));
  }

  it('기본 모드는 중재다 — Mark UI(상대 식별자 입력)가 처음엔 보이지 않는다', async () => {
    mockedGetStoredToken.mockResolvedValue('tok');
    render(<MediationPanel initialText="상대가 쓴 문장" onClose={vi.fn()} />);

    await waitFor(() => screen.getByLabelText('선택한 텍스트'));
    expect(screen.queryByLabelText('상대 식별자')).toBeNull();
  });

  it('모드를 전환하면 Mark UI가 나오고 중재 관련 컨트롤이 사라진다', async () => {
    mockedGetStoredToken.mockResolvedValue('tok');
    render(<MediationPanel initialText="상대가 쓴 문장" onClose={vi.fn()} />);
    await waitFor(() => screen.getByLabelText('선택한 텍스트'));

    switchToMarkMode();

    expect(screen.getByLabelText('상대 식별자')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '중재 실행' })).toBeNull();
  });

  it('AC-080② — 상대 식별자는 사용자가 직접 입력한다(DOM 발신자 추론 없음, 자유 텍스트 입력란뿐)', async () => {
    mockedGetStoredToken.mockResolvedValue('tok');
    render(<MediationPanel initialText="상대가 쓴 문장" onClose={vi.fn()} />);
    await waitFor(() => screen.getByLabelText('선택한 텍스트'));
    switchToMarkMode();

    const input = screen.getByLabelText('상대 식별자') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'boss@example.com' } });

    expect(input.value).toBe('boss@example.com');
  });

  it('Validation — 상대 식별자가 비어 있으면 "표본에 추가" 버튼이 비활성화된다', async () => {
    mockedGetStoredToken.mockResolvedValue('tok');
    render(<MediationPanel initialText="상대가 쓴 문장" onClose={vi.fn()} />);
    await waitFor(() => screen.getByLabelText('선택한 텍스트'));
    switchToMarkMode();

    const button = screen.getByRole('button', { name: '표본에 추가' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('AC-081①③ — "표본에 추가" 클릭 시 addSample에 넘기는 값에 원문 텍스트가 없고 집계값만 있다', async () => {
    mockedGetStoredToken.mockResolvedValue('tok');
    mockedAddSample.mockResolvedValue({
      ok: true,
      data: { id: 's-1', counterpart: 'boss@example.com', source: 'manual', collectedAt: '2026-08-11T00:00:00Z' },
    });
    render(<MediationPanel initialText="혹시 확인 가능하실까요? 감사합니다." onClose={vi.fn()} />);
    await waitFor(() => screen.getByLabelText('선택한 텍스트'));
    switchToMarkMode();
    fireEvent.change(screen.getByLabelText('상대 식별자'), { target: { value: 'boss@example.com' } });

    fireEvent.click(screen.getByRole('button', { name: '표본에 추가' }));

    await waitFor(() => expect(mockedAddSample).toHaveBeenCalledTimes(1));
    const [sentBody] = mockedAddSample.mock.calls[0];
    expect(sentBody.counterpart).toBe('boss@example.com');
    expect(sentBody.source).toBe('manual');
    expect(sentBody).not.toHaveProperty('text');
    expect(sentBody).not.toHaveProperty('rawText');
    expect(JSON.stringify(sentBody)).not.toContain('혹시 확인 가능하실까요');
    expect(sentBody.indicatorDeltas).toMatchObject({ hedgeCount: 1 });
  });

  it('MarkModeSuccess — 저장 성공 시 "표본에 추가됨"을 보여주고 패널을 닫지 않는다(onClose 미호출)', async () => {
    mockedGetStoredToken.mockResolvedValue('tok');
    mockedAddSample.mockResolvedValue({
      ok: true,
      data: { id: 's-1', counterpart: 'boss@example.com', source: 'manual', collectedAt: '2026-08-11T00:00:00Z' },
    });
    const onClose = vi.fn();
    render(<MediationPanel initialText="상대가 쓴 문장" onClose={onClose} />);
    await waitFor(() => screen.getByLabelText('선택한 텍스트'));
    switchToMarkMode();
    fireEvent.change(screen.getByLabelText('상대 식별자'), { target: { value: 'boss@example.com' } });

    fireEvent.click(screen.getByRole('button', { name: '표본에 추가' }));

    await waitFor(() => expect(screen.getByText('표본에 추가됨')).toBeTruthy());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('MarkModeError — 저장 실패 시 인라인 에러를 보여주고 입력값을 유지한다', async () => {
    mockedGetStoredToken.mockResolvedValue('tok');
    mockedAddSample.mockResolvedValue({
      ok: false,
      reason: 'request-failed',
      error: { code: 'INTERNAL', message: '실패', retryable: true },
    });
    render(<MediationPanel initialText="상대가 쓴 문장" onClose={vi.fn()} />);
    await waitFor(() => screen.getByLabelText('선택한 텍스트'));
    switchToMarkMode();
    fireEvent.change(screen.getByLabelText('상대 식별자'), { target: { value: 'boss@example.com' } });

    fireEvent.click(screen.getByRole('button', { name: '표본에 추가' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect((screen.getByLabelText('상대 식별자') as HTMLInputElement).value).toBe('boss@example.com');
  });

  it('addSample이 not-logged-in을 반환하면 NotLoggedIn 상태로 전환된다', async () => {
    mockedGetStoredToken.mockResolvedValue('tok');
    mockedAddSample.mockResolvedValue({ ok: false, reason: 'not-logged-in' });
    render(<MediationPanel initialText="상대가 쓴 문장" onClose={vi.fn()} />);
    await waitFor(() => screen.getByLabelText('선택한 텍스트'));
    switchToMarkMode();
    fireEvent.change(screen.getByLabelText('상대 식별자'), { target: { value: 'boss@example.com' } });

    fireEvent.click(screen.getByRole('button', { name: '표본에 추가' }));

    await waitFor(() => {
      expect(screen.getByText('로그인이 필요합니다. 웹앱에서 먼저 확장을 연결해 주세요.')).toBeTruthy();
    });
  });
});
