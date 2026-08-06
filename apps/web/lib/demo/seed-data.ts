/**
 * T61 — 데모 시드 데이터 (AC-013·AC-014·AC-015·AC-016·AC-059). 순수 데이터/빌더만 담는다 —
 * DB I/O는 `./seed.ts`(같은 디렉터리)에 있다(`apps/web/lib/messages/pattern-learning.ts`와 같은
 * "core 밖 DB I/O 전담 파일" 관례).
 *
 * 출처: `docs/TestCases.md:176-427` "(v1.1) 데모 시드 데이터셋" 절. **이 파일은 그 절에 없는
 * 값을 만들지 않는다** — 아래 두 항목은 소스에 없어 시드가 완결되지 않는 **알려진 gap**이며,
 * 값을 지어내는 대신 타입으로 "필수 입력"을 강제해 호출자가 빠뜨리면 즉시 드러나게 한다:
 *
 * 1. **박지훈(발신자)의 온보딩 자기신고 값** — TestCases.md:196 "자기신고 프로필" 열이 "—"다.
 *    AC-059/#85가 요구하는 "학습 전 = 자기신고는 있음 + diff 0건" 상태를 만들려면 그의
 *    `directness`/`emoji_preference`/`formality`/`honorific_level` 값이 필요한데, 소스 문서
 *    어디에도 구체값이 없다. → `buildProfileRow()`가 `selfReport`를 **필수 인자**로 요구한다.
 * 2. **Sarah Willis의 온보딩 자기신고 값** — TestCases.md:199도 "학습 데이터 없음"만 적혀 있고
 *    자기신고 자체의 구체값은 없다("cold start"는 diff·규약이 0건이라는 뜻이지 자기신고가
 *    없다는 뜻이 아니다 — TestCases.md:203-211 참조). → 마찬가지로 `selfReport` 필수.
 *
 * 실행 시 이 두 값을 채우려면 planner가 TestCases.md에 값을 추가하거나, 사용자가 직접 값을
 * 확정해야 한다(구현 판단으로 채울 성질의 데이터가 아니다 — 발표 화면에 그대로 노출된다).
 */
import type { DiffPatternKey } from '@cross-border/core';
import { classifyDiffPattern } from '@cross-border/core';

// ---------------------------------------------------------------------------
// 시드 대상 4인 식별자
// ---------------------------------------------------------------------------

export type DemoPersona = 'jihoon' | 'tanaka' | 'michael' | 'sarah';

/**
 * 🔴 판단 근거를 남긴다 — `docs/TestCases.md`는 4인의 이름·소속·타임존만 주고 로그인/발송에 쓸
 * 식별자 문자열(이메일)은 주지 않는다. `sent_messages.recipient_identifier`·`pair_protocols.
 * party_a/party_b`가 전부 "자유 텍스트 이메일"이라 **무언가 값이 있어야 시드가 성립**한다.
 * RFC 2606 예약 도메인(`.example`)을 써서 실제 라우팅 가능한 도메인이 아님을 명시했다 —
 * 이 형식 자체는 판단(구현 편의)이며 TestCases.md의 "값"이 아니다. **확인 필요**: 실제 회원가입
 * 플로우(T46)로 계정을 만들 때 이 이메일을 그대로 쓸지는 계정 생성 승인 시점에 재확인한다.
 */
export const DEMO_IDENTIFIERS: Record<DemoPersona, string> = {
  jihoon: 'jihoon.park@arasoft.example',
  tanaka: 'yuki.tanaka@sakuradigital.example',
  michael: 'michael.chen@vertexlabs.example',
  sarah: 'sarah.willis@vertexlabs.example',
};

export interface DemoProfileMeta {
  persona: DemoPersona;
  name: string;
  affiliation: string;
  timezone: string;
}

