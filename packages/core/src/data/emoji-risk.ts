/**
 * 이모지 위험도 3단계 룩업 (T61, AC-013·AC-014·AC-015·AC-016 데모 시드 — 소비처는 T30, 아직
 * 미착수). 데이터 출처: `docs/TestCases.md:303-327` "이모지 판정 데이터 — 국가 라벨 없음".
 *
 * 🔴 G3(`docs/Database.md:29,319`) — 국가·지역·국적 컬럼을 만들지 않는다(Planning Decision
 * #6·#71: 국가 단위 일반화·스테레오타입 금지). 이 파일은 DB 테이블이 아니라 리포 내 정적 데이터다
 * — `docs/Database.md:319` 가 가리키는 그 파일이 이 파일이다.
 *
 * ⚠️ 위험도 3단계 배정 자체는 측정치가 아니라 판단(추정)이다(TestCases.md:326) — 발표에서
 * "조사 결과"로 말하지 않는다.
 */

/** `docs/PRD.md` AC-056① 고정 3단계. 코드베이스의 다른 enum 컬럼(예: `profiles.formality`
 *  `high`/`medium`/`low`)과 같은 영문 소문자 어휘를 쓴다 — TestCases.md 원문은 한국어
 *  "높음/중간/낮음"이지만, 이 파일 밖(향후 T30)에서 스키마·CHECK 제약과 일관된 어휘로 참조할 수
 *  있게 값만 영문으로 옮겼다(의미·건수·이모지 목록은 원문 그대로, 새로 만든 값이 아니다). */
export type EmojiRiskLevel = 'high' | 'medium' | 'low';

export interface EmojiRiskEntry {
  emoji: string;
  risk: EmojiRiskLevel;
}

/** TestCases.md:311~313 표 그대로 — 임의로 이모지를 추가·삭제하지 않았다. */
export const EMOJI_RISK_ENTRIES: EmojiRiskEntry[] = [
  { emoji: '🙏', risk: 'high' },
  { emoji: '❤️', risk: 'high' },
  { emoji: '💦', risk: 'high' },
  { emoji: '👍', risk: 'medium' },
  { emoji: '😂', risk: 'medium' },
  { emoji: '🔥', risk: 'medium' },
  { emoji: '😅', risk: 'medium' },
  { emoji: '😊', risk: 'low' },
  { emoji: '✅', risk: 'low' },
  { emoji: '🆗', risk: 'low' },
];

/** 등록되지 않은 이모지는 `null`(지어내지 않는다 — `docs/CodingRules.md` Error Handling). */
export function findEmojiRisk(
  emoji: string,
  entries: readonly EmojiRiskEntry[] = EMOJI_RISK_ENTRIES,
): EmojiRiskLevel | null {
  return entries.find((entry) => entry.emoji === emoji)?.risk ?? null;
}
