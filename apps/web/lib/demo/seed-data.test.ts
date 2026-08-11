/**
 * T61 — 데모 시드 데이터 순수 빌더 테스트. 값 출처는 `docs/TestCases.md:176-427`.
 */
import { describe, expect, it } from 'vitest';
import {
  buildDictionaryTerms,
  buildPairKey,
  buildPairProtocols,
  buildProfileRow,
  classifierAgreesWithDeclaredPattern,
  countByPatternKey,
  DEMO_IDENTIFIERS,
  DIFF_HISTORY_SOURCE,
  MICHAEL_SELF_REPORT,
  TANAKA_SELF_REPORT,
} from './seed-data';
import { computePairKey } from '../protocol/storage';

describe('buildProfileRow', () => {
  it('onboarding_state를 항상 completed로 만든다(AC-059, Planning Decision #85)', () => {
    const row = buildProfileRow({ userId: 'user-tanaka', selfReport: TANAKA_SELF_REPORT });
    expect(row.onboarding_state).toBe('completed');
  });

  it('타나카 자기신고 — 완곡/이모지 회피/격식 높음(TestCases.md:197)', () => {
    const row = buildProfileRow({ userId: 'user-tanaka', selfReport: TANAKA_SELF_REPORT });
    expect(row).toMatchObject({
      directness: 'indirect',
      emoji_preference: 'avoids',
      formality: 'high',
      honorific_level: null,
    });
  });

  it('Michael 자기신고 — 직설/이모지 중립/격식 낮음(TestCases.md:198)', () => {
    const row = buildProfileRow({ userId: 'user-michael', selfReport: MICHAEL_SELF_REPORT });
    expect(row).toMatchObject({
      directness: 'direct',
      emoji_preference: 'neutral',
      formality: 'low',
      honorific_level: null,
    });
  });

  it('스타일 필드가 전부 비어 있으면 onboarding_state=completed 여도 스킵 계정과 구분되지 않는다 — selfReport는 타입상 필수다', () => {
    // @ts-expect-error selfReport 없이 호출하면 컴파일 타임에 막힌다(런타임 가드가 아니라 타입 가드).
    expect(() => buildProfileRow({ userId: 'user-x' })).toThrow();
  });
});

describe('buildDictionaryTerms — 22개(번역 금지 4 + 대응 고정 18), TestCases.md:382-411', () => {
  const rows = buildDictionaryTerms({ ownerUserId: 'user-jihoon' });

  it('정확히 22개다(사용자 실측, "20개" 아님)', () => {
    expect(rows).toHaveLength(22);
  });

  it('번역 금지 4개는 target_text가 null이다(원문 유지 기본)', () => {
    const forbidden = rows.filter((r) =>
      ['Nexus', '아라소프트', 'Sakura Digital', 'Vertex Labs'].includes(r.source_text),
    );
    expect(forbidden).toHaveLength(4);
    for (const row of forbidden) {
      expect(row.target_text).toBeNull();
    }
  });

  it('대응 고정 18개 중 컨펌/공수가 등록된다(발표 예시 용어)', () => {
    const confirm = rows.find((r) => r.source_text === '컨펌');
    const gongsu = rows.find((r) => r.source_text === '공수');
    expect(confirm?.target_text).toBe('confirm');
    expect(gongsu?.target_text).toBe('effort / 工数');
  });

  it('모든 행이 ownerUserId로 스코프된다', () => {
    for (const row of rows) {
      expect(row.owner_user_id).toBe('user-jihoon');
    }
  });
});

describe('buildPairKey', () => {
  it('두 식별자를 소문자화 후 정렬해 연결하고, 인자 순서와 무관하게 같은 값을 만든다', () => {
    const a = buildPairKey(DEMO_IDENTIFIERS.jihoon.toUpperCase(), DEMO_IDENTIFIERS.tanaka.toUpperCase());
    const b = buildPairKey(DEMO_IDENTIFIERS.tanaka, DEMO_IDENTIFIERS.jihoon);
    expect(a).toBe(b);
  });

  // T62(2026-08-11) — 이전에는 이 테스트가 seed-data.ts 자신의 `::` 구분자를 그대로 재확인하는
  // 순환 검증이라, T61의 임시 구분자가 T41의 실제 `computePairKey()`(U+0001 구분자)와 달라도
  // 잡지 못했다(seed된 규약 행을 실제 앱이 영원히 못 찾는 버그). 이제 실제 구현과의 일치를
  // 직접 단언한다 — `buildPairKey`가 다시 갈라지면(예: 다른 사람이 실수로 재구현) 즉시 fail한다.
  it('실제 조회 경로(protocol/storage.ts computePairKey)와 동일한 값을 만든다', () => {
    expect(buildPairKey(DEMO_IDENTIFIERS.jihoon, DEMO_IDENTIFIERS.tanaka)).toBe(
      computePairKey(DEMO_IDENTIFIERS.jihoon, DEMO_IDENTIFIERS.tanaka),
    );
    expect(buildPairKey(DEMO_IDENTIFIERS.jihoon, DEMO_IDENTIFIERS.michael)).toBe(
      computePairKey(DEMO_IDENTIFIERS.jihoon, DEMO_IDENTIFIERS.michael),
    );
  });
});