/** TestCases.md:194-199 "시드 프로필 4인" 표 그대로. */
export const DEMO_PROFILE_META: Record<DemoPersona, DemoProfileMeta> = {
  jihoon: {
    persona: 'jihoon',
    name: '박지훈',
    affiliation: '아라소프트 / 발신자(데모 주체)',
    timezone: 'Asia/Seoul',
  },
  tanaka: {
    persona: 'tanaka',
    name: '타나카 유키',
    affiliation: 'Sakura Digital / UX 리드',
    timezone: 'Asia/Tokyo',
  },
  michael: {
    persona: 'michael',
    name: 'Michael Chen',
    affiliation: 'Vertex Labs / PM',
    timezone: 'America/Los_Angeles',
  },
  sarah: {
    persona: 'sarah',
    name: 'Sarah Willis',
    affiliation: 'Vertex Labs / QA 리드 — cold start 대조군',
    timezone: 'America/New_York',
  },
};

// ---------------------------------------------------------------------------
// profiles 행 빌더 — 온보딩 완료 상태만 만든다(AC-059, Planning Decision #85)
// ---------------------------------------------------------------------------

export interface SelfReportInput {
  directness: 'direct' | 'indirect';
  emojiPreference: 'likes' | 'neutral' | 'avoids';
  formality: 'high' | 'medium' | 'low';
  /** 한국어 존댓말 레벨. 한국어 화자가 아닌 인물에게는 이 축의 근거가 없으므로 `null`이
   *  정답이다(지어내지 않는다) — `null`은 "온보딩 스킵"과 다르다(그건 `onboarding_state`가
   *  구분한다), 이 축 하나만 응답하지 않은 자기신고다. */
  honorificLevel: 'hapsyo' | 'haeyo' | null;
}

export interface ProfileRowInput {
  userId: string;
  selfReport: SelfReportInput;
}

export interface ProfileRow {
  user_id: string;
  onboarding_state: 'completed';
  directness: SelfReportInput['directness'];
  emoji_preference: SelfReportInput['emojiPreference'];
  formality: SelfReportInput['formality'];
  honorific_level: SelfReportInput['honorificLevel'];
}

/**
 * `selfReport`를 필수로 받는다 — AC-059⑦(v2.7 필수 조건)이 "시드 계정은 반드시 온보딩 완료
 * 상태"를 요구하고, `onboarding_state='completed'`이면서 스타일 4필드가 전부 NULL이면 스킵
 * 계정과 화면상 구분되지 않기 때문이다(TestCases.md:203-211). 호출자가 값을 못 채우면(위 파일
 * 헤더 gap ①②) 이 함수를 호출하지 않는 편이 지어낸 값을 넣는 것보다 낫다.
 */
export function buildProfileRow(input: ProfileRowInput): ProfileRow {
  return {
    user_id: input.userId,
    onboarding_state: 'completed',
    directness: input.selfReport.directness,
    emoji_preference: input.selfReport.emojiPreference,
    formality: input.selfReport.formality,
    honorific_level: input.selfReport.honorificLevel,
  };
}

/** TestCases.md:197 타나카 자기신고 — "완곡 선호 · 이모지 거의 안 씀 · 격식 높음". 한국어
 *  존댓말 축은 근거가 없어 `null`(비한국어 화자, TestCases에 값 없음). */
export const TANAKA_SELF_REPORT: SelfReportInput = {
  directness: 'indirect',
  emojiPreference: 'avoids',
  formality: 'high',
  honorificLevel: null,
};

/**
 * TestCases.md:198 Michael 자기신고 — "직설 선호 · 이모지 가끔 · 격식 낮음". 🔴 **판단
 * 근거**: `emoji_preference` CHECK 어휘는 `likes`/`neutral`/`avoids` 3값뿐인데 원문은 "가끔"
 * (occasional)이다. "가끔"은 적극적으로 좋아함(`likes`)도 회피(`avoids`)도 아니어서 `neutral`로
 * 매핑했다 — 세 값 중 어느 쪽으로도 못 미는 원문을 임의로 강한 쪽에 붙이지 않기 위함. **이
 * 매핑은 구현 판단이며 TestCases.md 원문 표기는 아니다(확인 권장).**
 */
export const MICHAEL_SELF_REPORT: SelfReportInput = {
  directness: 'direct',
  emojiPreference: 'neutral',
  formality: 'low',
  honorificLevel: null,
};

