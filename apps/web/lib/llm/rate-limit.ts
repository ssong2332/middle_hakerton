/**
 * 요청 상한(AC-041) 판정 - `docs/Architecture.md` Data Flow "2) LLM 호출 3단 해석" 표
 * "요청 상한" 행: `llm_call_log` 를 세어 ① 사용자·일 단위 `MAX_LLM_CALLS_PER_USER_PER_DAY`
 * ② 전역·일 단위 `MAX_LLM_CALLS_GLOBAL_PER_DAY` 두 겹으로 판정한다.
 * SQL 형태는 `docs/Database.md:288~298`(`countLiveCallsSince` — `storage.ts`)가 그대로 옮긴 것이다.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { countLiveCallsSince } from './storage';

export interface RateLimitThresholds {
  maxPerUser: number;
  maxGlobal: number;
}

export interface RateLimitResult {
  allowed: boolean;
  scope?: 'user' | 'global';
}

function parseThreshold(name: string, raw: string | undefined): number {
  const value = raw === undefined || raw === '' ? NaN : Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be set to a non-negative integer (got: ${raw ?? 'undefined'})`);
  }
  return value;
}

/**
 * 🔴 설정 누락/오설정을 "무제한 허용"으로 조용히 해석하지 않는다 - 둘 중 하나라도 없거나
 * 정수가 아니면 던진다(fail fast). 크레딧이 제한적이라는 가정(OQ#3)에서 무제한으로 새는 쪽이
 * 상한을 조금 더 엄격히 잡는 쪽보다 위험하다.
 */
export function readRateLimitThresholds(
  env: Record<string, string | undefined> = process.env,
): RateLimitThresholds {
  return {
    maxPerUser: parseThreshold(
      'MAX_LLM_CALLS_PER_USER_PER_DAY',
      env.MAX_LLM_CALLS_PER_USER_PER_DAY,
    ),
    maxGlobal: parseThreshold('MAX_LLM_CALLS_GLOBAL_PER_DAY', env.MAX_LLM_CALLS_GLOBAL_PER_DAY),
  };
}

/** 순수 판정 로직 - DB 조회와 분리해 단위 테스트한다. */
export function evaluateRateLimit(
  counts: { userCount: number; globalCount: number },
  thresholds: RateLimitThresholds,
  hasUser: boolean,
): RateLimitResult {
  if (hasUser && counts.userCount >= thresholds.maxPerUser) {
    return { allowed: false, scope: 'user' };
  }
  if (counts.globalCount >= thresholds.maxGlobal) {
    return { allowed: false, scope: 'global' };
  }
  return { allowed: true };
}

/**
 * 🔴 QA 2차 F-A — `thresholds`를 호출부(`openai.ts`)에서 미리 계산해 넘기는 것을 전제로
 * 선택 인자로 뺐다. 이유: `readRateLimitThresholds()`가 던지는 설정 오류(`parseThreshold`,
 * 미설정/비정수/음수 — fail-fast)와 이 함수 본문의 `countLiveCallsSince`가 던지는 DB 조회
 * 실패(네트워크·일시 장애)는 성격이 다르다. 호출부가 이 두 원인을 구분해서 처리해야 하므로
 * (설정 오류는 그대로 propagate, DB 실패만 fail-closed로 강등) 파싱을 함수 진입 이전 단계로
 * 옮겨 호출부의 try 범위 밖에 둘 수 있게 했다 — 인자를 생략하면 기존과 동일하게 내부에서
 * 파싱한다(하위 호환).
 */
export async function checkRequestLimit(
  client: SupabaseClient,
  userId?: string,
  thresholds: RateLimitThresholds = readRateLimitThresholds(),
): Promise<RateLimitResult> {
  const sinceISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const globalCount = await countLiveCallsSince(client, { sinceISO });
  const userCount = userId ? await countLiveCallsSince(client, { sinceISO, userId }) : 0;
  return evaluateRateLimit({ userCount, globalCount }, thresholds, Boolean(userId));
}
