/**
 * UX-015 Sent Messages & Reminder Approval Screen. AC-044(전체). `docs/Tasks.md` T52.
 * `/api/messages`·`/api/messages/{id}`·`/api/messages/{id}/reminder` 호출은 `fetch` 모킹으로
 * 대체한다 — 각 라우트 자체의 배선은 `apps/web/app/api/messages/**` 아래 route.test.ts들이 이미
 * 검증한다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import SentMessagesPage from './page';

function jsonOk(body: unknown) {
  return { ok: true, json: async () => body };
}
function jsonErr(body: unknown = {}) {
  return { ok: false, json: async () => body };
}

const REPLIED_ITEM = {
  id: 'msg-replied',
  recipient: 'a@example.com',
  recipientCountry: null,
  finalText: '확인했습니다.',
  urgency: 'NORMAL',
  sentAt: '2026-08-01T00:00:00Z',
  replied: true,
  repliedMarkedAt: '2026-08-02T00:00:00Z',
  businessDaysElapsed: null,
  reminderSuggested: false,
  isReminder: false,
  mediationApplied: true,
};

const BELOW_THRESHOLD_ITEM = {
  id: 'msg-below',
  recipient: 'b@example.com',
  recipientCountry: null,
  finalText: 'Please confirm by tomorrow.',
  urgency: 'NORMAL',
  sentAt: '2026-08-09T00:00:00Z',
  replied: false,
  repliedMarkedAt: null,
  businessDaysElapsed: 1,
  reminderSuggested: false,
  isReminder: false,
  mediationApplied: true,
};

const THRESHOLD_ITEM = {
  id: 'msg-threshold',
  recipient: 'c@example.com',
  recipientCountry: null,
  finalText: 'Please confirm by tomorrow.',
  urgency: 'NORMAL',
  sentAt: '2026-08-05T00:00:00Z',
  replied: false,
  repliedMarkedAt: null,
  businessDaysElapsed: 3,
  reminderSuggested: true,
  isReminder: false,
  mediationApplied: true,
};

function mockRoute(handlers: Record<string, (init?: RequestInit) => unknown>) {
  mockFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const key = `${method} ${url}`;
    if (key in handlers) {
      return Promise.resolve(handlers[key](init));
    }
    return Promise.reject(new Error(`unexpected fetch: ${key}`));
  });
}

describe('SentMessagesPage (UX-015) — AC-044', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Loading — 초기 렌더에서 스켈레톤을 보여준다', () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<SentMessagesPage />);

    expect(screen.getByLabelText('발송 내역 불러오는 중')).toBeTruthy();
  });

  it('Error — 조회 실패 시 에러 배너와 재시도 버튼을 보여준다', async () => {
    mockFetch.mockResolvedValue(jsonErr());
    render(<SentMessagesPage />);

    await waitFor(() => {
      expect(screen.getByText('불러오지 못했습니다, 다시 시도해주세요')).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy();
  });

  it('Empty — 발송 건이 없으면 안내 문구를 보여준다', async () => {
    mockRoute({ 'GET /api/messages': () => jsonOk({ items: [] }) });
    render(<SentMessagesPage />);

    await waitFor(() => {
      expect(screen.getByText('발송한 메시지가 없습니다')).toBeTruthy();
    });
  });

  it('Replied-Marked — 답장 받음 건은 정적 태그만 보이고 리마인드 액션이 없다', async () => {
    mockRoute({ 'GET /api/messages': () => jsonOk({ items: [REPLIED_ITEM] }) });
    render(<SentMessagesPage />);

    await waitFor(() => {
      expect(screen.getByText('답장 받음')).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: '리마인드 검토' })).toBeNull();
  });

  it('Row-BelowThreshold — 임계값 미만이면 경과일만 표시하고 리마인드 액션이 없다', async () => {
    mockRoute({ 'GET /api/messages': () => jsonOk({ items: [BELOW_THRESHOLD_ITEM] }) });
    render(<SentMessagesPage />);

    await waitFor(() => {
      expect(screen.getByText('경과 1일')).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: '리마인드 검토' })).toBeNull();
    expect(screen.getByRole('button', { name: '답장 받음' })).toBeTruthy();
  });

  it('Row-ThresholdReached — 임계값 이상이면 무응답 배지 + 리마인드 검토 버튼을 보여준다', async () => {
    mockRoute({ 'GET /api/messages': () => jsonOk({ items: [THRESHOLD_ITEM] }) });
    render(<SentMessagesPage />);

    await waitFor(() => {
      expect(screen.getByText('무응답 3일째')).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: '리마인드 검토' })).toBeTruthy();
  });

  it('"답장 받음" 클릭 — PATCH로 마킹하고 성공하면 리마인드 액션이 사라진다', async () => {
    mockRoute({
      'GET /api/messages': () => jsonOk({ items: [THRESHOLD_ITEM] }),
      'PATCH /api/messages/msg-threshold': () =>
        jsonOk({ id: 'msg-threshold', replied: true, repliedMarkedAt: '2026-08-10T00:00:00Z', scheduledFor: null }),
    });
    render(<SentMessagesPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: '답장 받음' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '답장 받음' }));

    await waitFor(() => {
      expect(screen.getByText('답장 받음')).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: '리마인드 검토' })).toBeNull();
  });

  it('"답장 받음" 실패 — 인라인 에러를 보여주고 상태를 되돌리지 않는다(그대로 재시도 가능)', async () => {
    mockRoute({
      'GET /api/messages': () => jsonOk({ items: [THRESHOLD_ITEM] }),
      'PATCH /api/messages/msg-threshold': () => jsonErr({ error: { message: '저장 실패 상세' } }),
    });
    render(<SentMessagesPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: '답장 받음' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '답장 받음' }));

    await waitFor(() => {
      expect(screen.getByText('저장 실패 상세')).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: '리마인드 검토' })).toBeTruthy();
  });

  it('리마인드 검토 — 초안을 로드해 편집 가능한 텍스트로 보여준다', async () => {
    mockRoute({
      'GET /api/messages': () => jsonOk({ items: [THRESHOLD_ITEM] }),
      'POST /api/messages/msg-threshold/reminder': () =>
        jsonOk({ draftText: 'Following up once more.', source: 'live' }),
    });
    render(<SentMessagesPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: '리마인드 검토' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '리마인드 검토' }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('Following up once more.')).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: 'Approve & Send' })).toBeTruthy();
  });

  it('리마인드 검토 실패 — 인라인 에러 + 다시 시도, Approve & Send는 뜨지 않는다', async () => {
    mockRoute({
      'GET /api/messages': () => jsonOk({ items: [THRESHOLD_ITEM] }),
      'POST /api/messages/msg-threshold/reminder': () => jsonErr(),
    });
    render(<SentMessagesPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: '리마인드 검토' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '리마인드 검토' }));

    await waitFor(() => {
      expect(screen.getByText('리마인드 문구 생성 실패')).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: 'Approve & Send' })).toBeNull();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy();
  });

  it('Approve & Send — 편집한 문구로 승인하면 클릭 즉시 비활성화되고 성공 후 발송 로그를 보여준다', async () => {
    mockRoute({
      'GET /api/messages': () => jsonOk({ items: [THRESHOLD_ITEM] }),
      'POST /api/messages/msg-threshold/reminder': () =>
        jsonOk({ draftText: 'Following up once more.', source: 'live' }),
      'POST /api/messages': () => jsonOk({ sentAt: '2026-08-10T09:00:00Z' }),
    });
    render(<SentMessagesPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: '리마인드 검토' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '리마인드 검토' }));
    await waitFor(() => expect(screen.getByDisplayValue('Following up once more.')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('리마인드 문구(편집 가능)'), {
      target: { value: '수정한 문구' },
    });
    const approveButton = screen.getByRole('button', { name: 'Approve & Send' });
    fireEvent.click(approveButton);

    // 클릭 즉시 비활성화(중복 발송 방지) — sending 상태에서 textarea도 잠긴다.
    expect((screen.getByLabelText('리마인드 문구(편집 가능)') as HTMLTextAreaElement).disabled).toBe(true);

    await waitFor(() => {
      expect(screen.getByText(/리마인드 발송됨/)).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: 'Approve & Send' })).toBeNull();

    const sendCall = mockFetch.mock.calls.find(
      (call: unknown[]) =>
        String(call[0]) === '/api/messages' && (call[1] as RequestInit | undefined)?.method === 'POST',
    );
    expect(sendCall).toBeTruthy();
    const sentBody = JSON.parse((sendCall![1] as RequestInit).body as string);
    expect(sentBody).toMatchObject({
      finalText: '수정한 문구',
      isReminder: true,
      parentMessageId: 'msg-threshold',
    });
  });

  it('Approve & Send 실패 — 인라인 에러를 보여주고 리뷰 상태로 되돌려 재시도 가능하게 한다', async () => {
    mockRoute({
      'GET /api/messages': () => jsonOk({ items: [THRESHOLD_ITEM] }),
      'POST /api/messages/msg-threshold/reminder': () =>
        jsonOk({ draftText: 'Following up once more.', source: 'live' }),
      'POST /api/messages': () => jsonErr({ error: { message: '발송 실패 상세' } }),
    });
    render(<SentMessagesPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: '리마인드 검토' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '리마인드 검토' }));
    await waitFor(() => expect(screen.getByDisplayValue('Following up once more.')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Approve & Send' }));

    await waitFor(() => {
      expect(screen.getByText('발송 실패 상세')).toBeTruthy();
    });
    // 리뷰 상태로 복귀 — 다시 승인 시도할 수 있어야 한다.
    expect(screen.getByRole('button', { name: 'Approve & Send' })).toBeTruthy();
  });
});
