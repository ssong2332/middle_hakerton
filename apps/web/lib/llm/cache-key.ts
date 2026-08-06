/**
 * AC-041 캐시 키 공식 - docs/Architecture.md Data Flow "2) LLM 호출 3단 해석":
 * cacheKey = sha256(model + promptVersion + step + canonicalJSON(정규화된 입력)).
 * 정규화 = 앞뒤 공백 제거 + 개행 통일(CRLF/CR -> LF). docs/Database.md:260 - user_id 를 키에 넣지 않는다.
 *
 * packages/core/src/llm/client.ts 의 LLMClient.complete() 가 이 함수의 소비처이며,
 * packages/core 는 이 파일을 import 하지 않는다(AC-028 - 캐시 키 계산은 어댑터인 이 파일의 책임).
 */
import { createHash } from 'node:crypto';
import type { LLMStep } from '@cross-border/core';

/** 구성 요소(model/promptVersion/step/canonicalJson) 사이 구분자 - 코드 포인트 0, payload 문자열 안에 나타날 수 없다. */
const KEY_MATERIAL_SEPARATOR = String.fromCharCode(0);

/** 문자열 리프 값만 정규화한다 - 객체/배열 구조는 그대로 순회한다. */
function normalizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  }
  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source)) {
      out[key] = normalizeValue(source[key]);
    }
    return out;
  }
  return value;
}

/** 객체 키를 정렬해 직렬화한다 - 같은 내용이면 키 순서와 무관하게 같은 문자열이 된다. */
function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(',')}]`;
  }
  const source = value as Record<string, unknown>;
  const keys = Object.keys(source)
    .filter((key) => source[key] !== undefined)
    .sort();
  const body = keys
    .map((key) => `${JSON.stringify(key)}:${canonicalStringify(source[key])}`)
    .join(',');
  return `{${body}}`;
}

/** 정규화(공백 트림 + 개행 통일) 후 canonical JSON 문자열을 만든다. */
export function canonicalJson(payload: unknown): string {
  return canonicalStringify(normalizeValue(payload));
}

/** AC-041 캐시 키 공식. */
export function buildCacheKey(
  model: string,
  promptVersion: string,
  step: LLMStep,
  payload: unknown,
): string {
  const material = [model, promptVersion, step, canonicalJson(payload)].join(
    KEY_MATERIAL_SEPARATOR,
  );
  return createHash('sha256').update(material, 'utf8').digest('hex');
}
