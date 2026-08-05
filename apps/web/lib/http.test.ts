/**
 * `withApi()` — HTTP 경계 단일 지점. `docs/API.md` Conventions/Error codes 표를 그대로 따르는지
 * 검증한다. `resolveSession()`은 모킹한다 — 실제 세션 해석 구현은 T45 범위(`lib/auth.ts` 참조).
 */
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { NotFoundError, ValidationError } from '@cross-border/core';

vi.mock('./auth', () => ({
  resolveSession: vi.fn(),
}));

import { resolveSession } from './auth';
import { withApi } from './http';

const mockResolveSession = vi.mocked(resolveSession);

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/test', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('withApi', () => {
  it('requireAuth 기본값(true)에서 세션이 없으면 401 AUTH_REQUIRED를 반환하고 핸들러를 호출하지 않는다', async () => {
    mockResolveSession.mockResolvedValue(null);
    const handler = vi.fn();
    const route = withApi({}, handler);

    const response = await route(jsonRequest({}));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: { code: 'AUTH_REQUIRED', message: expect.any(String), retryable: false },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('requireAuth:false면 resolveSession을 호출하지 않고 session:null로 핸들러를 실행한다', async () => {
    mockResolveSession.mockClear();
    const handler = vi.fn().mockResolvedValue({ ok: true });
    const route = withApi({ requireAuth: false }, handler);

    const response = await route(jsonRequest({}));
    const body = await response.json();

    expect(resolveSession).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ session: null }));
  });

  it('schema 검증에 실패하면 400 VALIDATION_FAILED를 반환한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    const schema = z.object({ text: z.string().min(1) });
    const handler = vi.fn();
    const route = withApi({ schema, requireAuth: true }, handler);

    const response = await route(jsonRequest({ text: '' }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(handler).not.toHaveBeenCalled();
  });

  it('인증·검증을 통과하면 핸들러에 파싱된 input과 session을 넘기고 200으로 결과를 반환한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    const schema = z.object({ text: z.string() });
    const handler = vi.fn().mockResolvedValue({ echoed: 'hi' });
    const route = withApi({ schema, requireAuth: true }, handler);

    const response = await route(jsonRequest({ text: 'hi' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ echoed: 'hi' });
    expect(handler).toHaveBeenCalledWith({
      input: { text: 'hi' },
      request: expect.any(Request),
      session: { userId: 'user-1' },
    });
  });

  // T14 — `POST /api/messages`는 201을 반환해야 한다(`docs/API.md` "POST /api/messages" Response
  // 201). 기본값은 여전히 200(기존 라우트 전부 무변경)이며, `successStatus` 옵션을 준 라우트만
  // 바뀐 상태 코드를 쓴다.
  it('successStatus 옵션을 주면 그 상태 코드로 성공 응답을 반환한다(T14, 기본값 200 유지)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    const handler = vi.fn().mockResolvedValue({ created: true });
    const route = withApi({ requireAuth: true, successStatus: 201 }, handler);

    const response = await route(jsonRequest({}));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({ created: true });
  });

  it('핸들러가 CoreError를 던지면 그 code/retryable에 맞는 HTTP 상태로 매핑한다 (Route Handler 본문의 try/catch를 대신한다)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    const handler = vi.fn().mockRejectedValue(new NotFoundError('없음'));
    const route = withApi({ requireAuth: true }, handler);

    const response = await route(jsonRequest({}));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: { code: 'NOT_FOUND', message: '없음', retryable: false } });
  });

  it('핸들러가 일반 Error를 던지면 500 INTERNAL로 매핑하고 원본 메시지를 노출하지 않는다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    const handler = vi.fn().mockRejectedValue(new Error('내부 스택 추적 상세'));
    const route = withApi({ requireAuth: true }, handler);

    const response = await route(jsonRequest({}));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe('INTERNAL');
    expect(body.error.message).not.toContain('내부 스택 추적 상세');
  });

  it('핸들러가 일반 Error를 던지면 500으로 변환하는 동시에 console.error로 로그를 남긴다 (Action Item 2 — 유일한 중앙 catch 지점이 무로그면 안 된다)', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    const handler = vi.fn().mockRejectedValue(new Error('내부 스택 추적 상세'));
    const route = withApi({ requireAuth: true }, handler);

    const response = await route(jsonRequest({}));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.message).not.toContain('내부 스택 추적 상세');
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('본문이 유효한 JSON이 아니면 400 VALIDATION_FAILED를 반환한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    const schema = z.object({ text: z.string() });
    const handler = vi.fn();
    const route = withApi({ schema, requireAuth: true }, handler);

    const badRequest = new Request('http://localhost/api/test', {
      method: 'POST',
      body: '{invalid json',
      headers: { 'content-type': 'application/json' },
    });
    const response = await route(badRequest);

    expect(response.status).toBe(400);
    expect(handler).not.toHaveBeenCalled();
  });

  it('ValidationError를 핸들러가 직접 던져도 400으로 매핑된다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    const handler = vi.fn().mockRejectedValue(new ValidationError('형식 오류'));
    const route = withApi({ requireAuth: true }, handler);

    const response = await route(jsonRequest({}));
    expect(response.status).toBe(400);
  });
});
