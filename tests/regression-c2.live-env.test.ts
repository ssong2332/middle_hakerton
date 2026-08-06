/**
 * `regression-c2.live-env.ts`(`tests/regression-c2.live.test.ts`가 쓰는 환경 변수 판정 로직) 단위
 * 테스트 — reviewer 후속 Major B(`docs/Tasks.md` T11): "필요한 환경 변수가 없으면 조용히 skip하지
 * 말고 어떤 변수가 빠졌는지 명시하라". 실제 `.env`·LLM 호출 없이 순수 함수만 검증한다.
 */
import { describe, expect, it } from 'vitest';
import {
  describeLiveEnvSkipReason,
  getMissingLiveEnvKeys,
  REQUIRED_LIVE_ENV,
} from './regression-c2.live-env';

function fullEnv(): Record<string, string> {
  return Object.fromEntries(REQUIRED_LIVE_ENV.map((key) => [key, 'dummy-value']));
}

describe('getMissingLiveEnvKeys', () => {
  it('필요한 환경 변수가 전부 있으면 누락 목록이 비어 있다', () => {
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
