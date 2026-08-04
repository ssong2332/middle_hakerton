/**
 * `POST /api/mediate` — T5 범위(C4만 실제 동작, `docs/Tasks.md` T5/T6·`docs/API.md`).
 * 🔴 C1/C2/C3/C5/C6은 아직 없다 — 이 테스트는 그 필드들이 T1 계약을 만족하는 placeholder
 * 값으로 나가는 것과, C4(역번역)·AC-046③(존댓말 혼용 경고)이 실제로 동작하는 것만 확인한다.
 * `resolveSession()`(T45 스텁)과 OpenAI 호출(`createOpenAiLLMClient`)은 모킹한다.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/auth', () => ({
  resolveSession: vi.fn(),
}));
vi.mock('../../../lib/llm/openai', () => ({
  createOpenAiLLMClient: vi.fn(),
}));

import { resolveSession } from '../../../lib/auth';
import { createOpenAiLLMClient } from '../../../lib/llm/openai';
import { POST } from './route';

const mockResolveSession = vi.mocked(resolveSession);
const mockCreateClient = vi.mocked(createOpenAiLLMClient);

function fakeLlmReturning(backTranslation: string, source: 'live' | 'cache' | 'fallback' = 'live') {
  return {
    complete: vi.fn().mockResolvedValue({
      content: JSON.stringify({ backTranslation }),
      source,
    }),
  };
}

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/mediate', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/mediate', () => {
  it('세션이 없으면 401 AUTH_REQUIRED를 반환한다', async () => {
    mockResolveSession.mockResolvedValue(null);

    const response = await POST(
      postRequest({
        text: '안녕하세요',
        context: { languageDirection: 'ko-en', channel: 'web' },
      }),
    );

    expect(response.status).toBe(401);
  });

  it('text가 비어 있으면 400 VALIDATION_FAILED를 반환한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });

    const response = await POST(
      postRequest({ text: '', context: { languageDirection: 'ko-en', channel: 'web' } }),
    );

    expect(response.status).toBe(400);
  });

  it('AC-001 — backTranslation을 응답에 담아 200을 반환한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient.mockReturnValue(fakeLlmReturning('Please confirm by tomorrow.'));

    const response = await POST(
      postRequest({
        text: '내일까지 확인 부탁드립니다.',
        context: { languageDirection: 'ko-en', channel: 'web' },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.backTranslation).toBe('Please confirm by tomorrow.');
    expect(body.source).toBe('live');
  });

  it('T1 계약의 12개 필드를 모두 채운다(C1/C2/C3/C5/C6 대기 중에도 스키마는 만족)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient.mockReturnValue(fakeLlmReturning('back'));

    const response = await POST(
      postRequest({ text: 'hello', context: { languageDirection: 'en-ko', channel: 'web' } }),
    );
    const body = await response.json();

    expect(Object.keys(body).sort()).toEqual(
      [
        'backTranslation',
        'holidayConflicts',
        'misreadRisks',
        'personalizationApplied',
        'preserved',
        'reason',
        'source',
        'ticketOption',
        'transformed',
        'urgency',
        'urgencyReason',
        'warnings',
      ].sort(),
    );
    // 🔴 C6(T24) 대기 — 판정 근거가 없으므로 fail-closed(undetermined)가 정답이다(AC-058).
    expect(body.ticketOption).toEqual({ offered: false, basis: 'undetermined' });
    // 🔴 프로필/규약이 아직 연결되지 않아 개인화가 적용되지 않는다 — 현재 상태에서는 정확한 값.
    expect(body.personalizationApplied).toBe(false);
    expect(body.holidayConflicts).toEqual([]);
    expect(body.misreadRisks).toEqual([]);
    expect(body.preserved).toEqual([]);
  });

  it('AC-046③ — en-ko 방향에서 존댓말 혼용이 감지되면 warnings에 경고가 담긴다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient.mockReturnValue(fakeLlmReturning('back'));

    const response = await POST(
      postRequest({
        text: '확인 부탁드립니다. 편하실 때 연락 주세요.',
        context: { languageDirection: 'en-ko', channel: 'web' },
      }),
    );
    const body = await response.json();

    expect(body.warnings).toContainEqual(expect.objectContaining({ type: 'honorificLevelMixed' }));
  });

  it('ko-en 방향에서는 존댓말 혼용 검사를 실행하지 않는다(AC-046은 EN→KO 전용)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient.mockReturnValue(fakeLlmReturning('back'));

    const response = await POST(
      postRequest({
        text: '확인 부탁드립니다. 편하실 때 연락 주세요.',
        context: { languageDirection: 'ko-en', channel: 'web' },
      }),
    );
    const body = await response.json();

    expect(body.warnings).toEqual([]);
  });

  it('경고가 없으면 warnings는 빈 배열이다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient.mockReturnValue(fakeLlmReturning('back'));

    const response = await POST(
      postRequest({
        text: '확인해 주세요.',
        context: { languageDirection: 'en-ko', channel: 'web' },
      }),
    );
    const body = await response.json();

    expect(body.warnings).toEqual([]);
  });

  it('AC-030 — 응답 어디에도 OPENAI_API_KEY 값이 노출되지 않는다', async () => {
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-test-secret-value-should-not-leak';
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient.mockReturnValue(fakeLlmReturning('back'));

    const response = await POST(
      postRequest({ text: 'hello', context: { languageDirection: 'ko-en', channel: 'web' } }),
    );
    const bodyText = await response.text();

    expect(bodyText).not.toContain('sk-test-secret-value-should-not-leak');
    process.env.OPENAI_API_KEY = previous;
  });

  it('C4 응답이 스키마 검증에 실패하면 502 LLM_MALFORMED를 반환한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient.mockReturnValue({
      complete: vi.fn().mockResolvedValue({ content: '유효하지 않은 JSON', source: 'live' }),
    });

    const response = await POST(
      postRequest({ text: 'hello', context: { languageDirection: 'ko-en', channel: 'web' } }),
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error.code).toBe('LLM_MALFORMED');
  });
});
