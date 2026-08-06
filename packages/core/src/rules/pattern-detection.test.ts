/**
 * `classifyDiffPattern` / `profileValueForPattern` — `diff_records.pattern_key`를 채우는
 * 유일한 통로 (AC-012/AC-013, `docs/Tasks.md` T20).
 */
import { describe, expect, it } from 'vitest';
import { classifyDiffPattern, profileValueForPattern } from './pattern-detection';

describe('classifyDiffPattern', () => {
  it('emoji_removed — AI 제안문에는 이모지가 있고 최종문에서 전부 사라지면 검출한다', () => {
    expect(classifyDiffPattern('확인했습니다 👍', '확인했습니다')).toBe('emoji_removed');
  });

  it('emoji_removed — 이모지가 여러 개여도 최종문에 하나도 안 남으면 검출한다', () => {
    expect(classifyDiffPattern('좋습니다 😀 감사합니다 🙏', '좋습니다 감사합니다')).toBe(
      'emoji_removed',
    );
  });

  it('이모지가 최종문에도 일부 남아 있으면 emoji_removed로 판정하지 않는다(전부 사라진 경우만)', () => {
    expect(classifyDiffPattern('좋습니다 😀 감사합니다 🙏', '좋습니다 😀 감사합니다')).toBeNull();
  });

  it('cushion_insert — AI 제안문에 없던 완충 표현이 최종문에서 새로 추가되면 검출한다', () => {
    expect(
      classifyDiffPattern('내일까지 회신 부탁드립니다.', '혹시 괜찮으시다면 내일까지 회신 부탁드립니다.'),
    ).toBe('cushion_insert');
  });

  it('완충 표현이 AI 제안문에도 이미 있었으면(개수가 늘지 않았으면) cushion_insert로 판정하지 않는다', () => {
    expect(
      classifyDiffPattern('혹시 내일까지 회신 부탁드립니다.', '혹시 내일까지 회신 가능할까요?'),
    ).toBeNull();
  });

  it('두 신호 모두 없으면 null이다(분류 불가 — 지어내지 않는다)', () => {
    expect(classifyDiffPattern('내일까지 확인 부탁드립니다.', '내일까지 확인 부탁드립니다.')).toBeNull();
  });

  it('이모지 제거와 완충 표현 추가가 동시에 성립하면 emoji_removed를 우선한다(구현 판단 — 파일 헤더 주석 근거)', () => {
    expect(classifyDiffPattern('확인 부탁드려요 😀', '혹시 괜찮으시다면 확인 부탁드려요')).toBe(
      'emoji_removed',
    );
  });

  it('빈 문자열 입력에서도 예외 없이 null을 반환한다', () => {
    expect(classifyDiffPattern('', '')).toBeNull();
  });
});

describe('profileValueForPattern', () => {
  it('emoji_removed → avoids (profiles.emoji_preference 어휘)', () => {
    expect(profileValueForPattern('emoji_removed')).toBe('avoids');
  });

  it('cushion_insert → indirect (profiles.directness 어휘)', () => {
    expect(profileValueForPattern('cushion_insert')).toBe('indirect');
  });
});
