/**
 * `buildCacheKey` — AC-041 캐시 키 공식의 유일한 통로.
 * 근거: `docs/Architecture.md` Data Flow "2) LLM 호출 3단 해석"
 * `cacheKey = sha256(model ∥ promptVersion ∥ step ∥ canonicalJSON(정규화 입력))`,
 * 정규화 = 앞뒤 공백 제거 + 개행 통일. `docs/Database.md:260` "user_id 를 키에 넣지 않는다".
 */
import { describe, expect, it } from 'vitest';
import { C2_PROMPT_VERSION, runToneTransform, type LLMClient } from '@cross-border/core';
import { buildCacheKey, canonicalJson } from './cache-key';

describe('buildCacheKey', () => {
  it('같은 model·promptVersion·step·payload 면 같은 키를 반환한다(결정적)', () => {
    const a = buildCacheKey('gpt-4o-mini', 'v1', 'c1', { text: 'hello' });
    const b = buildCacheKey('gpt-4o-mini', 'v1', 'c1', { text: 'hello' });
    expect(a).toBe(b);
  });

  it('64자 hex sha256 다이제스트를 반환한다', () => {
    const key = buildCacheKey('gpt-4o-mini', 'v1', 'c1', { text: 'hello' });
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('payload의 객체 키 순서가 달라도 같은 키를 반환한다(canonicalJSON)', () => {
    const a = buildCacheKey('gpt-4o-mini', 'v1', 'c1', { text: 'hi', sender: 'a' });
    const b = buildCacheKey('gpt-4o-mini', 'v1', 'c1', { sender: 'a', text: 'hi' });
    expect(a).toBe(b);
  });

  it('문자열 값의 앞뒤 공백 차이는 같은 키로 정규화된다', () => {
    const a = buildCacheKey('gpt-4o-mini', 'v1', 'c1', { text: '  hello  ' });
    const b = buildCacheKey('gpt-4o-mini', 'v1', 'c1', { text: 'hello' });
    expect(a).toBe(b);
  });

  it('CRLF/CR 개행이 LF로 통일되어 같은 키가 된다', () => {
    const a = buildCacheKey('gpt-4o-mini', 'v1', 'c1', { text: 'line1\r\nline2' });
    const b = buildCacheKey('gpt-4o-mini', 'v1', 'c1', { text: 'line1\nline2' });
    const c = buildCacheKey('gpt-4o-mini', 'v1', 'c1', { text: 'line1\rline2' });
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('model이 다르면 다른 키를 반환한다', () => {
    const a = buildCacheKey('gpt-4o-mini', 'v1', 'c1', { text: 'hello' });
    const b = buildCacheKey('gpt-4o', 'v1', 'c1', { text: 'hello' });
    expect(a).not.toBe(b);
  });

  it('promptVersion이 다르면 다른 키를 반환한다(프롬프트를 고치고 버전을 안 올리면 옛 응답 반환 방지)', () => {
    const a = buildCacheKey('gpt-4o-mini', 'v1', 'c1', { text: 'hello' });
    const b = buildCacheKey('gpt-4o-mini', 'v2', 'c1', { text: 'hello' });
    expect(a).not.toBe(b);
  });

  it('step이 다르면 다른 키를 반환한다', () => {
    const a = buildCacheKey('gpt-4o-mini', 'v1', 'c1', { text: 'hello' });
    const b = buildCacheKey('gpt-4o-mini', 'v1', 'c2', { text: 'hello' });
    expect(a).not.toBe(b);
  });

  it('payload 내용이 다르면 다른 키를 반환한다', () => {
    const a = buildCacheKey('gpt-4o-mini', 'v1', 'c1', { text: 'hello' });
    const b = buildCacheKey('gpt-4o-mini', 'v1', 'c1', { text: 'goodbye' });
    expect(a).not.toBe(b);
  });
});

describe('canonicalJson', () => {
  it('중첩 객체의 키도 정렬해 같은 문자열을 만든다', () => {
    const a = canonicalJson({ b: 1, a: { d: 2, c: 3 } });
    const b = canonicalJson({ a: { c: 3, d: 2 }, b: 1 });
    expect(a).toBe(b);
  });

  it('배열 순서는 보존한다(정렬하지 않는다)', () => {
    const a = canonicalJson({ list: [1, 2, 3] });
    const b = canonicalJson({ list: [3, 2, 1] });
    expect(a).not.toBe(b);
  });
});

/**
 * C2(T10) 존댓말 레벨 — `honorificLevel: null`(빈 프로필)과 명시값의 캐시 키 구분(DECISIONS #40,
 * `docs/adr/0007-honorific-level-resolution-boundary.md` D2). 🔴 이전 구현은 `steps/c2.ts`에서
 * `honorificLevel ?? DEFAULT_HONORIFIC_LEVEL`로 빈 프로필을 'haeyo'로 미리 채웠다 — 그 결과
 * "프로필 없음"과 "프로필=해요체"의 payload가 완전히 같아져 같은 cacheKey가 됐다(ADR-0007이
 * 지적한 실패). 이 블록은 `runToneTransform`이 `LLMClient.complete()`에 실제로 넘기는 payload를
 * 캡처해 그 문제가 고쳐졌는지 검증한다.
 */
describe('C2 톤 변환 — honorificLevel:null(빈 프로필) vs 명시값의 캐시 키 구분', () => {
  async function capturePayload(honorificLevel: 'hapsyo' | 'haeyo' | null): Promise<unknown> {
    let captured: unknown;
    const llm: LLMClient = {
      complete: async (_step, _promptVersion, payload) => {
        captured = payload;
        return {
          content: JSON.stringify({ transformed: 'x', reason: 'y', preserved: [], misreadRisks: [] }),
          source: 'live',
        };
      },
    };
    await runToneTransform(
      { text: 'hi', languageDirection: 'en-ko', honorificLevel, referenceDate: '2026-08-05' },
      llm,
    );
    return captured;
  }

  it('honorificLevel:null과 honorificLevel:"haeyo"가 서로 다른 payload를 낳는다(기본값으로 채워지지 않는다)', async () => {
    const nullPayload = await capturePayload(null);
    const haeyoPayload = await capturePayload('haeyo');

    expect(canonicalJson(nullPayload)).not.toBe(canonicalJson(haeyoPayload));
  });

  it('위 두 payload가 서로 다른 cacheKey를 낳는다(같은 model/promptVersion/step 기준)', async () => {
    const nullPayload = await capturePayload(null);
    const haeyoPayload = await capturePayload('haeyo');

    const keyForNull = buildCacheKey('gpt-4o-mini', C2_PROMPT_VERSION, 'c2', nullPayload);
    const keyForHaeyo = buildCacheKey('gpt-4o-mini', C2_PROMPT_VERSION, 'c2', haeyoPayload);

    expect(keyForNull).not.toBe(keyForHaeyo);
  });

  it('honorificLevel:null일 때 payload.instruction에 특정 레벨 문자열(합쇼체/해요체)이 지정되지 않는다', async () => {
    const nullPayload = (await capturePayload(null)) as { instruction: string };

    expect(nullPayload.instruction).not.toContain('output: 합쇼체');
    expect(nullPayload.instruction).not.toContain('output: 해요체');
  });
});
