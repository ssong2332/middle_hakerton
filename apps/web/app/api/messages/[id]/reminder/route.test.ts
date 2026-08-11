/**
 * `POST /api/messages/{id}/reminder` — `docs/API.md` "POST /api/messages/{id}/reminder" ·
 * `docs/Tasks.md` T51/T52 (AC-044③④). `fetchSentMessageForReminder`/`fetchSenderProfile`/
 * `createLLMClient`는 모킹한다 — C2 자체(`runToneTransform`)는 **실제 core 함수를 그대로
 * 실행**하고 LLM만 페이크로 대체한다(`apps/web/app/api/mediate/route.test.ts`와 같은 모킹 정책 —
 * "LLM만 모킹 대상"). 여기서는 라우트 배선(id 파싱 → 조회 → 언어 방향/시드 선택 → C2 호출 →
 * 응답 조합)만 본다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../lib/auth', () => ({
  resolveSession: vi.fn(),
}));
vi.mock('../../../../../lib/messages/storage', () => ({
  fetchSentMessageForReminder: vi.fn(),
}));
vi.mock('../../../../../lib/profile/storage', () => ({
  fetchSenderProfile: vi.fn(),
}));
vi.mock('../../../../../lib/llm/create-client', () => ({
  createLLMClient: vi.fn(),
}));

import { NotFoundError } from '@cross-border/core';
import type { LLMClient, LLMStep } from '@cross-border/core';
import { resolveSession } from '../../../../../lib/auth';
import { fetchSentMessageForReminder } from '../../../../../lib/messages/storage';
import { fetchSenderProfile } from '../../../../../lib/profile/storage';
import { createLLMClient } from '../../../../../lib/llm/create-client';
import { POST } from './route';

const mockResolveSession = vi.mocked(resolveSession);
const mockFetchMessage = vi.mocked(fetchSentMessageForReminder);
const mockFetchProfile = vi.mocked(fetchSenderProfile);
const mockCreateLLMClient = vi.mocked(createLLMClient);

const fakeClient = { from: vi.fn() } as never;

const EMPTY_PROFILE = {
  onboardingState: 'not_started' as const,
  directness: null,
  emojiPreference: null,
  formality: null,
  honorificLevel: null,
};

/** C2 스키마를 만족하는 최소 응답을 돌려주는 페이크 LLM — `mediate/route.test.ts`의 `fakeLlm`과 같은 성격. */
function fakeLlm(transformed: string, source: 'live' | 'cache' | 'fallback' = 'live'): LLMClient {
  return {
    complete: vi.fn(async (_step: LLMStep) => ({
      content: JSON.stringify({ transformed, reason: 'reminder tone', preserved: [], misreadRisks: [] }),
      source,
    })),
  };
}

function reminderRequest(id: string): Request {
  return new Request(`http://localhost/api/messages/${id}/reminder`, { method: 'POST' });
}

describe('POST /api/messages/{id}/reminder — AC-044③④', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('id로 대상 메시지를 조회해 finalText가 한글이면 en-ko 방향(영어 시드)으로 C2를 호출한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient });
    mockFetchMessage.mockResolvedValue({ finalText: '내일까지 확인 부탁드립니다.' });
    mockFetchProfile.mockResolvedValue(EMPTY_PROFILE);
    const llm = fakeLlm('다시 한번 확인차 연락드립니다.');
    mockCreateLLMClient.mockResolvedValue(llm);

    const response = await POST(reminderRequest('msg-1'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ draftText: '다시 한번 확인차 연락드립니다.', source: 'live' });
    expect(mockFetchMessage).toHaveBeenCalledWith(fakeClient, 'user-1', 'msg-1');
    expect(llm.complete).toHaveBeenCalledWith(
      'c2',
      expect.any(String),
      expect.objectContaining({ languageDirection: 'en-ko' }),
    );
  });

  it('finalText가 영어면 ko-en 방향(한국어 시드)으로 C2를 호출한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient });
    mockFetchMessage.mockResolvedValue({ finalText: 'Please confirm by tomorrow.' });
    mockFetchProfile.mockResolvedValue(EMPTY_PROFILE);
    const llm = fakeLlm('Following up once more.');
    mockCreateLLMClient.mockResolvedValue(llm);

    const response = await POST(reminderRequest('msg-2'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ draftText: 'Following up once more.', source: 'live' });
    expect(llm.complete).toHaveBeenCalledWith(
      'c2',
      expect.any(String),
      expect.objectContaining({ languageDirection: 'ko-en' }),
    );
  });

  it('발신자 프로필의 honorificLevel/directness/emojiPreference를 C2 payload에 그대로 싣는다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient });
    mockFetchMessage.mockResolvedValue({ finalText: 'Please confirm by tomorrow.' });
    mockFetchProfile.mockResolvedValue({
      onboardingState: 'completed',
      directness: 'direct',
      emojiPreference: 'avoids',
      formality: 'high',
      honorificLevel: 'hapsyo',
    });
    const llm = fakeLlm('다시 한번 확인차 연락드립니다.');
    mockCreateLLMClient.mockResolvedValue(llm);

    await POST(reminderRequest('msg-3'));

    expect(llm.complete).toHaveBeenCalledWith(
      'c2',
      expect.any(String),
      expect.objectContaining({
        honorificLevel: 'hapsyo',
        directness: 'direct',
        emojiPreference: 'avoids',
      }),
    );
  });

  it('원문을 지어내지 않는다 — C2에 실리는 시드 텍스트가 원 메시지 finalText를 인용하지 않는다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient });
    mockFetchMessage.mockResolvedValue({ finalText: 'Please confirm the Q3 budget by tomorrow.' });
    mockFetchProfile.mockResolvedValue(EMPTY_PROFILE);
    const llm = fakeLlm('Following up once more.');
    mockCreateLLMClient.mockResolvedValue(llm);

    await POST(reminderRequest('msg-4'));

    const payload = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0][2] as { text: string };
    expect(payload.text).not.toContain('Q3 budget');
  });

  it('대상 메시지가 없으면(NotFoundError) 404를 반환하고 LLM을 호출하지 않는다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1', client: fakeClient });
    mockFetchMessage.mockRejectedValue(new NotFoundError('발송 기록을 찾을 수 없습니다'));
    const llm = fakeLlm('unused');
    mockCreateLLMClient.mockResolvedValue(llm);

    const response = await POST(reminderRequest('missing-id'));

    expect(response.status).toBe(404);
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it('인증되지 않은 요청은 401 AUTH_REQUIRED를 반환하고 조회하지 않는다', async () => {
    mockResolveSession.mockResolvedValue(null);

    const response = await POST(reminderRequest('msg-1'));

    expect(response.status).toBe(401);
    expect(mockFetchMessage).not.toHaveBeenCalled();
  });
});