describe('buildPairProtocols — 2건, TestCases.md:239-244', () => {
  const rows = buildPairProtocols(DEMO_IDENTIFIERS);

  it('타나카·Michael 2건을 만든다', () => {
    expect(rows).toHaveLength(2);
  });

  it('타나카 규약 — 직설 불허/이모지 회피/성+경칭/명시적 날짜', () => {
    const tanaka = rows.find((r) => r.pair_key === buildPairKey(DEMO_IDENTIFIERS.jihoon, DEMO_IDENTIFIERS.tanaka));
    expect(tanaka).toMatchObject({
      directness_allowed: 'no',
      emoji_policy: 'avoid',
      address_form: '성 + 경칭',
      deadline_style: '명시적 날짜',
    });
  });

  it('Michael 규약 — 직설 허용/이모지 가끔 허용/이름/명시적 날짜 또는 EOD', () => {
    const michael = rows.find((r) => r.pair_key === buildPairKey(DEMO_IDENTIFIERS.jihoon, DEMO_IDENTIFIERS.michael));
    expect(michael).toMatchObject({
      directness_allowed: 'yes',
      emoji_policy: 'ok',
      address_form: '이름(First name)',
      deadline_style: '명시적 날짜 / EOD',
    });
  });

  it('AC-037 "충돌 시 규약 우선"의 실물 증거 — Michael 규약(직설 허용=yes)이 전역 학습(완충 삽입=indirect)과 다른 값이다', () => {
    const michael = rows.find((r) => r.pair_key === buildPairKey(DEMO_IDENTIFIERS.jihoon, DEMO_IDENTIFIERS.michael));
    expect(michael?.directness_allowed).toBe('yes');
  });
});

describe('DIFF_HISTORY_SOURCE — 10건, TestCases.md:217-228', () => {
  it('정확히 10건이다', () => {
    expect(DIFF_HISTORY_SOURCE).toHaveLength(10);
  });

  it('cushion_insert가 전역 3회 나타난다(#1·#2·#5) — AC-013 3회 이상 반영 데모', () => {
    const counts = countByPatternKey(DIFF_HISTORY_SOURCE);
    expect(counts.cushion_insert).toBe(3);
  });

  it('emoji_removed는 전역 1회뿐이다(#3) — AC-013 3회 미만 미반영 데모', () => {
    const counts = countByPatternKey(DIFF_HISTORY_SOURCE);
    expect(counts.emoji_removed).toBe(1);
  });

  it('분류기 미지원 라벨(기한 명시/결론 우선/사과 축소/단정화)은 pattern_key를 null로 둔다 — 새 어휘를 지어내지 않는다', () => {
    const unsupported = DIFF_HISTORY_SOURCE.filter((e) =>
      ['기한 명시', '결론 우선', '사과 축소', '단정화'].includes(e.declaredPatternLabel),
    );
    expect(unsupported).toHaveLength(6);
    for (const entry of unsupported) {
      expect(entry.patternKey).toBeNull();
    }
  });
});

describe('classifierAgreesWithDeclaredPattern — 실 분류기와의 divergence를 고정한다', () => {
  it('entry #2(이모지 제거 아님, "혹시" 포함)는 분류기와 일치한다', () => {
    const entry2 = DIFF_HISTORY_SOURCE.find((e) => e.seq === 2)!;
    expect(classifierAgreesWithDeclaredPattern(entry2)).toBe(true);
  });

  it('entry #3(이모지 제거)은 분류기와 일치한다', () => {
    const entry3 = DIFF_HISTORY_SOURCE.find((e) => e.seq === 3)!;
    expect(classifierAgreesWithDeclaredPattern(entry3)).toBe(true);
  });

  it('entry #1은 TestCases 라벨(완충 삽입)과 실 분류기가 불일치한다(문자열이 블랙리스트 8개를 쓰지 않는다) — 시드가 직접 pattern_key를 지정하는 이유', () => {
    const entry1 = DIFF_HISTORY_SOURCE.find((e) => e.seq === 1)!;
    expect(classifierAgreesWithDeclaredPattern(entry1)).toBe(false);
  });

  it('entry #5도 마찬가지로 불일치한다', () => {
    const entry5 = DIFF_HISTORY_SOURCE.find((e) => e.seq === 5)!;
    expect(classifierAgreesWithDeclaredPattern(entry5)).toBe(false);
  });
});
