/**
 * `DELETE /api/profile/learned/{id}` — `docs/API.md` "GET /api/profile/learned · DELETE
 * /api/profile/learned/{id}" · `docs/Tasks.md` T21. 이 리포의 첫 `[id]` 동적 세그먼트 라우트 —
 * `withApi()`가 params를 받지 않으므로 `request.url`에서 id를 파싱한다(`route.ts` 헤더 참조).
 * `resolveSession()`·`deleteLearnedItem()`은 모킹한다. AC-013, AC-014.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../lib/auth', () => ({
  resolveSession: vi.fn(),
}));
vi.mock('../../../../../lib/profile/storage', () => ({
  deleteLearnedItem: vi.fn(),
}));

import { NotFoundError } from '@cross-border/core';
import { resolveSession } from '../../../../../lib/auth';
import { deleteLearnedItem } from '../../../../../lib/profile/storage';
import { DELETE } from './route';

const mockResolveSession = vi.mocked(resolveSession);
const mockDeleteLearnedItem = vi.mocked(deleteLearnedItem);

const fakeClient = { from: vi.fn() } as never;

function deleteRequest(id: string): Request {
  return new Request(`http://localhost/api/profile/learned/${id}`, { method: 'DELETE' });
}

describe('DELETE /api/profile/learned/{id}', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient });
  });

  it('URL 마지막 세그먼트를 id로 파싱해 세션 userId와 함께 deleteLearnedItem에 위임한다', async () => {
    mockDeleteLearnedItem.mockResolvedValue(undefined);

    const response = await DELETE(deleteRequest('item-1'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockDeleteLearnedItem).toHaveBeenCalledWith(fakeClient, 'user-1', 'item-1');
    expect(body).toEqual({ id: 'item-1' });
  });

  it('대상이 없으면(NotFoundError) 404 NOT_FOUND를 반환한다', async () => {
    mockDeleteLearnedItem.mockRejectedValue(new NotFoundError('학습 항목을 찾을 수 없습니다'));

    const response = await DELETE(deleteRequest('missing-id'));

    expect(response.status).toBe(404);
  });

  it('인증되지 않은 요청은 401 AUTH_REQUIRED를 반환하고 삭제를 호출하지 않는다', async () => {
    mockResolveSession.mockResolvedValue(null);

    const response = await DELETE(deleteRequest('item-1'));

    expect(response.status).toBe(401);
    expect(mockDeleteLearnedItem).not.toHaveBeenCalled();
  });
});
