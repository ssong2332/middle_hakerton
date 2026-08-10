// R1 이모지 오해 경고 — AC-022/AC-056. 담당: [BE-A] T30. `docs/Tasks.md` T30.
//
// 🔴 규칙 기반(고정 10종 이모지 룩업, `data/emoji-risk.ts`)이며 국가·국민성 서술을 만들지 않는다
// (Planning Decision #6/#71, `docs/Database.md:29,319` G3). 문구는 고정이며 어떤 이모지가
// 걸렸는지(`subject`)만 바뀐다.
import type { Warning } from '../contract';
import { EMOJI_RISK_ENTRIES } from '../data/emoji-risk';
import type { EmojiPreference } from '../prompts/c2';

const EMOJI_RISK_MESSAGE = '이 이모지는 해석이 갈릴 수 있습니다 — 상대와 합의된 규칙이 없습니다';

/**
 * AC-056② 발동 규칙(`docs/TestCases.md:362`, 원문 그대로): "risk ∈ {높음, 중간} AND (해당
 * 상대의 #24 규약 또는 자기신고 프로필의 이모지 항목이 미사용/거의 안 씀 또는 값 없음) → 경고.
 * 규약에 '이모지 사용 OK'가 있으면 경고하지 않는다."
 *
 * `mergedEmojiPreference`는 `pipeline.ts`가 이미 AC-037 우선순위(규약 > 학습값 > 자기신고)로
 * 병합해 C2 프롬프트에도 넘기는 바로 그 최종값이다 — 이 함수가 따로 규약을 다시 읽지 않는다.
 * 규약 `emojiPolicy: 'ok'`는 그 병합 단계에서 이미 `'neutral'`로 매핑되므로(`pipeline.ts`
 * `emojiPreferenceFromProtocol` 주석 참조), **여기서 'neutral'과 'likes'는 자동으로 억제된다**
 * (`docs/TestCases.md:232` Michael 사례 — 그의 규약 `emoji_policy: 'ok'`가 경고 억제를 담당).
 * 발동 대상은 `'avoids'`와 `null`(미합의) 둘뿐 — T30 태스크 원문이 "avoids 또는 값 없음일
 * 때만 발생"이라고 명시한 그대로다.
 */
function isWarnEligible(preference: EmojiPreference | null): boolean {
  return preference === 'avoids' || preference === null;
}

/**
 * `text`(변환 결과)에서 등록된 위험 이모지(높음/중간)를 찾아 경고를 만든다. `Array.from`으로
 * 코드포인트 단위 순회를 하지 않는다 — `❤️`처럼 이모지+변형 선택자(U+FE0F)로 이루어진 항목은
 * 코드포인트 단위 순회에서 쪼개져 매치가 깨진다. 대신 등록된 10종 각각을 `includes()`로
 * 부분 문자열 검색한다(항목이 고정 10개뿐이라 이 방식이 더 단순하고 안전하다). 같은 이모지가
 * 여러 번 나와도 경고는 이모지 종류당 최대 1건 — 근거 없는 소음을 늘리지 않는다.
 */
export function emojiRiskWarnings(
  text: string,
  mergedEmojiPreference: EmojiPreference | null,
): Warning[] {
  if (!isWarnEligible(mergedEmojiPreference)) return [];

  const warnings: Warning[] = [];
  for (const entry of EMOJI_RISK_ENTRIES) {
    if (entry.risk === 'low') continue;
    if (text.includes(entry.emoji)) {
      warnings.push({ type: 'emojiRisk', message: EMOJI_RISK_MESSAGE, subject: entry.emoji });
    }
  }
  return warnings;
}
