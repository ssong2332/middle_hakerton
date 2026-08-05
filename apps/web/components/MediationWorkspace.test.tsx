/**
 * T13/T14 — `MediationWorkspace` (UX-004 본체). AC-009(2패널 동시 표시) + AC-010(명시적 승인
 * 없이는 전송 없음). `apps/web/components/MediationDemoForm.tsx`가 예고한 대로 이 컴포넌트가
 * 그 최소 하네스를 흡수·대체한다 — T6/T8/T9/T10 조각(`BackTranslationPreview`/`UrgencyPanel`)을
 * 그대로 재사용한다.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MediationWorkspace } from './MediationWorkspace';

function mediateSuccessResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: async () => ({
      urgency: 'NORMAL',
      urgencyReason: '일반 업무 요청입니다.',
      transformed: 'Please confirm by tomorrow.',
      reason: '완곡 표현을 명시적 요청으로 변환했습니다.',
      preserved: [],
      backTranslation: '내일까지 확인 부탁드립니다.',
      warnings: [],
      misreadRisks: [],
      holidayConflicts: [],
      personalizationApplied: true,
      source: 'live',
      // 🔴 F1-e(2026-08-05 — DECISIONS #48 · ADR-0009) 13번째 필드. 기본값은 세 스텝 모두 live —
      // 폴백 배지를 켜야 하는 테스트는 `overrides.stepSources`로 개별 스텝 값을 지정한다
      // (`SenderPanel.tsx`가 이제 합산 `source`가 아니라 `stepSources.c2`/`.c4`를 각 영역에
      // 전달하므로, `source`만 바꾸는 것으로는 더 이상 배지가 뜨지 않는다).
      stepSources: { c1: 'live', c2: 'live', c4: 'live' },
      ticketOption: { offered: false, basis: 'signal_absent' },
      ...overrides,
    }),
  };
}

function fillAndRun() {
  fireEvent.change(screen.getByLabelText('받는 사람'), {
    target: { value: 'boss@example.com' },
  });
  fireEvent.change(screen.getByLabelText('메시지'), {
    target: { value: '내일까지 확인 부탁드립니다.' },
  });
  fireEvent.click(screen.getByRole('button', { name: '실행' }));
}

describe('MediationWorkspace', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('AC-009 — 발신자 패널과 수신자 패널이 한 화면에 동시에 표시된다', () => {
    render(<MediationWorkspace />);

    expect(screen.getByLabelText('발신자 패널')).toBeTruthy();
    expect(screen.getByLabelText('수신자 패널')).toBeTruthy();
  });

  it('접근성 — DOM 순서가 발신자 패널 다음 수신자 패널이다(Sender-panel-then-Recipient-panel)', () => {
    render(<MediationWorkspace />);

    const sections = screen.getAllByRole('region');
    const senderIndex = sections.findIndex((el) => el.getAttribute('aria-label') === '발신자 패널');
    const recipientIndex = sections.findIndex(
      (el) => el.getAttribute('aria-label') === '수신자 패널',
    );
    expect(senderIndex).toBeGreaterThanOrEqual(0);
    expect(senderIndex).toBeLessThan(recipientIndex);
  });

  it('AC-010 — 중재 실행만으로는 POST /api/messages가 호출되지 않는다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mediateSuccessResponse());
    vi.stubGlobal('fetch', fetchMock);

    render(<MediationWorkspace />);
    fillAndRun();

    await waitFor(() => {
      expect(screen.getAllByText('Please confirm by tomorrow.').length).toBeGreaterThan(0);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/mediate',
      expect.objectContaining({ method: 'POST' }),
    );
    const messagesCalls = fetchMock.mock.calls.filter(([url]) => url === '/api/messages');
    expect(messagesCalls).toHaveLength(0);
  });

  it('AC-010 — 승인 버튼을 명시적으로 클릭해야만 POST /api/messages가 호출된다', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/mediate') return Promise.resolve(mediateSuccessResponse());
      if (url === '/api/messages') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            messageId: 'msg-1',
            diffId: 'diff-1',
            sentAt: '2026-08-05T10:00:00Z',
            patternKey: null,
            learnedApplied: false,
          }),
        });
      }
      throw new Error(`unexpected url: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MediationWorkspace />);
    fillAndRun();

    await waitFor(() => {
      expect(screen.getAllByText('Please confirm by tomorrow.').length).toBeGreaterThan(0);
    });

    const recipientPanel = screen.getByLabelText('수신자 패널');
    const approveButton = within(recipientPanel).getByRole('button', { name: /승인/ });
    fireEvent.click(approveButton);

    await waitFor(() => {
      const messagesCalls = fetchMock.mock.calls.filter(([url]) => url === '/api/messages');
      expect(messagesCalls).toHaveLength(1);
    });

    const [, requestInit] = fetchMock.mock.calls.find(([url]) => url === '/api/messages')!;
    const requestBody = JSON.parse((requestInit as RequestInit).body as string);
    expect(requestBody).toMatchObject({
      originalText: '내일까지 확인 부탁드립니다.',
      finalText: 'Please confirm by tomorrow.',
      aiSuggestedText: 'Please confirm by tomorrow.',
      urgency: 'NORMAL',
      recipient: 'boss@example.com',
      channel: 'web_mock',
      mediationApplied: true,
    });

    await waitFor(() => {
      expect(within(recipientPanel).getByText(/발송됨/)).toBeTruthy();
    });
  });

  // MJ-4 — 클라이언트가 `Idempotency-Key` 헤더를 생성·전송하지 않으면(서버는 이미 수용 가능,
  // `apps/web/lib/messages/idempotency.ts` + `apps/web/app/api/messages/route.ts`) 응답 유실 후
  // 재시도 시 `sent_messages`/`diff_records`에 중복 1쌍이 생길 수 있다. 요청마다 고유 키를
  // 생성해 헤더로 보내는지 확인한다.
  it('MJ-4 — 승인 요청에 Idempotency-Key 헤더를 값과 함께 보낸다', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/mediate') return Promise.resolve(mediateSuccessResponse());
      if (url === '/api/messages') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            messageId: 'msg-1',
            diffId: 'diff-1',
            sentAt: '2026-08-05T10:00:00Z',
            patternKey: null,
            learnedApplied: false,
          }),
        });
      }
      throw new Error(`unexpected url: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MediationWorkspace />);
    fillAndRun();

    await waitFor(() => {
      expect(screen.getAllByText('Please confirm by tomorrow.').length).toBeGreaterThan(0);
    });

    const recipientPanel = screen.getByLabelText('수신자 패널');
    fireEvent.click(within(recipientPanel).getByRole('button', { name: /승인/ }));

    await waitFor(() => {
      const messagesCalls = fetchMock.mock.calls.filter(([url]) => url === '/api/messages');
      expect(messagesCalls).toHaveLength(1);
    });

    const [, requestInit] = fetchMock.mock.calls.find(([url]) => url === '/api/messages')!;
    const headers = new Headers((requestInit as RequestInit).headers);
    const idempotencyKey = headers.get('Idempotency-Key');
    expect(idempotencyKey).toBeTruthy();
    expect(idempotencyKey!.length).toBeGreaterThan(0);
  });

  // MJ-4-2(reviewer 재검토, Major 1 → 수정) — 위 테스트는 값이 "있다"만 확인해 `Math.random()`
  // 처럼 매 호출마다 재생성되는 구현도 통과시켰다. 의도한 시나리오(응답 유실 후 같은 키로
  // 재시도 → 서버가 중복 저장 대신 첫 응답을 재사용)는 같은 승인 시도 안에서 키가 "고정"돼야만
  // 성립한다. 첫 승인이 실패한 뒤(같은 스냅샷·같은 최종문으로) 재시도하면 두 번째 요청도 첫
  // 요청과 **같은** Idempotency-Key를 보내는지 확인한다.
  it('MJ-4-2 — 승인 실패 후(같은 스냅샷으로) 재시도하면 이전과 동일한 Idempotency-Key를 보낸다', async () => {
    let messagesCallCount = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/mediate') return Promise.resolve(mediateSuccessResponse());
      if (url === '/api/messages') {
        messagesCallCount += 1;
        if (messagesCallCount === 1) {
          return Promise.resolve({
            ok: false,
            json: async () => ({
              error: { code: 'INTERNAL', message: '전송 실패', retryable: true },
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            messageId: 'msg-1',
            diffId: 'diff-1',
            sentAt: '2026-08-05T10:00:00Z',
            patternKey: null,
            learnedApplied: false,
          }),
        });
      }
      throw new Error(`unexpected url: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MediationWorkspace />);
    fillAndRun();

    await waitFor(() => {
      expect(screen.getAllByText('Please confirm by tomorrow.').length).toBeGreaterThan(0);
    });

    const recipientPanel = screen.getByLabelText('수신자 패널');
    fireEvent.click(within(recipientPanel).getByRole('button', { name: /승인/ }));

    await waitFor(() => {
      expect(within(recipientPanel).getByRole('alert')).toBeTruthy();
    });

    // 원문·수신자·최종문 어느 것도 바꾸지 않고 그대로 재시도한다.
    fireEvent.click(within(recipientPanel).getByRole('button', { name: /승인/ }));

    await waitFor(() => {
      const messagesCalls = fetchMock.mock.calls.filter(([url]) => url === '/api/messages');
      expect(messagesCalls).toHaveLength(2);
    });

    const messagesCalls = fetchMock.mock.calls.filter(([url]) => url === '/api/messages');
    const firstKey = new Headers((messagesCalls[0][1] as RequestInit).headers).get(
      'Idempotency-Key',
    );
    const secondKey = new Headers((messagesCalls[1][1] as RequestInit).headers).get(
      'Idempotency-Key',
    );
    expect(firstKey).toBeTruthy();
    expect(secondKey).toBe(firstKey);
  });

  it('중재 결과가 없으면 승인 버튼 자체가 없다(승인 대상 없음)', () => {
    render(<MediationWorkspace />);

    const recipientPanel = screen.getByLabelText('수신자 패널');
    expect(within(recipientPanel).queryByRole('button', { name: /승인/ })).toBeNull();
  });

  // 🔴 Critical(reviewer REJECTED → 수정) — 승인이 라이브 상태를 읽어 검토 안 한 텍스트가
  // 발송될 수 있었다. 실행 성공 후(재실행 없이) 원문을 편집하면 승인 버튼이 비활성화되어야
  // 한다(`docs/UX.md` UX-004 Validation "Approve & Send enabled only after a successful
  // mediation run exists for the current text").
  it('Critical — 실행 성공 후 재실행 없이 원문을 편집하면 승인 버튼이 비활성화된다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mediateSuccessResponse());
    vi.stubGlobal('fetch', fetchMock);

    render(<MediationWorkspace />);
    fillAndRun();

    await waitFor(() => {
      expect(screen.getAllByText('Please confirm by tomorrow.').length).toBeGreaterThan(0);
    });

    const recipientPanel = screen.getByLabelText('수신자 패널');
    expect(
      (within(recipientPanel).getByRole('button', { name: /승인/ }) as HTMLButtonElement).disabled,
    ).toBe(false);

    // 재실행 없이 원문만 편집한다 — 이 편집은 아직 어떤 중재 결과로도 검토되지 않았다.
    fireEvent.change(screen.getByLabelText('메시지'), {
      target: { value: '내일까지 확인 부탁드립니다. 그리고 다른 안건도 추가합니다.' },
    });

    const approveButton = within(recipientPanel).getByRole('button', {
      name: /승인/,
    }) as HTMLButtonElement;
    expect(approveButton.disabled).toBe(true);
  });

  // 🔴 Major 4(reviewer 재검토 → 수정) — `SenderPanel`이 `originalTextSnapshot` prop을 잘
  // 전달하는지는 `SenderPanel.test.tsx` MJ-5가 이미 검증하지만, `MediationWorkspace`가 실제로
  // 올바른 값(`approvalSnapshot?.text ?? text`)을 그 prop에 실어 보내는지는 어떤 테스트도
  // 검증하지 않았다 — 그 줄을 `text`로 되돌려도 전체 스위트가 green으로 남았다. 여기서 배선
  // 자체를 통합 레벨로 확인한다: 실행 성공 → 재실행 없이 원문을 편집 → 비교 뷰의 "원문" 컬럼에는
  // 편집 전(스냅샷) 텍스트가 계속 보이고, 편집한 새 텍스트는 보이지 않는다.
  it('Major 4 — 실행 성공 후 재실행 없이 원문을 편집해도 비교 뷰의 원문은 편집 전 스냅샷 그대로다(originalTextSnapshot 배선)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mediateSuccessResponse());
    vi.stubGlobal('fetch', fetchMock);

    render(<MediationWorkspace />);
    fillAndRun();

    await waitFor(() => {
      expect(screen.getAllByText('Please confirm by tomorrow.').length).toBeGreaterThan(0);
    });

    const comparisonView = screen.getByLabelText('원문·변환문·변환 이유 비교');
    expect(within(comparisonView).getByText('내일까지 확인 부탁드립니다.')).toBeTruthy();

    // 재실행 없이 원문만 편집한다 — 이 편집은 아직 어떤 중재 결과로도 검토되지 않았다.
    fireEvent.change(screen.getByLabelText('메시지'), {
      target: { value: '편집한 새 원문(아직 검토되지 않음)' },
    });

    expect(within(comparisonView).getByText('내일까지 확인 부탁드립니다.')).toBeTruthy();
    expect(within(comparisonView).queryByText('편집한 새 원문(아직 검토되지 않음)')).toBeNull();
  });

  // 🔴 M1(reviewer 최종 APPROVED, Major 비차단 → 수정) — 재실행 없이 긴급도만 override하면
  // 배지는 즉시 바뀌지만 승인은 여전히 활성 상태였고 전송되는 값은 스냅샷의 원래 등급이라
  // 문면(배지)과 실제 전송값이 어긋났다. text/recipient와 동일한 규칙으로, override가
  // 스냅샷의 등급과 달라지면 재실행 전까지 승인을 막는다(`docs/UX.md` UX-004 Validation
  // "for the current text").
  it('M1 — 재실행 없이 긴급도만 override하면 승인 버튼이 비활성화된다(text/recipient와 동일 규칙)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mediateSuccessResponse());
    vi.stubGlobal('fetch', fetchMock);

    render(<MediationWorkspace />);
    fillAndRun();

    await waitFor(() => {
      expect(screen.getAllByText('Please confirm by tomorrow.').length).toBeGreaterThan(0);
    });

    const recipientPanel = screen.getByLabelText('수신자 패널');
    expect(
      (within(recipientPanel).getByRole('button', { name: /승인/ }) as HTMLButtonElement).disabled,
    ).toBe(false);

    fireEvent.change(screen.getByLabelText('긴급도 조정'), { target: { value: 'CRITICAL' } });
    expect(screen.getByText('사용자가 등급을 조정했습니다')).toBeTruthy();

    const approveButton = within(recipientPanel).getByRole('button', {
      name: /승인/,
    }) as HTMLButtonElement;
    expect(approveButton.disabled).toBe(true);
  });

  // M1 — override 후 재실행하면 override가 실제로 반영된 새 스냅샷이 생기고, 승인은 그 새
  // 스냅샷(재실행 결과)의 값을 전송한다 — 검토되지 않은 라이브 override 값이 아니라 항상
  // "실제로 실행·검토된" 값만 전송된다는 불변식은 유지된다.
  it('M1 — override 후 재실행하면 승인 버튼이 다시 활성화되고 재실행 결과(override 반영)의 값이 전송된다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mediateSuccessResponse({ urgency: 'NORMAL' }))
      .mockResolvedValueOnce(mediateSuccessResponse({ urgency: 'CRITICAL' }))
      .mockImplementation((url: string) => {
        if (url === '/api/messages') {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              messageId: 'msg-1',
              diffId: 'diff-1',
              sentAt: '2026-08-05T10:00:00Z',
              patternKey: null,
              learnedApplied: false,
            }),
          });
        }
        throw new Error(`unexpected url: ${url}`);
      });
    vi.stubGlobal('fetch', fetchMock);

    render(<MediationWorkspace />);
    fillAndRun();

    await waitFor(() => {
      expect(screen.getAllByText('Please confirm by tomorrow.').length).toBeGreaterThan(0);
    });

    fireEvent.change(screen.getByLabelText('긴급도 조정'), { target: { value: 'CRITICAL' } });

    const recipientPanel = screen.getByLabelText('수신자 패널');
    let approveButton = within(recipientPanel).getByRole('button', {
      name: /승인/,
    }) as HTMLButtonElement;
    expect(approveButton.disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '실행' }));

    await waitFor(() => {
      expect(screen.getByText('CRITICAL', { selector: 'strong' })).toBeTruthy();
    });

    approveButton = within(recipientPanel).getByRole('button', {
      name: /승인/,
    }) as HTMLButtonElement;
    expect(approveButton.disabled).toBe(false);
    fireEvent.click(approveButton);

    await waitFor(() => {
      const messagesCalls = fetchMock.mock.calls.filter(([url]) => url === '/api/messages');
      expect(messagesCalls).toHaveLength(1);
    });

    const [, requestInit] = fetchMock.mock.calls.find(([url]) => url === '/api/messages')!;
    const requestBody = JSON.parse((requestInit as RequestInit).body as string);
    expect(requestBody.urgency).toBe('CRITICAL');
  });

  // 🔴 Major 1(reviewer REJECTED → 수정) — 실패 후 직전 성공 결과의 승인이 사라졌다. 수신자
  // 패널이 Empty 문구로 되돌아가면 안 된다(`docs/UX.md` UX-004 Failure "if a prior successful
  // transformation exists, approval of that last-good version remains possible").
  it('Major 1 — 성공 후 같은 원문으로 재실행이 실패해도 직전 성공 결과의 승인은 계속 가능하다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mediateSuccessResponse())
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { code: 'INTERNAL', message: '처리 중 오류', retryable: true },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    render(<MediationWorkspace />);
    fillAndRun();

    await waitFor(() => {
      expect(screen.getAllByText('Please confirm by tomorrow.').length).toBeGreaterThan(0);
    });

    // 원문을 바꾸지 않고 재실행 → 실패
    fireEvent.click(screen.getByRole('button', { name: '실행' }));

    await waitFor(() => {
      expect(screen.getByText('처리에 실패했습니다')).toBeTruthy();
    });

    const recipientPanel = screen.getByLabelText('수신자 패널');
    // Empty 상태 안내 문구로 되돌아가지 않는다.
    expect(within(recipientPanel).queryByText(/실행하면/)).toBeNull();
    const approveButton = within(recipientPanel).getByRole('button', {
      name: /승인/,
    }) as HTMLButtonElement;
    expect(approveButton.disabled).toBe(false);
  });

  // 🔴 M-2(2026-08-05, reviewer REJECTED → 수정) — 위 Major 1 테스트는 수신자 패널(승인 가능
  // 여부)만 확인했다. 발신자 패널의 결과 블록은 `status==='success'` 단독 조건에 묶여 있어서,
  // 재실행이 실패하면 "폴백 응답 사용 중" 라벨까지 함께 사라진 채로 승인 가능한 상태가 될 수
  // 있었다(AC-041 위반 — 승인 직전에 폴백 표시가 사라짐). 승인 가능한 스냅샷(hasResult)이 있으면
  // 발신자 패널의 결과 블록도 status와 무관하게 유지되어야 한다.
  it('M-2 — 재실행이 실패해도 직전 성공 결과의 폴백 배지가 발신자 패널에서 사라지지 않는다', async () => {
    // 🔴 F1-e — `source: 'fallback'`만으로는 더 이상 배지가 뜨지 않는다(SenderPanel이 이제
    // `stepSources.c2`/`.c4`를 각 영역에 넘긴다). C2를 fallback으로 지정해 비교 뷰 배지를 켠다
    // (worst(stepSources) === 'fallback'과도 일치하도록 합산 `source`도 함께 'fallback').
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mediateSuccessResponse({
          source: 'fallback',
          stepSources: { c1: 'live', c2: 'fallback', c4: 'live' },
        }),
      )
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { code: 'INTERNAL', message: '처리 중 오류', retryable: true },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    render(<MediationWorkspace />);
    fillAndRun();

    await waitFor(() => {
      expect(screen.getAllByText('Please confirm by tomorrow.').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('폴백 응답 사용 중')).toBeTruthy();

    // 원문을 바꾸지 않고 재실행 → 실패
    fireEvent.click(screen.getByRole('button', { name: '실행' }));

    await waitFor(() => {
      expect(screen.getByText('처리에 실패했습니다')).toBeTruthy();
    });

    const senderPanel = screen.getByLabelText('발신자 패널');
    expect(within(senderPanel).getByText('폴백 응답 사용 중')).toBeTruthy();
    expect(within(senderPanel).getByText('Please confirm by tomorrow.')).toBeTruthy();
  });

  // Major 3(reviewer REJECTED → 수정) — 삭제된 `MediationDemoForm.test.tsx`의 커버리지를
  // `MediationWorkspace.test.tsx`로 이식한다.
  it('Major 3① — personalizationApplied가 false면 개인화 미적용 안내를 표시한다(AC-059③/AC-066③)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mediateSuccessResponse({ personalizationApplied: false }));
    vi.stubGlobal('fetch', fetchMock);

    render(<MediationWorkspace />);
    fillAndRun();

    await waitFor(() => {
      expect(screen.getByText('개인화 미적용 — 기본 변환만 적용되었습니다')).toBeTruthy();
    });
  });

  it('Major 3② — override한 값이 다음 실행 요청의 context.urgencyOverride에 실린다(AC-004)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mediateSuccessResponse());
    vi.stubGlobal('fetch', fetchMock);

    render(<MediationWorkspace />);
    fillAndRun();

    await waitFor(() => {
      expect(screen.getAllByText('Please confirm by tomorrow.').length).toBeGreaterThan(0);
    });

    fireEvent.change(screen.getByLabelText('긴급도 조정'), { target: { value: 'CRITICAL' } });
    fireEvent.click(screen.getByRole('button', { name: '실행' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const secondCall = fetchMock.mock.calls[1];
    const secondBody = JSON.parse((secondCall[1] as RequestInit).body as string);
    expect(secondBody.context.urgencyOverride).toBe('CRITICAL');
  });

  it('Major 3③ — override를 반영해 재실행해도 "사용자가 등급을 조정했습니다" 안내가 유지된다(근거-등급 모순 방지)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mediateSuccessResponse({
          urgency: 'NORMAL',
          urgencyReason: '일반 업무 요청으로 보입니다.',
        }),
      )
      .mockResolvedValueOnce(
        mediateSuccessResponse({
          urgency: 'CRITICAL',
          urgencyReason: '일반 업무 요청으로 보입니다.',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(<MediationWorkspace />);
    fillAndRun();

    await waitFor(() => {
      expect(screen.getByText('NORMAL', { selector: 'strong' })).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText('긴급도 조정'), { target: { value: 'CRITICAL' } });
    expect(screen.getByText('사용자가 등급을 조정했습니다')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '실행' }));

    await waitFor(() => {
      expect(screen.getByText('CRITICAL', { selector: 'strong' })).toBeTruthy();
    });
    expect(screen.getByText('사용자가 등급을 조정했습니다')).toBeTruthy();
  });

  it('Major 3④ — 실행이 실패하면 배너를 보여주고 작성 중이던 원문을 지우지 않는다(AC-029)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { code: 'INTERNAL', message: '처리 중 오류', retryable: true } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MediationWorkspace />);
    fillAndRun();

    await waitFor(() => {
      expect(screen.getByText('처리에 실패했습니다')).toBeTruthy();
    });

    expect((screen.getByLabelText('메시지') as HTMLTextAreaElement).value).toBe(
      '내일까지 확인 부탁드립니다.',
    );
  });

  // Major 4(reviewer REJECTED → 수정) — AC-009 "나란히"가 시각적으로 구현되지 않았다. 이 리포에는
  // 시각 회귀 도구가 없으므로(`docs/CodingRules.md` "E2E 도구... 도입하지 않는다"), 레이아웃이
  // 실제로 가로 배치(flex/grid)로 구현됐는지를 구조적으로 확인하는 것이 가능한 최선의 검증이다.
  it('Major 4/AC-009 — 발신자·수신자 패널이 flex 컨테이너 안에서 가로로 나란히 배치된다', () => {
    render(<MediationWorkspace />);

    const senderPanel = screen.getByLabelText('발신자 패널');
    const recipientPanel = screen.getByLabelText('수신자 패널');
    // 각 패널은 flex 컨테이너의 자식 컬럼(div) 안에 렌더된다 — 그 컬럼들의 부모가 flex 컨테이너다.
    const senderColumn = senderPanel.parentElement;
    const recipientColumn = recipientPanel.parentElement;
    expect(senderColumn).not.toBeNull();
    const container = senderColumn?.parentElement ?? null;
    expect(container).not.toBeNull();
    expect(container).toBe(recipientColumn?.parentElement);
    expect(container?.getAttribute('style')).toMatch(/display:\s*flex/);
  });

  // Major 6①(reviewer REJECTED → 수정) — UX-004 Accessibility "A live region announces
  // mediation completion/failure, including when new Misread Risk ... appear".
  it('Major 6① — 중재 완료를 알리는 polite live region이 존재하고 완료/오해위험을 안내한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mediateSuccessResponse({
        misreadRisks: [{ quote: '확인 부탁드립니다', misreading: '오해 위험', evidence: '근거' }],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<MediationWorkspace />);
    const liveRegion = screen.getByRole('status', { name: '중재 진행 상태 알림' });
    expect(liveRegion.getAttribute('aria-live')).toBe('polite');

    fillAndRun();

    await waitFor(() => {
      expect(liveRegion.textContent).toMatch(/완료/);
      expect(liveRegion.textContent).toMatch(/오해 위험 1건/);
    });
  });

  it('Major 6① — 실행 실패도 live region으로 안내한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { code: 'INTERNAL', message: '처리 중 오류', retryable: true } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MediationWorkspace />);
    const liveRegion = screen.getByRole('status', { name: '중재 진행 상태 알림' });

    fillAndRun();

    await waitFor(() => {
      expect(liveRegion.textContent).toMatch(/실패/);
    });
  });

  // 🔴 Critical(reviewer REJECTED → 정정) — 이 서술은 `fallback`에만 해당하고 `cache`에는
  // 해당하지 않는다. `fallback`이면 `body.transformed`가 사용자가 쓴 원문과 무관한 고정 시나리오
  // 문구다(`packages/core/src/data/fallback-responses.ts`). `cache`는 다르다 — 같은 입력에 대해
  // 예전에 실제로 성공한 LLM 응답의 재사용이다(`apps/web/lib/llm/openai.ts:245-254`,
  // `cache-key.ts:58-68`). AC-041 배지만으로는 사용자가 fallback의 무관한 문구를 놓치고 그대로
  // 승인·발송할 수 있으므로, C2가 `fallback`일 때만 `finalText`를 자동으로 채우지 않고 비워 둔다
  // — `live`/`cache`는 둘 다 채운다. 빈 발송문 승인 비활성화(MJ-3, `RecipientPanel.tsx`의
  // `isFinalTextEmpty`)가 이미 있어 fallback에서는 자연스럽게 승인이 막히고 사용자가 직접
  // 작성해야 한다. `cache` 케이스는 아래 별도 테스트(Critical)로 검증한다.
  it('사용자 결정 — C2가 live면 기존대로 finalText가 transformed로 채워지고 승인 버튼이 활성화된다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mediateSuccessResponse());
    vi.stubGlobal('fetch', fetchMock);

    render(<MediationWorkspace />);
    fillAndRun();

    await waitFor(() => {
      expect(screen.getAllByText('Please confirm by tomorrow.').length).toBeGreaterThan(0);
    });

    const finalTextArea = screen.getByLabelText('최종 발송문') as HTMLTextAreaElement;
    expect(finalTextArea.value).toBe('Please confirm by tomorrow.');

    const recipientPanel = screen.getByLabelText('수신자 패널');
    expect(
      (within(recipientPanel).getByRole('button', { name: /승인/ }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('사용자 결정 — C2가 non-live(폴백)면 finalText를 자동으로 채우지 않고 승인 버튼이 비활성화된다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mediateSuccessResponse({
        source: 'fallback',
        stepSources: { c1: 'live', c2: 'fallback', c4: 'live' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<MediationWorkspace />);
    fillAndRun();

    await waitFor(() => {
      expect(screen.getByText('폴백 응답 사용 중')).toBeTruthy();
    });

    const finalTextArea = screen.getByLabelText('최종 발송문') as HTMLTextAreaElement;
    expect(finalTextArea.value).toBe('');
    // AC-041 배지 자체는 여전히 표시된다(변경 대상 아님) — 위 waitFor에서 이미 확인.

    const recipientPanel = screen.getByLabelText('수신자 패널');
    expect(
      (within(recipientPanel).getByRole('button', { name: /승인/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    // MJ-3의 기존 인라인 안내와 연결된다 — 새로 만들지 않는다.
    expect(screen.getByText('최종 발송문을 입력해야 승인할 수 있습니다.')).toBeTruthy();
  });

  // 🔴 Critical(reviewer REJECTED → 수정) — `cache`는 `fallback`과 다르다. `cache`는 **같은
  // 입력에 대해 예전에 실제로 성공한 LLM 응답**을 재사용한 것이지(`apps/web/lib/llm/openai.ts:245-254`,
  // `cache-key.ts:58-68`), 폴백처럼 사용자가 쓴 원문과 무관한 고정 시나리오 문구가 아니다. 이 리포는
  // 발표 중 API 호출을 줄이려고 캐시를 의도적으로 쓰므로(`docs/PRD.md:914`, Planning Decision #29),
  // `c2Source==='live'`일 때만 finalText를 채우던 이전 조건은 리허설 뒤 캐시 히트가 나는 발표 본
  // 실행에서 발송문 입력창을 비우고 승인 버튼을 막는 회귀였다. `cache`도 `live`와 동일하게
  // finalText를 채우고 승인 가능해야 한다.
  it('Critical — C2가 cache(과거에 실제 성공한 LLM 응답 재사용)면 live와 동일하게 finalText가 채워지고 승인 버튼이 활성화된다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mediateSuccessResponse({
        source: 'cache',
        stepSources: { c1: 'live', c2: 'cache', c4: 'live' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<MediationWorkspace />);
    fillAndRun();

    await waitFor(() => {
      expect(screen.getAllByText('Please confirm by tomorrow.').length).toBeGreaterThan(0);
    });

    const finalTextArea = screen.getByLabelText('최종 발송문') as HTMLTextAreaElement;
    expect(finalTextArea.value).toBe('Please confirm by tomorrow.');

    const recipientPanel = screen.getByLabelText('수신자 패널');
    expect(
      (within(recipientPanel).getByRole('button', { name: /승인/ }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  // 🔴 Major 2(reviewer REJECTED → 수정) — 폴백 → 사용자가 직접 발송문을 작성 → 재실행(AC-029
  // 재시도 경로) → 다시 폴백이면, 재실행이 방금 사용자가 쓴 발송문을 지우면 안 된다. 사용자가
  // finalText를 자동 채움 값(빈 문자열)과 다르게 편집했다면, 다음 폴백 응답이 다시 finalText를
  // 비우지 않고 사용자가 쓴 값을 그대로 유지해야 한다.
  it('Major 2 — 폴백 후 사용자가 직접 쓴 발송문은 재실행이 다시 폴백이어도 지워지지 않는다', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/mediate') {
        return Promise.resolve(
          mediateSuccessResponse({
            source: 'fallback',
            stepSources: { c1: 'live', c2: 'fallback', c4: 'live' },
          }),
        );
      }
      throw new Error(`unexpected url: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MediationWorkspace />);
    fillAndRun();

    await waitFor(() => {
      expect(screen.getByText('폴백 응답 사용 중')).toBeTruthy();
    });

    const finalTextArea = screen.getByLabelText('최종 발송문') as HTMLTextAreaElement;
    expect(finalTextArea.value).toBe('');

    fireEvent.change(finalTextArea, { target: { value: '제가 직접 작성한 최종 발송문입니다.' } });
    expect(finalTextArea.value).toBe('제가 직접 작성한 최종 발송문입니다.');

    // 재실행(같은 원문·수신자로 다시 실행) — 다시 폴백 응답을 받는다.
    fireEvent.click(screen.getByRole('button', { name: '실행' }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([u]) => u === '/api/mediate')).toHaveLength(2);
    });

    await waitFor(() => {
      expect((screen.getByLabelText('최종 발송문') as HTMLTextAreaElement).value).toBe(
        '제가 직접 작성한 최종 발송문입니다.',
      );
    });
  });

  // 🔴 MJ-A(reviewer 2라운드 경고 — "이 조건에 따라 Critical/REJECTED로 뒤집힐 수 있다") — Major 2
  // 가드가 재실행 **시작 시점**에 캡처된 `finalText` 클로저와 `lastAutoFilledFinalTextRef.current`를
  // 비교한다. 그런데 최종 발송문 textarea는 요청이 진행 중(`isRunning`)이어도 비활성화되지
  // 않는다(`RecipientPanel.tsx`는 `disabled={isDelivered}`뿐). 재실행이 진행되는 동안 사용자가
  // 직접 편집하면, 응답이 도착했을 때 가드가 "재실행 시작 시점의 캡처값(옛 값)"과 ref를 비교해
  // "편집 안 했다"고 오판정하고 방금 입력한 텍스트를 지워버릴 수 있다.
  it('MJ-A — 재실행이 진행 중인 동안 사용자가 최종 발송문을 편집하면, 응답이 다시 폴백이어도 방금 입력한 텍스트가 지워지지 않는다(stale closure 가드)', async () => {
    let resolveSecondRun: ((value: unknown) => void) | null = null;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/mediate') {
        const callCount = fetchMock.mock.calls.filter(([u]) => u === '/api/mediate').length;
        if (callCount <= 1) {
          return Promise.resolve(
            mediateSuccessResponse({
              source: 'fallback',
              stepSources: { c1: 'live', c2: 'fallback', c4: 'live' },
            }),
          );
        }
        return new Promise((resolve) => {
          resolveSecondRun = resolve;
        });
      }
      throw new Error(`unexpected url: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MediationWorkspace />);
    fillAndRun();

    await waitFor(() => {
      expect(screen.getByText('폴백 응답 사용 중')).toBeTruthy();
    });

    const finalTextArea = screen.getByLabelText('최종 발송문') as HTMLTextAreaElement;
    expect(finalTextArea.value).toBe('');

    // 재실행 시작(아직 응답 안 옴) — 이 클릭 시점에 `handleRunMediation`이 캡처하는 `finalText`는 ''.
    fireEvent.click(screen.getByRole('button', { name: '실행' }));

    await waitFor(() => {
      expect(screen.getByText('분류 중 → 변환 중 → 역번역 중')).toBeTruthy();
    });

    // 요청이 진행되는 동안 사용자가 textarea에 직접 타이핑한다.
    fireEvent.change(finalTextArea, { target: { value: '진행 중에 사용자가 입력한 텍스트' } });
    expect(finalTextArea.value).toBe('진행 중에 사용자가 입력한 텍스트');

    // 응답이 다시 폴백으로 온다.
    resolveSecondRun!(
      mediateSuccessResponse({
        source: 'fallback',
        stepSources: { c1: 'live', c2: 'fallback', c4: 'live' },
      }),
    );

    await waitFor(() => {
      expect(screen.queryByText('분류 중 → 변환 중 → 역번역 중')).toBeNull();
    });

    expect((screen.getByLabelText('최종 발송문') as HTMLTextAreaElement).value).toBe(
      '진행 중에 사용자가 입력한 텍스트',
    );
  });

  // 🔴 M2(reviewer 최종 APPROVED, Major 비차단 → 수정) — 실행 성공(A) → 재실행 시작(진행 중) →
  // 그 사이 승인 클릭(A가 전송됨) → 재실행 완료(B) → 화면이 B로 갱신되는데 Delivered 잠금
  // 상태라 "발송됨" 표시와 함께 B가 남아, 실제로 전송된 A가 아니라 B가 보이는 불일치가
  // 있었다. 재실행이 진행 중(status==='loading')이면 승인 버튼을 비활성화해 이 창을 없앤다
  // (`docs/UX.md` UX-004 Validation "disabled during Loading/Error" — Error는 Major 1에서
  // 예외 처리됐지만 Loading은 예외가 아니다).
  it('M2 — 재실행이 진행 중이면 직전 성공 결과가 있어도 승인 버튼이 비활성화된다(회귀: 실행→재실행 진행중→승인 시도→차단)', async () => {
    let resolveSecondRun: ((value: unknown) => void) | null = null;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/mediate') {
        if (fetchMock.mock.calls.filter(([u]) => u === '/api/mediate').length <= 1) {
          return Promise.resolve(mediateSuccessResponse());
        }
        return new Promise((resolve) => {
          resolveSecondRun = resolve;
        });
      }
      if (url === '/api/messages') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            messageId: 'msg-1',
            diffId: 'diff-1',
            sentAt: '2026-08-05T10:00:00Z',
            patternKey: null,
            learnedApplied: false,
          }),
        });
      }
      throw new Error(`unexpected url: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MediationWorkspace />);
    fillAndRun();

    await waitFor(() => {
      expect(screen.getAllByText('Please confirm by tomorrow.').length).toBeGreaterThan(0);
    });

    const recipientPanel = screen.getByLabelText('수신자 패널');
    expect(
      (within(recipientPanel).getByRole('button', { name: /승인/ }) as HTMLButtonElement).disabled,
    ).toBe(false);

    // 원문을 바꾸지 않고 재실행 시작(진행 중, 아직 응답 안 옴) — isStale은 false로 유지된다.
    fireEvent.click(screen.getByRole('button', { name: '실행' }));

    await waitFor(() => {
      // T16(AC-029) — 단일 "처리 중…" 문구가 단계 라벨 진행 표시로 대체됐다.
      expect(screen.getByText('분류 중 → 변환 중 → 역번역 중')).toBeTruthy();
    });

    const approveButton = within(recipientPanel).getByRole('button', {
      name: /승인/,
    }) as HTMLButtonElement;
    expect(approveButton.disabled).toBe(true);

    fireEvent.click(approveButton);
    // disabled 버튼 클릭은 onApprove/전송을 유발하지 않는다.
    const messagesCallsDuringLoading = fetchMock.mock.calls.filter(([u]) => u === '/api/messages');
    expect(messagesCallsDuringLoading).toHaveLength(0);

    resolveSecondRun!(mediateSuccessResponse({ transformed: 'B result.' }));
    await waitFor(() => {
      expect(screen.getAllByText('B result.').length).toBeGreaterThan(0);
    });
    // 재실행 완료 후에는 다시 활성화된다.
    expect(
      (within(recipientPanel).getByRole('button', { name: /승인/ }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  // Major(비차단, 사용자 지시 유지보수 라운드) — `crypto.randomUUID`는 secure context가 아닌
  // 환경(http:// + non-localhost, 예: LAN IP로 접속하는 로컬 데모)에서 `undefined`라 호출하면
  // 던진다. 그 상태에서 승인을 누르면 예외가 나고, 재시도해도 같은 환경이므로 승인이 영구
  // 실패한다. `crypto.randomUUID`가 없는 환경에서도 승인이 성공해야 한다.
  it('Major(비차단) — crypto.randomUUID가 없는 환경(secure context 아님)에서도 승인이 실패하지 않고 Idempotency-Key를 생성한다', async () => {
    const originalCrypto = globalThis.crypto;
    // secure context가 아닌 브라우저에서 `crypto.randomUUID`가 없는 상태를 재현한다 — `crypto`
    // 자체는 남아 있지만(getRandomValues 등은 여전히 쓸 수 있는 환경도 있다) `randomUUID`만 없다.
    vi.stubGlobal('crypto', { ...originalCrypto, randomUUID: undefined });

    try {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === '/api/mediate') return Promise.resolve(mediateSuccessResponse());
        if (url === '/api/messages') {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              messageId: 'msg-1',
              diffId: 'diff-1',
              sentAt: '2026-08-05T10:00:00Z',
              patternKey: null,
              learnedApplied: false,
            }),
          });
        }
        throw new Error(`unexpected url: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      render(<MediationWorkspace />);
      fillAndRun();

      await waitFor(() => {
        expect(screen.getAllByText('Please confirm by tomorrow.').length).toBeGreaterThan(0);
      });

      const recipientPanel = screen.getByLabelText('수신자 패널');
      const approveButton = within(recipientPanel).getByRole('button', { name: /승인/ });
      fireEvent.click(approveButton);

      await waitFor(() => {
        const messagesCalls = fetchMock.mock.calls.filter(([url]) => url === '/api/messages');
        expect(messagesCalls).toHaveLength(1);
      });

      const [, requestInit] = fetchMock.mock.calls.find(([url]) => url === '/api/messages')!;
      const idempotencyKey = new Headers((requestInit as RequestInit).headers).get(
        'Idempotency-Key',
      );
      expect(idempotencyKey).toBeTruthy();
      expect(idempotencyKey!.length).toBeGreaterThan(0);

      await waitFor(() => {
        expect(within(recipientPanel).getByText(/발송됨/)).toBeTruthy();
      });
    } finally {
      vi.stubGlobal('crypto', originalCrypto);
    }
  });
});
