/**
 * 요청 상한(AC-041) 순수 판정 로직. DB 조회 SQL은 `docs/Database.md:288~298` "요청 상한 판정" —
 * ① 사용자·일 단위 ② 전역·일 단위 두 겹, `cache`/`fallback`은 상한을 소비하지 않는다(`outcome IN ('live')`만 카운트).
 */
import { describe, expect, it } from 'vitest';
import { evaluateRateLimit, readRateLimitThresholds } from './rate-limit';

describe('readRateLimitThresholds', () => {
  it('두 환경변수가 정수면 그대로 읽는다', () => {
    const thresholds = readRateLimitThresholds({
      MAX_LLM_CALLS_PER_USER_PER_DAY: '10',
      MAX_LLM_CALLS_GLOBAL_PER_DAY: '100',
    });
    expect(thresholds).toEqual({ maxPerUser: 10, maxGlobal: 100 });
  });

  it('MAX_LLM_CALLS_PER_USER_PER_DAY가 없으면 던진다(설정 누락을 무제한으로 오인하지 않는다)', () => {
    expect(() => readRateLimitThresholds({ MAX_LLM_CALLS_GLOBAL_PER_DAY: '100' })).toThrow(
      /MAX_LLM_CALLS_PER_USER_PER_DAY/,
    );
  });

  it('MAX_LLM_CALLS_GLOBAL_PER_DAY가 없으면 던진다', () => {
    expect(() => readRateLimitThresholds({ MAX_LLM_CALLS_PER_USER_PER_DAY: '10' })).toThrow(
      /MAX_LLM_CALLS_GLOBAL_PER_DAY/,
    );
  });

  it('숫자가 아니면 던진다', () => {
    expect(() =>
      readRateLimitThresholds({
        MAX_LLM_CALLS_PER_USER_PER_DAY: 'not-a-number',
        MAX_LLM_CALLS_GLOBAL_PER_DAY: '100',
      }),
    ).toThrow();
  });

  it('음수면 던진다', () => {
    expect(() =>
      readRateLimitThresholds({
        MAX_LLM_CALLS_PER_USER_PER_DAY: '-1',
        MAX_LLM_CALLS_GLOBAL_PER_DAY: '100',
      }),
    ).toThrow();
  });
});

describe('evaluateRateLimit', () => {
  const thresholds = { maxPerUser: 5, maxGlobal: 10 };

  it('사용자·전역 모두 상한 미만이면 허용한다', () => {
    expect(evaluateRateLimit({ userCount: 1, globalCount: 2 }, thresholds, true)).toEqual({
      allowed: true,
    });
  });

  it('사용자 상한에 도달하면 user 스코프로 거부한다', () => {
    expect(evaluateRateLimit({ userCount: 5, globalCount: 2 }, thresholds, true)).toEqual({
      allowed: false,
      scope: 'user',
    });
  });

  it('전역 상한에 도달하면 global 스코프로 거부한다', () => {
    expect(evaluateRateLimit({ userCount: 0, globalCount: 10 }, thresholds, false)).toEqual({
      allowed: false,
      scope: 'global',
    });
  });

  it('userId가 없으면(hasUser=false) 사용자 카운트는 판정에 쓰이지 않는다', () => {
    expect(evaluateRateLimit({ userCount: 999, globalCount: 0 }, thresholds, false)).toEqual({
      allowed: true,
    });
  });
});
