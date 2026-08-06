/**
 * `rules/preservation.ts` — `PreservedItem[]` 스키마 검증 단위 테스트 (AC-006/007).
 */
import { describe, expect, it } from 'vitest';
import { parsePreservedItems } from './preservation';

describe('parsePreservedItems', () => {
  it('kind/sourceText/transformedText를 모두 갖춘 배열을 그대로 반환한다', () => {
    const raw = [
      { kind: 'deadline', sourceText: '금요일까지', transformedText: 'by Friday' },
      { kind: 'number', sourceText: '3개', transformedText: '3 units' },
      { kind: 'action', sourceText: '확인 부탁드립니다', transformedText: 'please confirm' },
    ];

    expect(parsePreservedItems(raw)).toEqual(raw);
  });

  it('빈 배열은 유효한 값이다(원문에 보존 대상이 없을 때)', () => {
    expect(parsePreservedItems([])).toEqual([]);
  });

  it('kind가 3종 밖의 값이면 null을 반환한다', () => {
    const raw = [{ kind: 'urgency', sourceText: 'x', transformedText: 'y' }];
    expect(parsePreservedItems(raw)).toBeNull();
  });

  it('sourceText가 빈 문자열이면 null을 반환한다(누락을 성공으로 위장하지 않는다)', () => {
    const raw = [{ kind: 'deadline', sourceText: '', transformedText: 'y' }];
    expect(parsePreservedItems(raw)).toBeNull();
  });

  it('transformedText가 빈 문자열이면 null을 반환한다', () => {
    const raw = [{ kind: 'deadline', sourceText: 'x', transformedText: '' }];
    expect(parsePreservedItems(raw)).toBeNull();
  });

  it('배열이 아니면 null을 반환한다', () => {
    expect(parsePreservedItems({ kind: 'deadline' })).toBeNull();
  });
});
