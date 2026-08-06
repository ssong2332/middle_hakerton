/**
 * F1-c 소급 테스트 — 계약 불변식 3개가 판별 유니온으로 강제되는지 (DECISIONS #38 · ADR-0006).
 * 근거: `docs/Architecture.md` "F1-c — 계약 불변식을 타입으로 강제한다" 절, Conventions 13.
 *
 * 🔴 이 파일의 주장은 **타입**이다 — 근거는 `npm run typecheck` 출력이다(아래 세 `@ts-expect-error`).
 * Vitest가 "No test suite found"로 실패하지 않도록 런타임 `test()` 를 최소 1개 둔다
 * (`docs/Architecture.md` F1-c 절의 명시적 경고). 그 런타임 확인은 이 파일의 주장이 아니다 —
 * 값이 실제로 만들어졌는지 정도의 사소한 확인일 뿐이다.
 */
import { describe, expect, it } from 'vitest';
import type { DecisionItem, TicketOption, TicketResult } from './contract';

describe('contract.ts — F1-c 판별 유니온 불변식 (불법 조합 3개는 컴파일되지 않는다)', () => {
  it('불법 조합 위의 @ts-expect-error 가 실제로 타입 오류를 잡는다', () => {
    // 불변식 1: offered === true ⟺ basis === 'signal_present' (AC-058)
    // @ts-expect-error — 판정 실패(undetermined)인데 offered:true 는 fail-open이라 금지된다
    const illegalTicketOption: TicketOption = { offered: true, basis: 'undetermined' };

    // 불변식 2: 근거가 없으면 decisionAuthority 는 반드시 '불명' (AC-050①/AC-064⑤)
    // @ts-expect-error — 근거(evidence) 없이 '확정'을 주장하는 조합은 금지된다
    const illegalTicketResult: TicketResult = {
      sections: { problem: '없음', impact: '없음', request: '없음', concernLevel: '없음' },
      source: 'live',
      decisionAuthority: '확정',
      decisionAuthorityEvidence: null,
    };

    // 불변식 3: 근거가 없으면 authorityStatus 는 반드시 '불명' (AC-064⑤ "양쪽 모두" — C7쪽)
    // @ts-expect-error — 근거 없이 '확정'을 주장하는 조합은 금지된다 (불변식 2와 같은 문제의 C7쪽)
    const illegalDecisionItem: DecisionItem = {
      decision: '결정 내용',
      owner: null,
      dueDate: null,
      authorityStatus: '확정',
      authorityEvidence: null,
    };

    // 🔴 아래는 구조 확인일 뿐 — 이 파일의 실제 주장(불법 조합이 컴파일되지 않는다는 것)의
    // 근거는 여기가 아니라 npm run typecheck 출력이다.
    expect(illegalTicketOption).toBeTruthy();
    expect(illegalTicketResult).toBeTruthy();
    expect(illegalDecisionItem).toBeTruthy();
  });
});
