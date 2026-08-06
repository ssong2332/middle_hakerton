/**
 * `createLLMClient` — provider 스위치(`create-client.ts` 파일 헤더 주석 참조). 로컬 테스트
 * 전용 `LLM_PROVIDER=gemini` 값일 때만 Gemini 구현체를 쓰고, 그 외/미설정이면 항상 OpenAI
 * 구현체를 쓴다(기본값 = OpenAI, Vercel 프로덕션에는 `LLM_PROVIDER`를 설정하지 않는다).
 *
 * `createOpenAiLLMClient`/`createGeminiLLMClient` 자체(3단 해석)는 각각 `openai.test.ts`/
 * `gemini.test.ts`가 검증한다 — 여기서는 스위치 분기만 본다.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./openai', () => ({
  createOpenAiLLMClient: vi.fn(() => ({ complete: vi.fn(), __tag: 'openai' })),
}));
vi.mock('./gemini', () => ({
  createGeminiLLMClient: vi.fn(() => ({ complete: vi.fn(), __tag: 'gemini' })),
}));

import { createOpenAiLLMClient } from './openai';
import { createGeminiLLMClient } from './gemini';
import { createLLMClient } from './create-client';

const mockOpenAi = vi.mocked(createOpenAiLLMClient);
const mockGemini = vi.mocked(createGeminiLLMClient);

describe('createLLMClient — provider 스위치', () => {
  beforeEach(() => {
    mockOpenAi.mockClear();
    mockGemini.mockClear();
    delete process.env.LLM_PROVIDER;
  });

  it('LLM_PROVIDER가 미설정이면 OpenAI 구현체를 만든다(기본값)', async () => {
    const client = await createLLMClient('user-1');

    expect(mockOpenAi).toHaveBeenCalledWith('user-1');
    expect(mockGemini).not.toHaveBeenCalled();
    expect((client as unknown as { __tag: string }).__tag).toBe('openai');
  });

  it('LLM_PROVIDER가 "gemini"가 아닌 값이면 OpenAI 구현체를 만든다', async () => {
    process.env.LLM_PROVIDER = 'anthropic';

    await createLLMClient(undefined);

    expect(mockOpenAi).toHaveBeenCalledWith(undefined);
    expect(mockGemini).not.toHaveBeenCalled();
  });

  it('LLM_PROVIDER="gemini"면 Gemini 구현체를 만든다(동적 import, M-1)', async () => {
    process.env.LLM_PROVIDER = 'gemini';

    const client = await createLLMClient('user-2');

    expect(mockGemini).toHaveBeenCalledWith('user-2');
    expect(mockOpenAi).not.toHaveBeenCalled();
    expect((client as unknown as { __tag: string }).__tag).toBe('gemini');
  });
});
