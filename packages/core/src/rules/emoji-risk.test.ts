/**
 * R1 이모지 오해 경고 — AC-022/AC-056. 발동 규칙은 `docs/TestCases.md:362` 원문:
 * "risk ∈ {높음, 중간} AND (해당 상대의 규약 또는 자기신고 프로필의 이모지 항목이 미사용/거의
 * 안 씀 또는 값 없음) → 경고. 규약에 '이모지 사용 OK'가 있으면 경고하지 않는다."
 * `docs/Tasks.md` T30이 요구하는 "충돌 케이스 2건(발생 1 / 억제 1) 확인"이 아래 테스트다.
 */
import { describe, expect, it } from 'vitest';
import { emojiRiskWarnings } from './emoji-risk';

describe('emojiRiskWarnings — AC-056②', () => {
  it('발생 — 위험도 높음 이모지 + 미합의(null)면 경고한다', () => {
    const warnings = emojiRiskWarnings('확인 부탁드립니다 🙏', null);

    expect(warnings).toEqual([
      {
        type: 'emojiRisk',
        message: '이 이모지는 해석이 갈릴 수 있습니다 — 상대와 합의된 규칙이 없습니다',
        subject: '🙏',
      },
    ]);
  });

  it('발생 — 위험도 중간 이모지 + avoids면 경고한다', () => {
    const warnings = emojiRiskWarnings('감사합니다 👍', 'avoids');

    expect(warnings).toEqual([
      {
        type: 'emojiRisk',
        message: '이 이모지는 해석이 갈릴 수 있습니다 — 상대와 합의된 규칙이 없습니다',
        subject: '👍',
      },
    ]);
  });

  it('억제 — 병합된 이모지 선호가 neutral(규약 emojiPolicy:ok가 매핑된 값)이면 경고하지 않는다', () => {
    const warnings = emojiRiskWarnings('확인 부탁드립니다 🙏', 'neutral');

    expect(warnings).toEqual([]);
  });

  it('억제 — likes면 경고하지 않는다', () => {
    const warnings = emojiRiskWarnings('감사합니다 👍', 'likes');

    expect(warnings).toEqual([]);
  });

  it('위험도 낮음 이모지는 선호와 무관하게 경고하지 않는다', () => {
    const warnings = emojiRiskWarnings('확인했습니다 😊', null);

    expect(warnings).toEqual([]);
  });

  it('등록된 위험 이모지가 텍스트에 없으면 경고 0건', () => {
    const warnings = emojiRiskWarnings('확인 부탁드립니다', null);

    expect(warnings).toEqual([]);
  });

  it('여러 위험 이모지가 있으면 종류별로 각각 경고하되, 같은 이모지 중복 등장은 1건으로 묶는다', () => {
    const warnings = emojiRiskWarnings('🙏 감사합니다 🙏 👍', null);

    expect(warnings).toHaveLength(2);
    expect(warnings.map((w) => w.subject).sort()).toEqual(['👍', '🙏']);
  });

  it('❤️(이모지+변형 선택자 2코드포인트)도 정확히 매치한다', () => {
    const warnings = emojiRiskWarnings('감사합니다 ❤️', null);

    expect(warnings).toEqual([
      {
        type: 'emojiRisk',
        message: '이 이모지는 해석이 갈릴 수 있습니다 — 상대와 합의된 규칙이 없습니다',
        subject: '❤️',
      },
    ]);
  });
});