// ---------------------------------------------------------------------------
// dictionary_terms — 22개 (번역 금지 4 + 대응 고정 18), TestCases.md:382-411
// ---------------------------------------------------------------------------

export interface DictionaryTermRowInput {
  ownerUserId: string;
}

export interface DictionaryTermRow {
  owner_user_id: string;
  entry_type: 'term';
  source_text: string;
  target_text: string | null;
  ko_honorific: null;
  en_honorific: null;
  note: string | null;
}

/** TestCases.md:386 "번역 금지 (4)" — 원문 유지가 기본이므로 `target_text=null`
 *  (`docs/Database.md:124` "원문 유지가 기본이면 NULL"). */
const FORBIDDEN_TERM_SOURCES = ['Nexus', '아라소프트', 'Sakura Digital', 'Vertex Labs'] as const;

/** TestCases.md:390-409 "대응 고정 (18)" 표 그대로 — 임의로 빼지 않았다(사용자 확정 실측
 *  22개, Planning Decision — TestCases.md:384). */
const FIXED_TERM_ENTRIES: ReadonlyArray<{ source: string; target: string; note: string | null }> = [
  { source: '스프린트', target: 'sprint / スプリント', note: null },
  { source: '배포', target: 'deploy', note: '릴리스와 구분' },
  { source: 'QA', target: 'QA', note: '"품질보증"으로 풀지 말 것' },
  { source: '리뷰', target: 'review', note: '검토/평가 혼용 금지' },
  { source: '이슈', target: 'issue', note: '문제/과제로 풀지 말 것' },
  { source: '머지', target: 'merge', note: null },
  { source: '롤백', target: 'rollback', note: null },
  { source: '스펙', target: 'spec / 仕様', note: null },
  { source: '마일스톤', target: 'milestone', note: null },
  { source: '핫픽스', target: 'hotfix', note: null },
  { source: '스테이징', target: 'staging', note: 'テスト環境으로 뭉뚱그리지 말 것' },
  { source: '커밋', target: 'commit', note: null },
  { source: '브랜치', target: 'branch', note: null },
  { source: '픽스', target: 'fix', note: null },
  { source: '데드라인', target: 'deadline / 締切', note: null },
  { source: '리소스', target: 'resource', note: '인력/자원 혼용 주의' },
  { source: '컨펌', target: 'confirm', note: '한국식 "컨펌"은 approve 의미가 강하다 — 문맥 확인 필요' },
  { source: '공수', target: 'effort / 工数', note: null },
];

/** 22개(=4+18) 그대로 — 개수가 어긋나면 아래 테스트에서 즉시 드러난다. */
export function buildDictionaryTerms(input: DictionaryTermRowInput): DictionaryTermRow[] {
  const forbidden: DictionaryTermRow[] = FORBIDDEN_TERM_SOURCES.map((source) => ({
    owner_user_id: input.ownerUserId,
    entry_type: 'term',
    source_text: source,
    target_text: null,
    ko_honorific: null,
    en_honorific: null,
    note: null,
  }));

  const fixed: DictionaryTermRow[] = FIXED_TERM_ENTRIES.map((entry) => ({
    owner_user_id: input.ownerUserId,
    entry_type: 'term',
    source_text: entry.source,
    target_text: entry.target,
    ko_honorific: null,
    en_honorific: null,
    note: entry.note,
  }));

  return [...forbidden, ...fixed];
}

// ---------------------------------------------------------------------------
// pair_protocols — 타나카·Michael 2건, TestCases.md:239-244
// ---------------------------------------------------------------------------

export interface PairProtocolRow {
  pair_key: string;
  party_a: string;
  party_b: string;
  directness_allowed: 'yes' | 'no';
  emoji_policy: 'ok' | 'avoid';
  address_form: string;
  deadline_style: string;
}

