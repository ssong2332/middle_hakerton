/**
 * T13/T14 — `MediationWorkspace` (UX-004 본체). AC-009(2패널 동시 표시) + AC-010(명시적 승인
 * 없이는 전송 없음). `apps/web/components/MediationDemoForm.tsx`가 예고한 대로 이 컴포넌트가
 * 그 최소 하네스를 흡수·대체한다 — T6/T8/T9/T10 조각(`BackTranslationPreview`/`UrgencyPanel`)을
 * 그대로 재사용한다.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { TICKET_DRAFT_SESSION_KEY, TICKET_RESTORE_SESSION_KEY } from '../lib/ticket-draft';

// T25 — `MediationWorkspace`가 "Convert to Task Ticket" 클릭 시 `/ticket`으로 이동한다
// (`apps/web/lib/ticket-draft.ts` 참조, next/navigation의 실제 라우터 컨텍스트가 jsdom 테스트에
// 없으므로 이 리포의 다른 라우팅 테스트(`LogoutButton.test.tsx` 등)와 같은 패턴으로 목한다).
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

import { MediationWorkspace } from './MediationWorkspace';
import { TicketWorkspace } from './TicketWorkspace';
import styles from './MediationWorkspace.module.css';

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
    mockPush.mockClear();
    window.sessionStorage.clear();
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
  //
  // 🔴 (구현자, 2026-08-06 — CSS 실장 태스크) 레이아웃이 인라인 `style={{display:'flex'}}`에서
  // `MediationWorkspace.module.css`의 `.twoPanel` 클래스로 옮겨졌다(`docs/design-mockups` 목업
  // 기준 실제 디자인 토큰 적용). `display:flex` 규칙 자체는 이제 컴파일된 CSS 파일에 있고 jsdom은
  // 외부 스타일시트 규칙을 적용해 보여주지 않으므로, 인라인 style 속성을 더 이상 근거로 쓸 수
  // 없다 — 두 패널의 공통 부모가 CSS Module 클래스를 부여받았다는 구조는 계속 검증한다.
  // `display:flex` 규칙이 실제로 컴파일 산출물에 존재하는지는 `npm run build` 산출물 확인으로
  // 별도 근거를 남긴다(구현 보고서).
  it('Major 4/AC-009 — 발신자·수신자 패널이 CSS Module 레이아웃 클래스가 적용된 컨테이너 안에서 나란히 배치된다', () => {
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
    expect(container?.className).toContain(styles.twoPanel);
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

  // 🔴 CR-1(reviewer REJECTED → 수정) — Major 2/MJ-A 가드의 `setFinalText((prev) => prev ===
  // lastAutoFilledFinalTextRef.current ? '' : prev)` 다음 줄에서 즉시
  // `lastAutoFilledFinalTextRef.current = ''`로 초기화한다. React는 함수형 업데이터를 호출 시점이
  // 아니라 나중에(렌더 단계에서) 실행하므로, 업데이터가 실제로 도는 시점엔 ref가 이미 ''로 바뀐
  // 뒤다 — 비교식이 사실상 `prev === ''`가 되어, 직전 실행이 live/cache로 finalText를 채워둔
  // 상태(`prev`가 빈 문자열이 아님)에서 fallback으로 전이하면 조건이 항상 거짓이 되어 절대 비워지지
  // 않는다. `previousAutoFilled`를 로컬 `const`로 먼저 캡처해 초기화 전 값과 비교하도록 고친다.
  it('CR-1 회귀 — live 실행 뒤 재실행이 fallback이면(사용자 편집 없음) 이전 실행의 변환문이 남지 않고 finalText가 비워지며 승인 버튼이 비활성화된다', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/mediate') {
        const callCount = fetchMock.mock.calls.filter(([u]) => u === '/api/mediate').length;
        if (callCount <= 1) {
          return Promise.resolve(mediateSuccessResponse());
        }
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
      expect(screen.getAllByText('Please confirm by tomorrow.').length).toBeGreaterThan(0);
    });

    expect((screen.getByLabelText('최종 발송문') as HTMLTextAreaElement).value).toBe(
      'Please confirm by tomorrow.',
    );

    // 원문을 바꾸지 않고 재실행 — 이번엔 fallback.
    fireEvent.click(screen.getByRole('button', { name: '실행' }));

    await waitFor(() => {
      expect(screen.getByText('폴백 응답 사용 중')).toBeTruthy();
    });

    expect((screen.getByLabelText('최종 발송문') as HTMLTextAreaElement).value).toBe('');

    const recipientPanel = screen.getByLabelText('수신자 패널');
    expect(
      (within(recipientPanel).getByRole('button', { name: /승인/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  // 🔴 CR-1 회귀 — 위와 같은 메커니즘을, 재실행 사이에 원문을 바꾼 경우에도 확인한다. 원문이 달라져도
  // fallback 분기는 `body.transformed`로 finalText를 채우지 않으므로(비우거나 사용자 편집을
  // 보존할 뿐), 직전 live 실행이 자동 채웠던 값이 새 원문과 무관하게 남아 있으면 안 된다.
  it('CR-1 회귀 — 원문을 바꿔 재실행했는데 다시 fallback이면 이전 원문의 자동 채움 값이 발송창에 남지 않는다', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/mediate') {
        const callCount = fetchMock.mock.calls.filter(([u]) => u === '/api/mediate').length;
        if (callCount <= 1) {
          return Promise.resolve(mediateSuccessResponse());
        }
        return Promise.resolve(
          mediateSuccessResponse({
            transformed: 'Different fallback text irrelevant to autofill check.',
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
      expect(screen.getAllByText('Please confirm by tomorrow.').length).toBeGreaterThan(0);
    });

    expect((screen.getByLabelText('최종 발송문') as HTMLTextAreaElement).value).toBe(
      'Please confirm by tomorrow.',
    );

    // 원문을 바꿔서 재실행한다 — 사용자는 최종 발송문을 직접 편집하지 않았다.
    fireEvent.change(screen.getByLabelText('메시지'), {
      target: { value: '다른 원문입니다. 확인 부탁드립니다.' },
    });
    fireEvent.click(screen.getByRole('button', { name: '실행' }));

    await waitFor(() => {
      expect(screen.getByText('폴백 응답 사용 중')).toBeTruthy();
    });

    expect((screen.getByLabelText('최종 발송문') as HTMLTextAreaElement).value).toBe('');
  });

  // 🔴 CR-1 회귀 — 같은 메커니즘이 cache→fallback 전이에서도 성립하는지 확인한다(cache는 live와
  // 동일하게 finalText를 자동 채운다).
  it('CR-1 회귀 — cache 실행 뒤 재실행이 fallback이면(사용자 편집 없음) 이전 실행의 변환문이 남지 않고 finalText가 비워진다(cache→fallback 전이)', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/mediate') {
        const callCount = fetchMock.mock.calls.filter(([u]) => u === '/api/mediate').length;
        if (callCount <= 1) {
          return Promise.resolve(
            mediateSuccessResponse({
              source: 'cache',
              stepSources: { c1: 'live', c2: 'cache', c4: 'live' },
            }),
          );
        }
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
      expect(screen.getAllByText('Please confirm by tomorrow.').length).toBeGreaterThan(0);
    });

    expect((screen.getByLabelText('최종 발송문') as HTMLTextAreaElement).value).toBe(
      'Please confirm by tomorrow.',
    );

    fireEvent.click(screen.getByRole('button', { name: '실행' }));

    await waitFor(() => {
      expect(screen.getByText('폴백 응답 사용 중')).toBeTruthy();
    });

    expect((screen.getByLabelText('최종 발송문') as HTMLTextAreaElement).value).toBe('');

    const recipientPanel = screen.getByLabelText('수신자 패널');
    expect(
      (within(recipientPanel).getByRole('button', { name: /승인/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  // 🔴 사용자 결정(2026-08-06) — Major 2/MJ-A/CR-1 가드는 지금까지 `fallback` 분기에만 있었다.
  // `live`/`cache` 분기는 무조건 `setFinalText(body.transformed)`로 덮어써, 폴백 상태에서 사용자가
  // 직접 쓴 발송문이 있어도 재실행 결과가 live로 바뀌면 조용히 사라졌다. live/cache도 fallback과
  // 동일한 정책(직전 자동 채움 값과 다르면=사용자가 편집했으면 덮어쓰지 않는다)을 따른다.
  it('사용자 결정 — 폴백 상태에서 사용자가 직접 쓴 발송문은 재실행이 live로 바뀌어도 지워지지 않는다', async () => {
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
        return Promise.resolve(mediateSuccessResponse());
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

    // 원문을 바꾸지 않고 재실행 — 이번엔 live.
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

  // 🔴 사용자 결정(2026-08-06) — 위와 같은 메커니즘을 cache 전이에서도 확인한다.
  it('사용자 결정 — 폴백 상태에서 사용자가 직접 쓴 발송문은 재실행이 cache로 바뀌어도 지워지지 않는다', async () => {
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
        return Promise.resolve(
          mediateSuccessResponse({
            source: 'cache',
            stepSources: { c1: 'live', c2: 'cache', c4: 'live' },
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

  // 회귀 — 자동 채움 값을 사용자가 건드리지 않았다면, 재실행이 live→live로 바뀌는 정상 케이스는
  // 여전히 새 결과로 갱신되어야 한다(위 가드가 정상 갱신 경로까지 막으면 안 된다).
  it('회귀 — 자동 채움 값을 편집하지 않았다면 재실행이 live→live로 바뀌어도 새 결과로 갱신된다', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/mediate') {
        const callCount = fetchMock.mock.calls.filter(([u]) => u === '/api/mediate').length;
        if (callCount <= 1) {
          return Promise.resolve(mediateSuccessResponse());
        }
        return Promise.resolve(mediateSuccessResponse({ transformed: 'Updated live response.' }));
      }
      throw new Error(`unexpected url: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MediationWorkspace />);
    fillAndRun();

    await waitFor(() => {
      expect((screen.getByLabelText('최종 발송문') as HTMLTextAreaElement).value).toBe(
        'Please confirm by tomorrow.',
      );
    });

    fireEvent.click(screen.getByRole('button', { name: '실행' }));

    await waitFor(() => {
      expect((screen.getByLabelText('최종 발송문') as HTMLTextAreaElement).value).toBe(
        'Updated live response.',
      );
    });
  });

  // 🔴 MJ-A(live/cache 확장, 사용자 결정 2026-08-06) — 재실행이 진행되는 동안(`isRunning`이어도
  // 최종 발송문 textarea는 비활성화되지 않는다) 사용자가 직접 편집하면, 응답이 live/cache로 와도
  // 방금 입력한 텍스트를 지우면 안 된다. fallback 분기에서 이미 검증된 stale-closure 가드
  // (functional setState + 응답 처리 시점에 ref를 로컬로 캡처)가 live/cache에도 그대로 적용된다.
  it('MJ-A(live/cache 확장) — 재실행이 진행 중인 동안 사용자가 최종 발송문을 편집하면, 응답이 live/cache로 와도 방금 입력한 텍스트가 지워지지 않는다', async () => {
    let resolveSecondRun: ((value: unknown) => void) | null = null;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/mediate') {
        const callCount = fetchMock.mock.calls.filter(([u]) => u === '/api/mediate').length;
        if (callCount <= 1) {
          return Promise.resolve(mediateSuccessResponse());
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
      expect((screen.getByLabelText('최종 발송문') as HTMLTextAreaElement).value).toBe(
        'Please confirm by tomorrow.',
      );
    });

    const finalTextArea = screen.getByLabelText('최종 발송문') as HTMLTextAreaElement;

    // 재실행 시작(아직 응답 안 옴).
    fireEvent.click(screen.getByRole('button', { name: '실행' }));

    await waitFor(() => {
      expect(screen.getByText('분류 중 → 변환 중 → 역번역 중')).toBeTruthy();
    });

    // 요청이 진행되는 동안 사용자가 textarea에 직접 타이핑한다.
    fireEvent.change(finalTextArea, { target: { value: '진행 중에 사용자가 입력한 텍스트' } });
    expect(finalTextArea.value).toBe('진행 중에 사용자가 입력한 텍스트');

    // 응답이 live로 온다(다른 transformed 값).
    resolveSecondRun!(mediateSuccessResponse({ transformed: 'Second live response.' }));

    await waitFor(() => {
      expect(screen.queryByText('분류 중 → 변환 중 → 역번역 중')).toBeNull();
    });

    expect((screen.getByLabelText('최종 발송문') as HTMLTextAreaElement).value).toBe(
      '진행 중에 사용자가 입력한 텍스트',
    );
  });

  // 🔴 MJ-1(reviewer APPROVED, 비차단 Major → 수정) — 발송문을 완전히 비우면(trim 결과 빈 문자열)
  // 그 뒤 어떤 재실행으로도 복구할 수 없었다. 빈 문자열도 "사용자 편집"으로 판정돼(`prev('') !==
  // previousAutoFilled`) 이후 모든 재실행이 빈 값을 영구히 보존했기 때문이다 — MJ-3(빈 발송문 →
  // 승인 비활성화)까지 겹쳐 중재 결과가 새로 와도 승인·전송 화면에 도달할 방법이 없는 막다른
  // 상태였다. 발송문이 공백뿐이면 사용자 편집으로 보지 않고 자동 채움을 다시 허용한다. reviewer가
  // 실측한 재현 시나리오(live 자동 채움 → 전부 지움 → 재실행 → 새 live 응답)를 그대로 검증한다.
  it('MJ-1 — 발송문을 완전히 비운 뒤 재실행하면 새 결과로 다시 채워지고 승인 버튼이 활성화된다', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/mediate') {
        const callCount = fetchMock.mock.calls.filter(([u]) => u === '/api/mediate').length;
        if (callCount <= 1) {
          return Promise.resolve(mediateSuccessResponse());
        }
        return Promise.resolve(mediateSuccessResponse({ transformed: 'Second live response.' }));
      }
      throw new Error(`unexpected url: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MediationWorkspace />);
    fillAndRun();

    await waitFor(() => {
      expect((screen.getByLabelText('최종 발송문') as HTMLTextAreaElement).value).toBe(
        'Please confirm by tomorrow.',
      );
    });

    const finalTextArea = screen.getByLabelText('최종 발송문') as HTMLTextAreaElement;

    // 사용자가 발송문을 완전히 비운다.
    fireEvent.change(finalTextArea, { target: { value: '' } });
    expect(finalTextArea.value).toBe('');

    // 재실행 — 새 live 응답이 온다.
    fireEvent.click(screen.getByRole('button', { name: '실행' }));

    await waitFor(() => {
      expect((screen.getByLabelText('최종 발송문') as HTMLTextAreaElement).value).toBe(
        'Second live response.',
      );
    });

    const recipientPanel = screen.getByLabelText('수신자 패널');
    expect(
      (within(recipientPanel).getByRole('button', { name: /승인/ }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  // 🔴 MJ-1 확장 — "공백뿐"은 완전히 지운 상태(`''`)만이 아니라 공백 문자만 남은 상태(trim 결과
  // 빈 문자열)도 포함한다. 수정이 단순 `=== ''` 비교가 아니라 `.trim() === ''`를 쓰는지 이 케이스로
  // 확인한다.
  it('MJ-1 확장 — 발송문에 공백 문자만 남기고 재실행하면(trim 결과 빈 문자열) 새 결과로 다시 채워진다', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/mediate') {
        const callCount = fetchMock.mock.calls.filter(([u]) => u === '/api/mediate').length;
        if (callCount <= 1) {
          return Promise.resolve(mediateSuccessResponse());
        }
        return Promise.resolve(mediateSuccessResponse({ transformed: 'Second live response.' }));
      }
      throw new Error(`unexpected url: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MediationWorkspace />);
    fillAndRun();

    await waitFor(() => {
      expect((screen.getByLabelText('최종 발송문') as HTMLTextAreaElement).value).toBe(
        'Please confirm by tomorrow.',
      );
    });

    const finalTextArea = screen.getByLabelText('최종 발송문') as HTMLTextAreaElement;

    // 사용자가 발송문을 공백 문자만 남긴다(완전한 빈 문자열은 아니다).
    fireEvent.change(finalTextArea, { target: { value: '   ' } });
    expect(finalTextArea.value).toBe('   ');

    fireEvent.click(screen.getByRole('button', { name: '실행' }));

    await waitFor(() => {
      expect((screen.getByLabelText('최종 발송문') as HTMLTextAreaElement).value).toBe(
        'Second live response.',
      );
    });
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

  // T25/AC-058① — `ticketOption.offered:true`면 RecipientPanel에 링크가 나타나고, 클릭하면
  // 승인 대상 원문(스냅샷)을 세션에 저장한 뒤 `/ticket`으로 이동한다(`apps/web/lib/ticket-draft.ts`).
  it('T25 — Convert to Task Ticket 클릭 시 원문을 세션에 저장하고 /ticket으로 이동한다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        mediateSuccessResponse({ ticketOption: { offered: true, basis: 'signal_present' } }),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(<MediationWorkspace />);
    fillAndRun();

    await waitFor(() => {
      expect(screen.getAllByText('Please confirm by tomorrow.').length).toBeGreaterThan(0);
    });

    const recipientPanel = screen.getByLabelText('수신자 패널');
    const ticketLink = within(recipientPanel).getByRole('button', {
      name: /Convert to Task Ticket/,
    });
    fireEvent.click(ticketLink);

    expect(window.sessionStorage.getItem(TICKET_DRAFT_SESSION_KEY)).toBe(
      '내일까지 확인 부탁드립니다.',
    );
    expect(mockPush).toHaveBeenCalledWith('/ticket');
  });

  // T25/AC-058② — 감정 신호가 낮아 `ticketOption.offered:false`이면 링크 자체가 없다.
  it('T25 — ticketOption.offered가 false면 Convert to Task Ticket 링크가 없다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mediateSuccessResponse());
    vi.stubGlobal('fetch', fetchMock);

    render(<MediationWorkspace />);
    fillAndRun();

    await waitFor(() => {
      expect(screen.getAllByText('Please confirm by tomorrow.').length).toBeGreaterThan(0);
    });

    const recipientPanel = screen.getByLabelText('수신자 패널');
    expect(
      within(recipientPanel).queryByRole('button', { name: /Convert to Task Ticket/ }),
    ).toBeNull();
  });

  // MAJ-3(reviewer follow-up) — "Back to message"/"Use this ticket"로 `/ticket`을 다녀오면
  // `MediationWorkspace`가 통째로 재마운트되므로(별개 라우트), `recipient` state도 초기화된다.
  // 원문(text)뿐 아니라 받는 사람 값도 세션 초안으로 함께 들고 다녀야, 돌아왔을 때 다시 입력하지
  // 않아도 된다.
  it('MAJ-3 — Convert to Task Ticket 후 재마운트(라우트 이동 시뮬레이션)해도 받는 사람 값이 복원된다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        mediateSuccessResponse({ ticketOption: { offered: true, basis: 'signal_present' } }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = render(<MediationWorkspace />);
    fillAndRun();

    await waitFor(() => {
      expect(screen.getAllByText('Please confirm by tomorrow.').length).toBeGreaterThan(0);
    });

    const recipientPanel = screen.getByLabelText('수신자 패널');
    fireEvent.click(
      within(recipientPanel).getByRole('button', { name: /Convert to Task Ticket/ }),
    );

    // `/ticket`으로 이동하면서 이 컴포넌트가 언마운트된다(별개 라우트) — 재마운트로 시뮬레이션한다.
    unmount();
    render(<MediationWorkspace />);

    expect((screen.getByLabelText('받는 사람') as HTMLInputElement).value).toBe(
      'boss@example.com',
    );
  });

  // T25 — `/ticket`에서 "Use this ticket"/"Back to message"로 돌아왔을 때, 세션에 남아 있는
  // 복원값(`TICKET_RESTORE_SESSION_KEY`)을 마운트 시 작성창에 복원하고 즉시 소비(삭제)한다 —
  // 이후 관계없는 방문에서 같은 값이 다시 나타나지 않게 한다(스테일 재노출 방지).
  it('T25 — 마운트 시 세션에 복원값이 있으면 작성창에 복원하고 세션에서 지운다', () => {
    window.sessionStorage.setItem(
      TICKET_RESTORE_SESSION_KEY,
      '[문제 정의]\n편집된 문제\n\n[영향·리스크]\n없음\n\n[요청 사항]\n요청\n\n[우려 수준]\n높음',
    );

    render(<MediationWorkspace />);

    const messageField = screen.getByLabelText('메시지') as HTMLTextAreaElement;
    expect(messageField.value).toContain('편집된 문제');
    expect(window.sessionStorage.getItem(TICKET_RESTORE_SESSION_KEY)).toBeNull();
  });

  // Major-1(QA GO, follow-up → 수정) — 회귀 테스트: 중재 실행(스냅샷 "A") 후 사용자가 작성창을
  // 더 편집("A + more", 이 시점부터 `isStale`)하고 나서 "Convert to Task Ticket"을 누르면,
  // `/api/ticket`에는 여전히 스냅샷("A")이 전달돼야 하지만(ticketOption이 그 텍스트로 판정됐으므로,
  // 이 동작 자체는 바꾸지 않는다), "Back to message"로 돌아왔을 때 작성창은 편집분("A + more")을
  // 보존해야 한다 — 스냅샷으로 조용히 되돌려지면 안 된다.
  it('Major-1 — 스냅샷 이후 편집한 텍스트로 티켓 전환해도 Back to message는 편집분을 보존한다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        mediateSuccessResponse({ ticketOption: { offered: true, basis: 'signal_present' } }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = render(<MediationWorkspace />);
    fillAndRun();

    await waitFor(() => {
      expect(screen.getAllByText('Please confirm by tomorrow.').length).toBeGreaterThan(0);
    });

    // 성공 스냅샷은 '내일까지 확인 부탁드립니다.' — 이제 작성창을 추가로 편집한다(isStale이 됨).
    const messageField = screen.getByLabelText('메시지') as HTMLTextAreaElement;
    fireEvent.change(messageField, {
      target: { value: '내일까지 확인 부탁드립니다. 그리고 추가 내용도 있습니다.' },
    });

    const recipientPanel = screen.getByLabelText('수신자 패널');
    fireEvent.click(
      within(recipientPanel).getByRole('button', { name: /Convert to Task Ticket/ }),
    );

    // API에 보낼 원문(TICKET_DRAFT_SESSION_KEY)은 여전히 스냅샷이어야 한다 — 바뀌면 안 된다.
    expect(window.sessionStorage.getItem(TICKET_DRAFT_SESSION_KEY)).toBe(
      '내일까지 확인 부탁드립니다.',
    );

    // `/ticket`으로 이동하면서 이 컴포넌트가 언마운트된다(별개 라우트) — "Back to message"는
    // 세션 값을 건드리지 않으므로, 재마운트로 그 결과를 시뮬레이션한다.
    unmount();
    render(<MediationWorkspace />);

    expect((screen.getByLabelText('메시지') as HTMLTextAreaElement).value).toBe(
      '내일까지 확인 부탁드립니다. 그리고 추가 내용도 있습니다.',
    );
  });

  // M-A(reviewer 발견 → 수정) — Major-1 수정이 `removeItem`을 `TICKET_RESTORE_SESSION_KEY`로만
  // 재조준하면서 `TICKET_DRAFT_SESSION_KEY`(API 소스 스냅샷)가 탭 세션 내내 영구히 지워지지 않는
  // 회귀가 생겼다. 회귀 시나리오: (1) mediate → 티켓 전환(두 키 모두 기록) → "Back to message"로
  // `/mediate` 재마운트(마운트 이펙트가 두 키를 모두 지워야 정상) → (2) 이후 AC-058 게이트를 거치지
  // 않은 두 번째 `/ticket` 진입(브라우저 뒤로/앞으로가기 등)을 시뮬레이션 — `TICKET_DRAFT_SESSION_KEY`가
  // 남아 있으면 `TicketWorkspace`가 그 스테일 원문으로 `POST /api/ticket`을 다시 호출해버린다.
  // 정상 동작은 `no-source` 상태("원본 메시지를 찾을 수 없습니다")를 보여주고 API를 호출하지 않는 것.
  it('M-A — 티켓 전환 후 mediate로 복귀하면 두 세션 키가 모두 지워져, 게이트 없는 재진입은 no-source가 된다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        mediateSuccessResponse({ ticketOption: { offered: true, basis: 'signal_present' } }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = render(<MediationWorkspace />);
    fillAndRun();

    await waitFor(() => {
      expect(screen.getAllByText('Please confirm by tomorrow.').length).toBeGreaterThan(0);
    });

    const recipientPanel = screen.getByLabelText('수신자 패널');
    fireEvent.click(
      within(recipientPanel).getByRole('button', { name: /Convert to Task Ticket/ }),
    );

    expect(window.sessionStorage.getItem(TICKET_DRAFT_SESSION_KEY)).not.toBeNull();
    expect(window.sessionStorage.getItem(TICKET_RESTORE_SESSION_KEY)).not.toBeNull();

    // `/ticket`으로 이동(언마운트) 후 "Back to message"로 `/mediate`에 재마운트한다.
    unmount();
    const { unmount: unmountMediate2 } = render(<MediationWorkspace />);

    expect(window.sessionStorage.getItem(TICKET_RESTORE_SESSION_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(TICKET_DRAFT_SESSION_KEY)).toBeNull();

    unmountMediate2();
    fetchMock.mockClear();

    // 게이트(AC-058, "Convert to Task Ticket" 클릭)를 거치지 않고 다시 `/ticket`에 진입한다
    // (브라우저 Back/Forward, 북마크, 직접 URL 등을 시뮬레이션).
    render(<TicketWorkspace />);

    expect(screen.getByText(/원본 메시지를 찾을 수 없습니다/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/ticket',
      expect.anything(),
    );
  });
});

// T40/AC-005 — "Set response deadline" 진입 버튼은 CRITICAL 메시지에서는 렌더되지 않고
// (비활성이 아니라 미렌더, ticketOffered와 같은 원칙), NORMAL/LOW에서는 렌더된다. 문서가
// 요구하는 대조 확인(둘 다 실행 출력으로 확인) 그대로 두 케이스를 각각 검증한다.
describe('MediationWorkspace — T40 응답 기한 협상 진입 (AC-005)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('① CRITICAL 판정 메시지에서는 "Set response deadline" 진입 수단이 렌더되지 않는다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mediateSuccessResponse({ urgency: 'CRITICAL' }));
    vi.stubGlobal('fetch', fetchMock);
    render(<MediationWorkspace />);
    fillAndRun();

    await waitFor(() => {
      expect(screen.getAllByText('Please confirm by tomorrow.').length).toBeGreaterThan(0);
    });

    const recipientPanel = screen.getByLabelText('수신자 패널');
    expect(within(recipientPanel).queryByRole('button', { name: 'Set response deadline' })).toBeNull();
  });

  it('② NORMAL/LOW 판정 메시지에서는 "Set response deadline" 진입 수단이 렌더된다(항상 미노출이 아님을 대조 확인)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mediateSuccessResponse({ urgency: 'NORMAL' }));
    vi.stubGlobal('fetch', fetchMock);
    render(<MediationWorkspace />);
    fillAndRun();

    await waitFor(() => {
      expect(screen.getAllByText('Please confirm by tomorrow.').length).toBeGreaterThan(0);
    });

    const recipientPanel = screen.getByLabelText('수신자 패널');
    expect(
      within(recipientPanel).getByRole('button', { name: 'Set response deadline' }),
    ).toBeTruthy();
  });

  it('진입 버튼을 클릭하면 UX-005 모달이 열린다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mediateSuccessResponse({ urgency: 'NORMAL' }));
    vi.stubGlobal('fetch', fetchMock);
    render(<MediationWorkspace />);
    fillAndRun();
    await waitFor(() => {
      expect(screen.getAllByText('Please confirm by tomorrow.').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Set response deadline' }));

    expect(screen.getByRole('dialog', { name: '응답 기한 협상' })).toBeTruthy();
  });

  it('모달에서 기한을 확정(Use this deadline)하면 수신자 패널에 참고용으로 표시된다', async () => {
    const futureLocal = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/mediate') return Promise.resolve(mediateSuccessResponse({ urgency: 'NORMAL' }));
      if (url === '/api/deadline/check') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ feasible: true, reason: '근무 시간 내입니다', counterOffers: [] }),
        });
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<MediationWorkspace />);
    fillAndRun();
    await waitFor(() => {
      expect(screen.getAllByText('Please confirm by tomorrow.').length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Set response deadline' }));

    fireEvent.change(screen.getByLabelText('희망 응답 기한'), { target: { value: futureLocal } });
    fireEvent.change(screen.getByLabelText('수신자 타임존(IANA, 예: Asia/Tokyo)'), {
      target: { value: 'Asia/Tokyo' },
    });
    fireEvent.change(screen.getByLabelText('근무 시작'), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText('근무 종료'), { target: { value: '18:00' } });
    fireEvent.click(screen.getByRole('button', { name: '실현 가능성 확인' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '이 기한 사용' })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: '이 기한 사용' }));

    expect(screen.queryByRole('dialog', { name: '응답 기한 협상' })).toBeNull();
    const recipientPanel = screen.getByLabelText('수신자 패널');
    expect(within(recipientPanel).getByText(/참고 응답 기한/)).toBeTruthy();
  });
});

// T54/AC-057②③/AC-063① — HolidayConflict 경고 + "기한 재협상" 진입.
describe('MediationWorkspace — T54 공휴일 경고 표시 + 기한 재협상 진입', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const CONFLICT = { date: '2026-09-25T00:00:00Z', country: 'KR', holidayName: '추석', dayIndex: 2 };

  it('NORMAL/LOW에서 holidayConflicts가 있으면 경고 문구와 "기한 재협상" 링크가 렌더된다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mediateSuccessResponse({ urgency: 'NORMAL', holidayConflicts: [CONFLICT] }),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<MediationWorkspace />);
    fillAndRun();

    await waitFor(() => {
      expect(screen.getByText('이 마감일은 상대 국가 연휴 2일차입니다.')).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: '기한 재협상' })).toBeTruthy();
  });

  it('CRITICAL이면 holidayConflicts가 있어도 경고가 렌더되지 않는다(진입할 UX-005 자체가 없다, AC-005)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mediateSuccessResponse({ urgency: 'CRITICAL', holidayConflicts: [CONFLICT] }),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<MediationWorkspace />);
    fillAndRun();

    await waitFor(() => {
      expect(screen.getAllByText('Please confirm by tomorrow.').length).toBeGreaterThan(0);
    });
    expect(screen.queryByText(/연휴/)).toBeNull();
    expect(screen.queryByRole('button', { name: '기한 재협상' })).toBeNull();
  });

  it('"기한 재협상" 클릭 — 모달이 그 충돌의 날짜로 미리 채워져 열린다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mediateSuccessResponse({ urgency: 'NORMAL', holidayConflicts: [CONFLICT] }),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<MediationWorkspace />);
    fillAndRun();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '기한 재협상' })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: '기한 재협상' }));

    expect(screen.getByRole('dialog', { name: '응답 기한 협상' })).toBeTruthy();
    const input = screen.getByLabelText('희망 응답 기한') as HTMLInputElement;
    expect(input.value).not.toBe('');
  });
});

// T65/AC-078 — "상대방 정보 보강" 링크. 매 keystroke가 아니라 "받는 사람" 필드가 blur될 때만
// `GET /api/enrichment`를 부른다(`MediationWorkspace.tsx`의 `handleRecipientBlur` 헤더 주석 —
// 기존 테스트 스위트가 blur를 발생시키지 않아 부작용이 없다는 것도 그 판단의 근거였다).
describe('MediationWorkspace — T65 상대방 정보 보강 링크(AC-078)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function blurRecipientWith(value: string) {
    const input = screen.getByLabelText('받는 사람');
    fireEvent.change(input, { target: { value } });
    fireEvent.blur(input);
  }

  it('blur 전에는 링크가 렌더되지 않고 /api/enrichment도 호출되지 않는다', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<MediationWorkspace />);

    fireEvent.change(screen.getByLabelText('받는 사람'), { target: { value: 'boss@example.com' } });

    expect(screen.queryByRole('button', { name: '상대방 정보 보강' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('유효한 이메일로 blur되고 showEnrichmentLink:true면 링크가 나타난다', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ showEnrichmentLink: true }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<MediationWorkspace />);

    blurRecipientWith('boss@example.com');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '상대방 정보 보강' })).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/enrichment?recipient=boss%40example.com');
  });

  it('showEnrichmentLink:false면 링크가 나타나지 않는다(AC-078④, 이미 정보가 있음)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ showEnrichmentLink: false }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<MediationWorkspace />);

    blurRecipientWith('boss@example.com');

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: '상대방 정보 보강' })).toBeNull();
  });

  it('유효하지 않은 이메일로 blur되면 /api/enrichment를 호출하지 않는다', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<MediationWorkspace />);

    blurRecipientWith('not-an-email');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('링크 클릭 시 RecipientEnrichmentModal이 열린다', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ showEnrichmentLink: true }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<MediationWorkspace />);
    blurRecipientWith('boss@example.com');
    await waitFor(() => expect(screen.getByRole('button', { name: '상대방 정보 보강' })).toBeTruthy());

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        location: null,
        company: null,
        activityHourHistogram: null,
        activitySampleCount: null,
        activityTimezoneConfirmed: null,
        timezoneCandidates: [],
        activityTimeCandidate: null,
        fetchedAt: null,
        sourceUrl: null,
        showEnrichmentLink: true,
      }),
    });
    fireEvent.click(screen.getByRole('button', { name: '상대방 정보 보강' }));

    expect(screen.getByRole('dialog', { name: '상대방 정보 보강' })).toBeTruthy();
  });
});
