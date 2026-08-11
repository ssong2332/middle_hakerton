/**
 * `DELETE /api/samples/{id}` — `docs/API.md:335` (UX-019, UF-021) / AC-081④. `docs/Tasks.md` T72.
 * `deleteSample()`은 모킹한다 — 쿼리 구성 검증은 `apps/web/lib/samples/storage.test.ts`의 몫.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/auth', () => ({
  resolveSession: vi.fn(),
}));
vi.mock('../../../../lib/samples/storage', () => ({
  deleteSample: vi.fn(),
}));

import { NotFoundError } from '@cross-border/core';
import { resolveSession } from '../../../../lib/auth';
import { deleteSample } from '../../../../lib/samples/storage';
import { DELETE } from './route';

const mockResolveSession = vi.mocked(resolveSession);
const mockDeleteSample = vi.mocked(deleteSample);

function fakeClient() {
  return {} as never;
}

function deleteRequest(id: string): Request {
  return new Request(`http://localhost/api/samples/${id}`, { method: 'DELETE' });
}

describe('DELETE /api/samples/{id} — AC-081④', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('URL에서 id를 파싱해 deleteSample에 위임하고 200으로 응답한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient() });
    mockDeleteSample.mockResolvedValue(undefined);

    const response = await DELETE(deleteRequest('sample-1'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockDeleteSample).toHaveBeenCalledWith(expect.anything(), 'user-1', 'sample-1');
    expect(body).toEqual({ id: 'sample-1' });
  });

  it('존재하지 않는 표본이면 404를 반환한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient() });
    mockDeleteSample.mockRejectedValue(new NotFoundError('표본을 찾을 수 없습니다'));

    const response = await DELETE(deleteRequest('sample-x'));

    expect(response.status).toBe(404);
  });

  it('인증되지 않은 요청은 401을 반환한다', async () => {
    mockResolveSession.mockResolvedValue(null);

    const response = await DELETE(deleteRequest('sample-1'));

    expect(response.status).toBe(401);
    expect(mockDeleteSample).not.toHaveBeenCalled();
  });
});