/**
 * `docs/Database.md:140` "두 식별자를 소문자화 후 정렬해 〈구분자〉로 연결"이라고만 적혀 있고
 * 구분자 문자 자체가 문서 렌더링에서 비어 있다(코드 스팬이 빈 채로 남음 — measured, 원문
 * 그대로 인용해도 문자가 없다). **T41(#24 규약 구현)이 아직 착수 전이라 실제 알고리즘이 코드에
 * 없다** — 이 함수는 T61이 임시로 고른 구분자(`::`)를 쓴다. **T41 착수 시 이 형식이 실제
 * 구현과 일치하는지 반드시 재확인해야 한다** — 다르면 이 시드 행을 `pair_key`로 조회하는 코드가
 * 이 행을 찾지 못한다.
 */
export function buildPairKey(identifierA: string, identifierB: string): string {
  return [identifierA.toLowerCase(), identifierB.toLowerCase()].sort().join('::');
}

/** TestCases.md:239-244 "규약 시드 (4항목 = AC-037)" 표 그대로. */
export function buildPairProtocols(identifiers: {
  jihoon: string;
  tanaka: string;
  michael: string;
}): PairProtocolRow[] {
  return [
    {
      pair_key: buildPairKey(identifiers.jihoon, identifiers.tanaka),
      party_a: [identifiers.jihoon, identifiers.tanaka].sort()[0],
      party_b: [identifiers.jihoon, identifiers.tanaka].sort()[1],
      directness_allowed: 'no',
      emoji_policy: 'avoid',
      address_form: '성 + 경칭',
      deadline_style: '명시적 날짜',
    },
    {
      pair_key: buildPairKey(identifiers.jihoon, identifiers.michael),
      party_a: [identifiers.jihoon, identifiers.michael].sort()[0],
      party_b: [identifiers.jihoon, identifiers.michael].sort()[1],
      directness_allowed: 'yes',
      emoji_policy: 'ok',
      address_form: '이름(First name)',
      deadline_style: '명시적 날짜 / EOD',
    },
  ];
}

// ---------------------------------------------------------------------------
// diff_records — 사용자(박지훈) 단위 10건, TestCases.md:217-228
// ---------------------------------------------------------------------------

export interface DiffHistoryEntry {
  /** TestCases.md 표의 순번(#1~#10) — 참고용, DB 컬럼 아님. */
  seq: number;
  aiText: string;
  finalText: string;
  /** TestCases.md "패턴 분류" 열의 한국어 라벨 — 참고용, DB 컬럼 아님. */
  declaredPatternLabel: string;
  /** 이 diff를 저장할 때 넣을 `pattern_key`. `classifyDiffPattern()`이 지원하는 두 값
   *  (`emoji_removed`/`cushion_insert`) 외에는 **분류기가 만들 수 없는 값이라 `null`**로
   *  둔다 — 새 pattern_key 어휘를 지어내지 않는다(`packages/core/src/rules/pattern-
   *  detection.ts:17` "이 두 값 이외의 pattern_key는 이 파일이 만들지 않는다"). */
  patternKey: DiffPatternKey | null;
  /** 참고용 — 카운팅에 쓰지 않는다(Planning Decision #35/#70, TestCases.md:215). */
  referenceRecipient: 'tanaka' | 'michael';
}

/**
 * TestCases.md:219-228 "diff 학습 히스토리 10건" 표 원문 그대로. 🔴 **entry 8은 원문이
 * `"Sorry to bother you, but…" → (삭제)`** 로, "(삭제)"는 실제 문장이 아니라 "이 표현이
 * 최종문에서 사라졌다"는 표기다. 이 함수는 그 표기를 **문자 그대로 빈 문자열로 해석**한다 —
 * 이 해석이 맞는지(원문 전체에서 이 문장만 빠진 것인지, 메시지 전체가 비는 것인지)는
 * TestCases.md에 더 이상의 근거가 없어 **확인이 필요한 gap**으로 남긴다.
 */
