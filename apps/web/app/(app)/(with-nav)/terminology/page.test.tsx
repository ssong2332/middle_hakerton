/**
 * UX-010 Terminology Dictionary Management Screen — `docs/UX.md` "Terminology Dictionary
 * Management Screen (Screen ID: UX-010)". AC-015(뒷단 — C5 소비, 이 화면은 CRUD만), AC-016,
 * AC-047. `docs/Tasks.md` T23.
 *
 * 편집/삭제 상호배타 테스트(F-1류, `apps/web/app/(app)/(with-nav)/profile/page.tsx`의 T21
 * 리뷰 교훈을 선제 적용): (a) 삭제-확인이 열린 채로 같은 행 수정을 누르면 확인이 닫히고 편집이
 * 열린다, (b) 편집이 열린 채로 같은 행 삭제를 누르면 편집이 닫히고 확인이 열린다, (c) 삭제가
 * 진행 중인 동안(deferred promise로 pending 구간을 실제로 재현) 같은 행 수정 버튼은 비활성화된다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import TerminologyPage from './page';

const TERM_ENTRY = {
  id: 'entry-1',
  entryType: 'term',
  sourceText: 'SLA',
  targetText: 'Service Level Agreement',
  koHonorific: null,
  enHonorific: null,
  note: null,
};

const PERSON_ENTRY = {
  id: 'entry-2',
  entryType: 'person',
  sourceText: '김수진',
  targetText: null,
  koHonorific: '김 대리님',
  enHonorific: 'Sujin Kim',
  note: null,
};

function jsonOk(body: unknown) {
  return { ok: true, json: async () => body };
}

function mockLoadSuccess(items: unknown[]) {
  mockFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url === '/api/dictionary' && method === 'GET') {
      return Promise.resolve(jsonOk({ items }));
    }
    return Promise.reject(new Error(`unexpected fetch: ${method} ${url}`));
  });
}

describe('TerminologyPage (UX-010) — AC-016/AC-047', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Loading — 초기 렌더에서 스켈레톤을 보여준다', () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<TerminologyPage />);

    expect(screen.getByLabelText('용어사전 불러오는 중')).toBeTruthy();
  });

  it('Error — 조회 실패 시 에러 배너와 재시도 버튼을 보여준다', async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    render(<TerminologyPage />);

    await waitFor(() => {
      expect(screen.getByText('불러오지 못했습니다, 다시 시도해주세요')).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy();
  });

  it('Error → 재시도를 누르면 다시 조회해 성공하면 화면을 보여준다', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    render(<TerminologyPage />);
    await waitFor(() => {
      expect(screen.getByText('불러오지 못했습니다, 다시 시도해주세요')).toBeTruthy();
    });

    mockLoadSuccess([TERM_ENTRY]);
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    await waitFor(() => {
      expect(screen.getByText('SLA')).toBeTruthy();
    });
  });

  it('Empty — 등록된 용어가 없으면 안내 문구를 보여주고 추가 폼은 그대로 노출된다', async () => {
    mockLoadSuccess([]);
    render(<TerminologyPage />);

    await waitFor(() => {
      expect(screen.getByText('등록된 용어가 없습니다. 첫 용어를 추가하세요')).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: '용어' })).toBeTruthy();
  });

  it('Success — 목록의 각 항목이 텍스트로 유형 태그(용어/사람·호칭)를 보여준다', async () => {
    mockLoadSuccess([TERM_ENTRY, PERSON_ENTRY]);
    render(<TerminologyPage />);

    await waitFor(() => {
      expect(screen.getByText('SLA')).toBeTruthy();
    });
    const termRow = screen.getByText('SLA').closest('li') as HTMLElement;
    expect(within(termRow).getByText('용어')).toBeTruthy();
    const personRow = screen.getByText('김수진').closest('li') as HTMLElement;
    expect(within(personRow).getByText('사람·호칭')).toBeTruthy();
  });

  it('추가 — 용어를 입력해 추가하면 POST /api/dictionary를 호출하고 목록에 반영한다', async () => {
    mockLoadSuccess([]);
    render(<TerminologyPage />);
    await waitFor(() => screen.getByText('등록된 용어가 없습니다. 첫 용어를 추가하세요'));

    fireEvent.change(screen.getByLabelText('용어'), { target: { value: 'KPI' } });
    mockFetch.mockResolvedValueOnce(
      jsonOk({ id: 'entry-3', entryType: 'term', sourceText: 'KPI', targetText: null, koHonorific: null, enHonorific: null, note: null }),
    );
    fireEvent.click(screen.getByRole('button', { name: '추가' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/dictionary',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"sourceText":"KPI"'),
        }),
      );
    });
    await waitFor(() => {
      expect(screen.getByText('KPI')).toBeTruthy();
    });
  });

  it('추가 검증 — 용어 필드가 비어 있으면 추가 버튼이 비활성화되어 있고 POST가 나가지 않는다', async () => {
    mockLoadSuccess([]);
    render(<TerminologyPage />);
    await waitFor(() => screen.getByText('등록된 용어가 없습니다. 첫 용어를 추가하세요'));

    const addButton = screen.getByRole('button', { name: '추가' }) as HTMLButtonElement;
    expect(addButton.disabled).toBe(true);
    fireEvent.click(addButton);
    expect(mockFetch).not.toHaveBeenCalledWith(
      '/api/dictionary',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('사람·호칭 추가 — 엔트리 타입을 사람·호칭으로 바꾸면 실명/한국어 호칭/영어 호칭 필드가 나타난다', async () => {
    mockLoadSuccess([]);
    render(<TerminologyPage />);
    await waitFor(() => screen.getByText('등록된 용어가 없습니다. 첫 용어를 추가하세요'));

    fireEvent.click(screen.getByRole('button', { name: '사람·호칭' }));

    expect(screen.getByLabelText('실명')).toBeTruthy();
    expect(screen.getByLabelText('한국어 호칭')).toBeTruthy();
    expect(screen.getByLabelText('영어 호칭')).toBeTruthy();
  });

  it('사람·호칭 검증 — 실명은 채웠지만 호칭이 둘 다 비어 있으면 추가 버튼이 비활성화된다', async () => {
    mockLoadSuccess([]);
    render(<TerminologyPage />);
    await waitFor(() => screen.getByText('등록된 용어가 없습니다. 첫 용어를 추가하세요'));

    fireEvent.click(screen.getByRole('button', { name: '사람·호칭' }));
    fireEvent.change(screen.getByLabelText('실명'), { target: { value: '김수진' } });

    const addButton = screen.getByRole('button', { name: '추가' }) as HTMLButtonElement;
    expect(addButton.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('한국어 호칭'), { target: { value: '김 대리님' } });
    expect(addButton.disabled).toBe(false);
  });

  it('추가 실패(409 중복) — 서버가 반환한 중복 메시지를 인라인으로 보여준다', async () => {
    mockLoadSuccess([]);
    render(<TerminologyPage />);
    await waitFor(() => screen.getByText('등록된 용어가 없습니다. 첫 용어를 추가하세요'));

    fireEvent.change(screen.getByLabelText('용어'), { target: { value: 'SLA' } });
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: { code: 'CONFLICT_DUPLICATE_ENTRY', message: '이미 등록된 용어입니다', retryable: false } }),
    });
    fireEvent.click(screen.getByRole('button', { name: '추가' }));

    await waitFor(() => {
      expect(screen.getByText('이미 등록된 용어입니다')).toBeTruthy();
    });
  });

  it('수정 — 항목을 편집해 저장하면 PUT을 호출하고 화면 값을 갱신한다', async () => {
    mockLoadSuccess([TERM_ENTRY]);
    render(<TerminologyPage />);
    await waitFor(() => screen.getByText('SLA'));

    const row = screen.getByText('SLA').closest('li') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: '수정' }));

    const targetInput = within(row).getByLabelText('번역/대응어') as HTMLInputElement;
    fireEvent.change(targetInput, { target: { value: '서비스 수준 계약' } });

    mockFetch.mockResolvedValueOnce(jsonOk({ ...TERM_ENTRY, targetText: '서비스 수준 계약' }));
    fireEvent.click(within(row).getByRole('button', { name: '저장' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/dictionary/entry-1',
        expect.objectContaining({ method: 'PUT' }),
      );
    });
    await waitFor(() => {
      expect(screen.getByText('서비스 수준 계약')).toBeTruthy();
    });
  });

  it('삭제 — 확인 없이는 삭제되지 않고, 확인을 눌러야 DELETE가 호출된다', async () => {
    mockLoadSuccess([TERM_ENTRY]);
    render(<TerminologyPage />);
    await waitFor(() => screen.getByText('SLA'));

    const row = screen.getByText('SLA').closest('li') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: '삭제' }));

    expect(screen.getByText('삭제하시겠습니까?')).toBeTruthy();
    expect(mockFetch).not.toHaveBeenCalledWith(
      '/api/dictionary/entry-1',
      expect.objectContaining({ method: 'DELETE' }),
    );

    mockFetch.mockResolvedValueOnce(jsonOk({ id: 'entry-1' }));
    const confirmBox = within(row).getByRole('alert');
    fireEvent.click(within(confirmBox).getByRole('button', { name: '삭제' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/dictionary/entry-1', { method: 'DELETE' });
    });
    await waitFor(() => {
      expect(screen.queryByText('SLA')).toBeNull();
    });
  });

  it('F-1(a) — 삭제 확인 중 같은 행의 수정을 누르면 확인 상자가 닫히고 편집 폼만 열린다', async () => {
    mockLoadSuccess([TERM_ENTRY]);
    render(<TerminologyPage />);
    await waitFor(() => screen.getByText('SLA'));

    const row = screen.getByText('SLA').closest('li') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: '삭제' }));
    expect(within(row).getByText('삭제하시겠습니까?')).toBeTruthy();

    fireEvent.click(within(row).getByRole('button', { name: '수정' }));

    expect(within(row).queryByText('삭제하시겠습니까?')).toBeNull();
    expect(within(row).getByLabelText('번역/대응어')).toBeTruthy();
  });

  it('F-1(b) — 편집 중 같은 행의 삭제를 누르면 편집 폼이 닫히고 확인 상자만 열린다', async () => {
    mockLoadSuccess([TERM_ENTRY]);
    render(<TerminologyPage />);
    await waitFor(() => screen.getByText('SLA'));

    const row = screen.getByText('SLA').closest('li') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: '수정' }));
    expect(within(row).getByLabelText('번역/대응어')).toBeTruthy();

    fireEvent.click(within(row).getByRole('button', { name: '삭제' }));

    expect(within(row).queryByLabelText('번역/대응어')).toBeNull();
    expect(within(row).getByText('삭제하시겠습니까?')).toBeTruthy();
  });

  it('F-1(c) — 삭제가 진행 중인 동안에는 같은 행의 수정 버튼이 비활성화된다', async () => {
    mockLoadSuccess([TERM_ENTRY]);
    render(<TerminologyPage />);
    await waitFor(() => screen.getByText('SLA'));

    const row = screen.getByText('SLA').closest('li') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: '삭제' }));
    const confirmBox = within(row).getByRole('alert');

    let resolveDelete: (value: unknown) => void = () => {};
    const deletePromise = new Promise((resolve) => {
      resolveDelete = resolve;
    });
    mockFetch.mockImplementationOnce(() => deletePromise);
    fireEvent.click(within(confirmBox).getByRole('button', { name: '삭제' }));

    await waitFor(() => {
      const editButton = within(row).getByRole('button', { name: '수정' }) as HTMLButtonElement;
      expect(editButton.disabled).toBe(true);
    });

    resolveDelete(jsonOk({ id: 'entry-1' }));
    await waitFor(() => {
      expect(screen.queryByText('SLA')).toBeNull();
    });
  });
});
