/**
 * `regression-c2.live-env.ts`(`tests/regression-c2.live.test.ts`가 쓰는 환경 변수 판정 로직) 단위
 * 테스트 — reviewer 후속 Major B(`docs/Tasks.md` T11): "필요한 환경 변수가 없으면 조용히 skip하지
 * 말고 어떤 변수가 빠졌는지 명시하라". 실제 `.env`·LLM 호출 없이 순수 함수만 검증한다.
 *
 * 🔴 T11 후속 fix(2026-08-07, red 커밋) — `getMissingLiveEnvKeys`가 `env.LLM_PROVIDER`에 따라
 * OpenAI/Gemini 각각 다른 필수 키 집합을 요구하도록 바뀌면서, 그 provider 분기를 커버하는 테스트를
 * 추가한다(`getRequiredLiveEnvKeys` 신규 export 포함). 이 커밋 시점에는 구현(`regression-c2.live-env.ts`)이
 * 아직 이 분기를 반영하지 않았다면 fail한다 — Red→Green 증거(`docs/GitWorkflow.md`).
 */
import { describe, expect, it } from 'vitest';
import {
  describeLiveEnvSkipReason,
  getMissingLiveEnvKeys,
  getRequiredLiveEnvKeys,
  REQUIRED_LIVE_ENV,
} from './regression-c2.live-env';

function fullEnv(): Record<string, string> {
  return Object.fromEntries(REQUIRED_LIVE_ENV.map((key) => [key, 'dummy-value']));
}

function fullGeminiEnv(): Record<string, string> {
  return {
    LLM_PROVIDER: 'gemini',
    ...Object.fromEntries(
      getRequiredLiveEnvKeys({ LLM_PROVIDER: 'gemini' }).map((key) => [key, 'dummy-value']),
    ),
  };
}

describe('getRequiredLiveEnvKeys', () => {
  it('LLM_PROVIDER가 없으면 OpenAI 키(REQUIRED_LIVE_ENV)를 요구한다', () => {
    expect(getRequiredLiveEnvKeys({})).toEqual([...REQUIRED_LIVE_ENV]);
  });

  it("LLM_PROVIDER가 'gemini'가 아닌 값이면 여전히 OpenAI 키를 요구한다(create-client.ts와 동일 판정)", () => {
    expect(getRequiredLiveEnvKeys({ LLM_PROVIDER: 'anthropic' })).toEqual([...REQUIRED_LIVE_ENV]);
  });

  it("LLM_PROVIDER가 'gemini'면 GEMINI_API_KEY/GEMINI_MODEL + 공유 4개 키를 요구한다", () => {
    expect(getRequiredLiveEnvKeys({ LLM_PROVIDER: 'gemini' })).toEqual([
      'GEMINI_API_KEY',
      'GEMINI_MODEL',
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'MAX_LLM_CALLS_PER_USER_PER_DAY',
      'MAX_LLM_CALLS_GLOBAL_PER_DAY',
    ]);
  });
});

describe('getMissingLiveEnvKeys', () => {
  it('필요한 환경 변수가 전부 있으면 누락 목록이 비어 있다(OpenAI, 기본값)', () => {
    expect(getMissingLiveEnvKeys(fullEnv())).toEqual([]);
  });

  it('없는 키와 빈 문자열인 키만 누락으로 보고한다(있는 키는 섞이지 않는다)', () => {
    const env = fullEnv();
    env.OPENAI_API_KEY = '';
    delete env.MAX_LLM_CALLS_GLOBAL_PER_DAY;
    expect(getMissingLiveEnvKeys(env)).toEqual(['OPENAI_API_KEY', 'MAX_LLM_CALLS_GLOBAL_PER_DAY']);
  });

  it('필요한 변수 목록(REQUIRED_LIVE_ENV) 순서대로 누락을 보고한다', () => {
    const env: Record<string, string> = {};
    expect(getMissingLiveEnvKeys(env)).toEqual([...REQUIRED_LIVE_ENV]);
  });

  it("LLM_PROVIDER='gemini'면 GEMINI_API_KEY/GEMINI_MODEL이 전부 있을 때 누락이 없다(OPENAI_API_KEY는 요구하지 않는다)", () => {
    expect(getMissingLiveEnvKeys(fullGeminiEnv())).toEqual([]);
  });

  it("LLM_PROVIDER='gemini'인데 GEMINI_API_KEY만 없으면 그것만 누락으로 보고한다(OPENAI_API_KEY를 채우라고 하지 않는다)", () => {
    const env = fullGeminiEnv();
    delete env.GEMINI_API_KEY;
    expect(getMissingLiveEnvKeys(env)).toEqual(['GEMINI_API_KEY']);
  });

  it("LLM_PROVIDER='gemini'이고 아무 것도 없으면 Gemini 키 순서대로 누락을 보고한다", () => {
    const env: Record<string, string> = { LLM_PROVIDER: 'gemini' };
    expect(getMissingLiveEnvKeys(env)).toEqual([
      'GEMINI_API_KEY',
      'GEMINI_MODEL',
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'MAX_LLM_CALLS_PER_USER_PER_DAY',
      'MAX_LLM_CALLS_GLOBAL_PER_DAY',
    ]);
  });
});

describe('describeLiveEnvSkipReason', () => {
  it('누락이 없으면 빈 문자열을 반환한다(스킵 사유 없음)', () => {
    expect(describeLiveEnvSkipReason([])).toBe('');
  });

  it('누락된 키 이름을 스킵 사유 문자열에 그대로 포함한다', () => {
    const reason = describeLiveEnvSkipReason(['OPENAI_API_KEY', 'OPENAI_MODEL']);
    expect(reason).toContain('OPENAI_API_KEY');
    expect(reason).toContain('OPENAI_MODEL');
  });
});