export const DIFF_HISTORY_SOURCE: DiffHistoryEntry[] = [
  {
    seq: 1,
    aiText: '이 방안은 어렵습니다',
    finalText: '이 방안은 저희 쪽 일정상 검토가 어려울 것 같습니다',
    declaredPatternLabel: '완충 삽입',
    patternKey: 'cushion_insert',
    referenceRecipient: 'tanaka',
  },
  {
    seq: 2,
    aiText: '언제까지 가능하신가요?',
    finalText: '혹시 일정에 무리가 없으시다면, 언제쯤 가능하실지 여쭤봐도 될까요?',
    declaredPatternLabel: '완충 삽입',
    patternKey: 'cushion_insert',
    referenceRecipient: 'tanaka',
  },
  {
    seq: 3,
    aiText: '확인했습니다 👍',
    finalText: '확인했습니다. 감사합니다.',
    declaredPatternLabel: '이모지 제거',
    patternKey: 'emoji_removed',
    referenceRecipient: 'tanaka',
  },
  {
    seq: 4,
    aiText: '빠른 시일 내에 부탁드립니다',
    finalText: '8월 14일(목)까지 부탁드릴 수 있을까요?',
    declaredPatternLabel: '기한 명시',
    patternKey: null,
    referenceRecipient: 'tanaka',
  },
  {
    seq: 5,
    aiText: '이건 저희 담당이 아닙니다',
    finalText: '이 부분은 저희 범위 밖이라, 담당 팀에 연결해 드리겠습니다',
    declaredPatternLabel: '완충 삽입',
    patternKey: 'cushion_insert',
    referenceRecipient: 'tanaka',
  },
  {
    seq: 6,
    aiText: "If it's not too much trouble, could you possibly review this?",
    finalText: 'Could you review this by Thursday?',
    declaredPatternLabel: '기한 명시',
    patternKey: null,
    referenceRecipient: 'michael',
  },
  {
    seq: 7,
    aiText: 'We wanted to share some context first…',
    finalText: 'Short version: we need the API spec by Friday. Context below.',
    declaredPatternLabel: '결론 우선',
    patternKey: null,
    referenceRecipient: 'michael',
  },
  {
    seq: 8,
    aiText: 'Sorry to bother you, but…',
    finalText: '',
    declaredPatternLabel: '사과 축소',
    patternKey: null,
    referenceRecipient: 'michael',
  },
  {
    seq: 9,
    aiText: 'We might possibly consider…',
    finalText: "We'll do X.",
    declaredPatternLabel: '단정화',
    patternKey: null,
    referenceRecipient: 'michael',
  },
  {
    seq: 10,
    aiText: 'Please kindly confirm at your earliest convenience',
    finalText: 'Please confirm by EOD Wed.',
    declaredPatternLabel: '기한 명시',
    patternKey: null,
    referenceRecipient: 'michael',
  },
];

/**
 * 🔴 **알려진 divergence(반드시 알고 진행할 것)**: `classifyDiffPattern()`(T20, 완충 표현
 * 블랙리스트 8개)을 entry 1·5의 실제 문자열에 그대로 돌리면 **cushion_insert가 나오지
 * 않는다** — 두 문장 다 블랙리스트 8개 표현("혹시"·"괜찮으시다면" 등)을 쓰지 않기 때문이다
 * (entry 2만 "혹시"를 포함해 실제로 매치된다). 즉 **실시간 발송 파이프라인(`insertDiffRecord`
 * → `classifyDiffPattern`)에 이 세 문장을 그대로 태우면 cushion_insert는 전역 1회(entry 2)에
 * 그치고 3회 반영 데모가 성립하지 않는다.**
 *
 * 이 시드는 실시간 파이프라인을 타지 않고 `diff_records`에 **직접 pattern_key를 지정**해
 * insert한다(seed.ts) — TestCases.md가 선언한 라벨(완충 삽입=cushion_insert)을 그대로 쓴다.
 * **이 함수는 그 divergence를 테스트로 고정해, 나중에 분류기가 바뀌어 이 사실이 달라지면
 * 테스트가 깨지게 한다.**
 */
export function classifierAgreesWithDeclaredPattern(entry: DiffHistoryEntry): boolean {
  return classifyDiffPattern(entry.aiText, entry.finalText) === entry.patternKey;
}

/** entry.patternKey별 전역(사용자 단위) 발생 횟수. */
export function countByPatternKey(
  entries: readonly DiffHistoryEntry[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    if (entry.patternKey === null) continue;
    counts[entry.patternKey] = (counts[entry.patternKey] ?? 0) + 1;
  }
  return counts;
}
