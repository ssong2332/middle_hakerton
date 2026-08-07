/**
 * `PUT / DELETE /api/dictionary/{id}` — `docs/API.md` "GET / POST /api/dictionary · PUT / DELETE
 * /api/dictionary/{id}" (UX-010, UF-007) · `docs/Tasks.md` T23. 이 리포의 두 번째 `[id]` 동적
 * 세그먼트 라우트 — `apps/web/app/api/profile/learned/[id]/route.ts`(T21)와 같은 패턴으로
 * `request.url`에서 id를 파싱한다. `resolveSession()`·저장소 함수는 모킹한다. AC-016, AC-047.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/auth', () => ({
  resolveSession: vi.fn(),
}));
vi.mock('../../../../lib/dictionary/storage', () => ({
  updateDictionaryEntry: vi.fn(),
  deleteDictionaryEntry: vi.fn(),
}));

import { DuplicateEntryError, NotFoundError } from '@cross-border/core';
import { resolveSession } from '../../../../lib/auth';
import { deleteDictionaryEntry, updateDictionaryEntry } from '../../../../lib/dictionary/storage';
import { DELETE, PUT } from './route';

const mockResolveSession = vi.mocked(resolveSession);
const mockUpdate = vi.mocked(updateDictionaryEntry);
const mockDelete = vi.mocked(deleteDictionaryEntry);

const fakeClient = { from: vi.fn() } as never;

function putRequest(id: string, body: unknown): Request {
  return new Request(`http://localhost/api/dictionary/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function deleteRequest(id: string): Request {
  return new Request(`http://localhost/api/dictionary/${id}`, { method: 'DELETE' });
}

describe('PUT /api/dictionary/{id} — AC-016/AC-047', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient });
  });

  it('URL 마지막 세그먼트를 id로 파싱해 세션 userId·본문과 함께 updateDictionaryEntry에 위임한다', async () => {
    mockUpdate.mockResolvedValue({
      id: 'entry-1',
      entryType: 'term',
      sourceText: 'SLA',
      targetText: '변경됨',
      koHonorific: null,
      enHonorific: null,
      note: null,
    });

    const response = await PUT(
      putRequest('entry-1', { entryType: 'term', sourceText: 'SLA', targetText: '변경됨' }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      fakeClient,
      'user-1',
      'entry-1',
      expect.objectContaining({ entryType: 'term', sourceText: 'SLA', targetText: '변경됨' }),
    );
    expect(body.targetText).toBe('변경됨');
  });

  it('person 엔트리에 한국어/영어 호칭이 둘 다 없으면 400 VALIDATION_FAILED를 반환한다', async () => {
    const response = await PUT(putRequest('entry-1', { entryType: 'person', sourceText: '김수진' }));

    expect(response.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('대상이 없으면(NotFoundError) 404를 반환한다', async () => {
    mockUpdate.mockRejectedValue(new NotFoundError('용어를 찾을 수 없습니다'));

    const response = await PUT(putRequest('missing-id', { entryType: 'term', sourceText: 'SLA' }));

    expect(response.status).toBe(404);
  });

  it('중복이면(DuplicateEntryError) 409를 반환한다', async () => {
    mockUpdate.mockRejectedValue(new DuplicateEntryError('이미 등록된 용어입니다'));

    const response = await PUT(putRequest('entry-1', { entryType: 'term', sourceText: 'SLA' }));

    expect(response.status).toBe(409);
  });

  it('인증되지 않은 요청은 401 AUTH_REQUIRED를 반환하고 수정을 호출하지 않는다', async () => {
    mockResolveSession.mockResolvedValue(null);

    const response = await PUT(putRequest('entry-1', { entryType: 'term', sourceText: 'SLA' }));

    expect(response.status).toBe(401);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/dictionary/{id} — AC-016', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient });
  });

  it('URL 마지막 세그먼트를 id로 파싱해 세션 userId와 함께 deleteDictionaryEntry에 위임한다', async () => {
    mockDelete.mockResolvedValue(undefined);

    const response = await DELETE(deleteRequest('entry-1'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockDelete).toHaveBeenCalledWith(fakeClient, 'user-1', 'entry-1');
    expect(body).toEqual({ id: 'entry-1' });
  });

  it('대상이 없으면(NotFoundError) 404를 반환한다', async () => {
    mockDelete.mockRejectedValue(new NotFoundError('용어를 찾을 수 없습니다'));

    const response = await DELETE(deleteRequest('missing-id'));

    expect(response.status).toBe(404);
  });

  it('인증되지 않은 요청은 401 AUTH_REQUIRED를 반환하고 삭제를 호출하지 않는다', async () => {
    mockResolveSession.mockResolvedValue(null);

    const response = await DELETE(deleteRequest('entry-1'));

    expect(response.status).toBe(401);
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
