/**
 * `LLMClient` provider 스위치 — **로컬 테스트 전용 도구, 정식 아키텍처 결정이 아니다**
 * (`gemini.ts` 파일 헤더 주석과 같은 성격).
 *
 * `docs/Architecture.md`가 정한 프로덕션 경로는 OpenAI(`openai.ts`) 하나뿐이다. `LLM_PROVIDER`
 * 환경변수가 `'gemini'`일 때만 로컬 개발자가 Gemini 구현체로 바꿔 실행해 볼 수 있게 하고,
 * 그 외의 모든 값(미설정 포함)은 항상 OpenAI로 간다 — **기본값은 반드시 OpenAI**다. Vercel
 * 프로덕션에는 `LLM_PROVIDER`를 설정하지 않으므로 배포 경로는 이 스위치의 영향을 받지 않는다.
 *
 * `apps/web/app/api/mediate/route.ts`가 이 함수를 통해 `LLMClient`를 얻는다.
 */
import type { LLMClient } from '@cross-border/core';
import { createOpenAiLLMClient } from './openai';

// 🔴 M-1(reviewer 라운드) — 동적 import. `gemini.ts`(→ `@google/genai`, 97개 파일/1.5MB)를
// 정적으로 import하면 `LLM_PROVIDER`가 항상 OpenAI인 프로덕션 배포에서도 그 코드가 서버 번들에
// 그대로 실린다. `LLM_PROVIDER==='gemini'`일 때만 필요하므로 그 분기 안에서만 로드해 프로덕션
// 번들(`/api/mediate`)에서 빠지게 한다.
export async function createLLMClient(userId?: string): Promise<LLMClient> {
  if (process.env.LLM_PROVIDER === 'gemini') {
    const { createGeminiLLMClient } = await import('./gemini');
    return createGeminiLLMClient(userId);
  }
  return createOpenAiLLMClient(userId);
}
