/**
 * `GET / POST /api/dictionary` — `docs/API.md` "GET / POST /api/dictionary · PUT / DELETE
 * /api/dictionary/{id}" (UX-010, UF-007) · `docs/Tasks.md` T23. `resolveSession()`과 저장소
 * 함수(`fetchDictionaryEntriesDetailed`/`createDictionaryEntry`)는 모킹한다 — 실제 쿼리 구성
 * 검증은 `apps/web/lib/dictionary/storage.test.ts`의 몫이다. 여기서는 라우트 배선(검증 → 저장
 * 호출 → 응답 조합 → 상태 코드)만 본다. AC-016, AC-047.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/auth', () => ({
  resolveSession: vi.fn(),
}));
vi.mock('../../../lib/dictionary/storage', () => ({
  fetchDictionaryEntriesDetailed: vi.fn(),
  createDictionaryEntry: vi.fn(),
}));

import { DuplicateEntryError } from '@cross-border/core';
import { resolveSession } from '../../../lib/auth';
import { createDictionaryEntry, fetchDictionaryEntriesDetailed } from '../../../lib/dictionary/storage';
import { GET, POST } from './route';

const mockResolveSession = vi.mocked(resolveSession);
const mockFetchDetailed = vi.mocked(fetchDictionaryEntriesDetailed);
const mockCreate = vi.mocked(createDictionaryEntry);

const fakeClient = { from: vi.fn() } as never;

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/dictionary', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function plainRequest(method: string): Request {
  return new Request('http://localhost/api/dictionary', { method });
}

describe('GET /api/dictionary — AC-016', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient });
  });

  it('세션 userId로 fetchDictionaryEntriesDetailed에 위임하고 200으로 items를 응답한다', async () => {
    mockFetchDetailed.mockResolvedValue([
      {
        id: 'entry-1',
        entryType: 'term',
        sourceText: 'SLA',
        targetText: 'SLA',
        koHonorific: null,
        enHonorific: null,
        note: null,
      },
    ]);

    const response = await GET(plainRequest('GET'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockFetchDetailed).toHaveBeenCalledWith(fakeClient, 'user-1');
    expect(body).toEqual({
      items: [
        {
          id: 'entry-1',
          entryType: 'term',
          sourceText: 'SLA',
          targetText: 'SLA',
          koHonorific: null,
          enHonorific: null,
          note: null,
        },
      ],
    });
  });

  it('인증되지 않은 요청은 401 AUTH_REQUIRED를 반환하고 조회를 호출하지 않는다', async () => {
    mockResolveSession.mockResolvedValue(null);

    const response = await GET(plainRequest('GET'));

    expect(response.status).toBe(401);
    expect(mockFetchDetailed).not.toHaveBeenCalled();
  });
});

describe('POST /api/dictionary — AC-016/AC-047', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient });
  });

  it('term 엔트리를 세션 userId와 함께 createDictionaryEntry에 위임하고 201로 응답한다', async () => {
    mockCreate.mockResolvedValue({
      id: 'entry-1',
      entryType: 'term',
      sourceText: 'SLA',
      targetText: 'Service Level Agreement',
      koHonorific: null,
      enHonorific: null,
      note: null,
    });

    const response = await POST(
      jsonRequest({ entryType: 'term', sourceText: 'SLA', targetText: 'Service Level Agreement' }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      fakeClient,
      'user-1',
      expect.objectContaining({ entryType: 'term', sourceText: 'SLA' }),
    );
    expect(body.id).toBe('entry-1');
  });

  it('person 엔트리는 한국어/영어 호칭 중 하나만 있어도 통과한다', async () => {
    mockCreate.mockResolvedValue({
      id: 'entry-2',
      entryType: 'person',
      sourceText: '김수진',
      targetText: null,
      koHonorific: '김 대리님',
      enHonorific: null,
      note: null,
    });

    const response = await POST(
      jsonRequest({ entryType: 'person', sourceText: '김수진', koHonorific: '김 대리님' }),
    );

    expect(response.status).toBe(201);
    expect(mockCreate).toHaveBeenCalled();
  });

  it('person 엔트리에 한국어/영어 호칭이 둘 다 없으면 400 VALIDATION_FAILED를 반환한다', async () => {
    const response = await POST(jsonRequest({ entryType: 'person', sourceText: '김수진' }));

    expect(response.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('sourceText가 비어 있으면 400 VALIDATION_FAILED를 반환한다', async () => {
    const response = await POST(jsonRequest({ entryType: 'term', sourceText: '' }));

    expect(response.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('중복이면(DuplicateEntryError) 409를 반환한다', async () => {
    mockCreate.mockRejectedValue(new DuplicateEntryError('이미 등록된 용어입니다'));

    const response = await POST(jsonRequest({ entryType: 'term', sourceText: 'SLA' }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.message).toBe('이미 등록된 용어입니다');
  });

  it('인증되지 않은 요청은 401 AUTH_REQUIRED를 반환하고 생성을 호출하지 않는다', async () => {
    mockResolveSession.mockResolvedValue(null);

    const response = await POST(jsonRequest({ entryType: 'term', sourceText: 'SLA' }));

    expect(response.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
