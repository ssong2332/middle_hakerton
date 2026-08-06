/**
 * 수정 패턴 분류기 — AI 제안문과 사용자 최종 발송문의 diff에서, 3회 반복되면 프로필 학습
 * 후보가 되는 수정 패턴을 식별한다 (`docs/Tasks.md` T20, AC-012/AC-013).
 *
 * 🔴 diff 저장 자체는 이 태스크의 범위가 아니다 — `diff_records` insert는 T14가 이미
 * `apps/web/lib/messages/storage.ts`에 구현했고, 그 파일이 지금까지 `pattern_key`를 항상
 * `null`로 넣어 왔다(분류기가 없었기 때문 — `storage.ts` 옛 주석 "분류기는 T20 범위" 참조).
 * 이 파일은 그 저장 직전에 `pattern_key`를 채우는 **순수 분류 로직**만 담당한다. 3회 반복
 * 판정과 `profile_learned_items` 쓰기는 DB I/O가 필요해 core 밖
 * (`apps/web/lib/messages/pattern-learning.ts`)에 있다
 * (`docs/Architecture.md` Conventions 11 — "DB 조회물은 core 밖에서, core 안에 조회 함수를
 * 만들지 않는다").
 *
 * 🔴 규칙 기반(표층 문자열 매칭)이며 형태소 분석기를 쓰지 않는다 — `rules/honorific.ts`와 같은
 * 제약(새 의존성 0개, `docs/DECISIONS.md`에 항목 없음). `docs/Database.md`
 * `profile_learned_items` 절(78행)이 예시로 드는 두 패턴만 구현한다: `emoji_removed`,
 * `cushion_insert`. 이 두 값 이외의 `pattern_key`는 이 파일이 만들지 않는다 — 분류 불가는
 * `null`이 정답이다(`docs/CodingRules.md` Error Handling "없는 값을 지어내지 않는다").
 */

/** `diff_records.pattern_key` / `profile_learned_items.pattern_key` 와 같은 어휘. */
export type DiffPatternKey = 'emoji_removed' | 'cushion_insert';

/**
 * 이모지 계열 문자 판정. `\p{Extended_Pictographic}`는 이모지로 렌더링될 수 있는 문자 전체를
 * 포괄하는 유니코드 속성이며(ZWJ 시퀀스 조합 요소 포함), 개별 코드포인트 범위를 나열하는 것보다
 * 누락이 적다.
 */
const EMOJI_PATTERN = /\p{Extended_Pictographic}/gu;

function countEmoji(text: string): number {
  return text.match(EMOJI_PATTERN)?.length ?? 0;
}

/**
 * 한국어 비즈니스 완충 표현(쿠션어) 목록. `honorific.ts`와 같은 이유로 블랙리스트 방식이며
 * 완전하지 않다(형태소 분석 없이는 모든 완충 표현을 열거할 수 없다) — 새로 발견되는 표현은
 * 이 배열에 추가한다. 목록은 실제 비즈니스 이메일/메시지에서 흔히 쓰이는 요청 앞 완충구로
 * 한정했다.
 */
const CUSHION_PHRASES = [
  '혹시',
  '괜찮으시다면',
  '괜찮으시면',
  '번거로우시겠지만',
  '바쁘신 와중에',
  '죄송하지만',
  '실례가 안 된다면',
  '가능하시다면',
] as const;

/** `text` 안에 `phrase`가 몇 번 나오는지 — 겹치지 않는 부분 문자열 개수. */
function countOccurrences(text: string, phrase: string): number {
  if (phrase === '') return 0;
  return text.split(phrase).length - 1;
}

/** AI 제안문에는 없던 완충 표현이 최종문에서 새로 늘었는지(추가되었는지) 판정한다. */
function hasCushionInsert(aiText: string, finalText: string): boolean {
  return CUSHION_PHRASES.some(
    (phrase) => countOccurrences(finalText, phrase) > countOccurrences(aiText, phrase),
  );
}

/**
 * `diff_records.pattern_key`를 채우는 유일한 통로 — 이 파일 밖에서 `pattern_key` 문자열을
 * 손으로 조립하지 않는다.
 *
 * - `emoji_removed`: AI 제안문에는 이모지가 있었지만 최종문에서 전부 사라졌다.
 * - `cushion_insert`: AI 제안문에 없던 한국어 완충 표현이 최종문에서 새로 추가되었다.
 * - 둘 다 아니면 `null`(분류 불가 — 지어내지 않는다).
 *
 * 🔴 우선순위: 이모지 제거를 먼저 본다. 한 diff가 두 패턴에 동시에 해당하는 입력에서 어느
 * 쪽을 pattern_key로 남길지 규정한 문서가 없어(`docs/Database.md`는 컬럼이 단일 값임만
 * 명시) 구현 판단으로 순서를 고정한다 — 이모지 유무는 개수 비교만으로 판정되는 이진 신호라
 * 완충어 블랙리스트 매칭보다 오탐 여지가 적다.
 */
export function classifyDiffPattern(aiText: string, finalText: string): DiffPatternKey | null {
  const aiEmojiCount = countEmoji(aiText);
  const finalEmojiCount = countEmoji(finalText);
  if (aiEmojiCount > 0 && finalEmojiCount === 0) return 'emoji_removed';
  if (hasCushionInsert(aiText, finalText)) return 'cushion_insert';
  return null;
}

/**
 * `profile_learned_items.value` — 패턴이 3회 이상 반복되어 프로필에 반영될 때 그 값.
 * `docs/Database.md` `profiles` 절의 스타일 컬럼 어휘(`emoji_preference`/`directness`)를
 * 그대로 재사용한다(임의 어휘를 새로 만들지 않는다).
 *
 * 🔴 이 함수는 `profile_learned_items` 테이블에 쓸 값만 만든다 — `profiles` 테이블 자체를
 * 갱신하는 것은 이 태스크(T20)의 범위가 아니다(`docs/Architecture.md:934,939` — 파이프라인과
 * `GET /api/profile/learned`가 `profile_learned_items`를 **읽는** 소비처이며, `profiles`에
 * 쓰는 별도 경로는 문서 어디에도 T20 소관으로 지정되어 있지 않다).
 */
export function profileValueForPattern(patternKey: DiffPatternKey): string {
  switch (patternKey) {
    case 'emoji_removed':
      return 'avoids';
    case 'cushion_insert':
      return 'indirect';
  }
}
