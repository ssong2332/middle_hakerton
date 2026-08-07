/**
 * T61 — 이모지 위험도 3단계 데모 시드 데이터 (AC-013·AC-014·AC-015·AC-016 소비처 T30, 데이터 출처
 * `docs/TestCases.md:303-327` "이모지 판정 데이터 — 국가 라벨 없음").
 *
 * 🔴 국가 라벨 필드가 존재하지 않아야 한다(Database.md G3, Planning Decision #6/#71) — 이 파일이
 * `docs/Database.md:319` `packages/core/src/data/emoji-risk.ts`가 가리키는 그 파일이다.
 */
import { describe, expect, it } from 'vitest';
import { EMOJI_RISK_ENTRIES, findEmojiRisk, type EmojiRiskLevel } from './emoji-risk';

describe('EMOJI_RISK_ENTRIES', () => {
  it('정확히 10종을 등록한다(TestCases.md 높음 3 + 중간 4 + 낮음 3)', () => {
    expect(EMOJI_RISK_ENTRIES).toHaveLength(10);
  });

  it('각 항목은 emoji·risk 필드만 갖는다 — 국가/지역/국적 필드를 만들지 않는다(AC-056①)', () => {
    for (const entry of EMOJI_RISK_ENTRIES) {
      expect(Object.keys(entry).sort()).toEqual(['emoji', 'risk']);
    }
  });

  it('높음 위험도 3종은 🙏 ❤️ 💦 다(TestCases.md:311)', () => {
    const high = EMOJI_RISK_ENTRIES.filter((e) => e.risk === 'high').map((e) => e.emoji);
    expect(high.sort()).toEqual(['❤️', '🙏', '💦'].sort());
  });

  it('중간 위험도 4종은 👍 😂 🔥 😅 다(TestCases.md:312)', () => {
    const medium = EMOJI_RISK_ENTRIES.filter((e) => e.risk === 'medium').map((e) => e.emoji);
    expect(medium.sort()).toEqual(['👍', '😂', '🔥', '😅'].sort());
  });

  it('낮음 위험도 3종은 😊 ✅ 🆗 다(TestCases.md:313)', () => {
    const low = EMOJI_RISK_ENTRIES.filter((e) => e.risk === 'low').map((e) => e.emoji);
    expect(low.sort()).toEqual(['😊', '✅', '🆗'].sort());
  });

  it('risk 값은 high/medium/low 셋뿐이다(고정 룩업, 결과 안정성 확보)', () => {
    const allowed: EmojiRiskLevel[] = ['high', 'medium', 'low'];
    for (const entry of EMOJI_RISK_ENTRIES) {
      expect(allowed).toContain(entry.risk);
    }
  });
});

describe('findEmojiRisk', () => {
  it('등록된 이모지는 해당 위험도를 반환한다', () => {
    expect(findEmojiRisk('🙏')).toBe('high');
    expect(findEmojiRisk('👍')).toBe('medium');
    expect(findEmojiRisk('😊')).toBe('low');
  });

  it('등록되지 않은 이모지는 null을 반환한다(지어내지 않는다)', () => {
    expect(findEmojiRisk('🎉')).toBeNull();
  });
});
