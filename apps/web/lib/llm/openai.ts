/**
 * `LLMClient` 구현체 — `packages/core/src/llm/client.ts`의 인터페이스를 구현한다(AC-028).
 * core는 이 파일을 모른다 — 주입은 Route Handler가 한다.
 *
 * 🔴 T2 스캐폴드 스텁 — 캐시(`llm_cache`)·요청 상한·폴백 3단 해석(`docs/Architecture.md` Data Flow 2)은
 * T4가 채운다.
 */
import type { LLMClient, LLMResponse, LLMStep } from '@cross-border/core';

export function createOpenAiLLMClient(): LLMClient {
  return {
    async complete(
      _step: LLMStep,
      _promptVersion: string,
      _payload: unknown,
    ): Promise<LLMResponse> {
      throw new Error('Not implemented — T4에서 채운다');
    },
  };
}
