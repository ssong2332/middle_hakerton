/**
 * 결정 권한 상태(Decision Authority Status)의 **단일 출처**.
 *
 * 위치 근거: `docs/Architecture.md:249` — *"enum과 판정 로직은
 * `packages/core/src/rules/decision-authority.ts` 한 곳을 공유한다
 * (Planning Decision #8: C7이 별도 파이프라인을 만들지 않는다)."*
 *
 * 🔴 이 파일이 존재하는 이유가 곧 AC-064 ④다 — **C6(티켓)과 C7(요약)이 서로 다른 enum이나
 * 서로 다른 판정 파이프라인을 갖지 못하게 막는 것**. 두 경로는 필드 *이름*만 다르고
 * (`TicketResult.decisionAuthority` vs `SummaryResult.decisions[].authorityStatus`,
 * `contract.ts` 참조) **값의 어휘와 판정 근거는 여기 하나를 공유**한다.
 *
 * T1(이 커밋)의 범위는 **enum 확정까지**다. 판정 로직(함수)은 T24가 이 파일에 추가하고
 * T26(C7)이 그것을 **재사용**한다 — T26이 자기 판정 함수를 새로 만들면 AC-064 ④ 위반이다.
 *
 * F1-c(DECISIONS #38 · ADR-0006, `docs/Architecture.md:368~465`)에서 이 파일에
 * `DecisionAuthorityJudged` / `AuthorityVerdict` / `resolveAuthority()` 가 추가됐다 —
 * 불변식 2·3("근거가 없으면 반드시 `불명`")을 만드는 **유일한 통로**다.
 */

/**
 * 결정 권한 상태 4값 (AC-050 / AC-064 ①②).
 *
 * - `확정` — 원문에 결정 권한이 있다는 근거가 있다.
 * - `내부 승인 필요` — 상위 승인이 필요하다는 근거가 있다.
 * - `검토 중` — 아직 판단 중이라는 근거가 있다.
 * - `불명` — 🔴 **근거가 없을 때의 정상값.** 임의 판정 금지(AC-064 ⑤ = AC-050 ① =
 *   `docs/CodingRules.md` Error Handling "없는 값을 지어내지 않는다").
 *   비어 있음(빈 문자열·`null`)이 아니라 **명시적으로 `불명`** 이며,
 *   화면에서도 빈칸이 아니라 "불명"으로 렌더된다(`docs/UX.md` UX-008 Failure 행).
 */
export type DecisionAuthorityStatus = '확정' | '내부 승인 필요' | '검토 중' | '불명';

/**
 * `DecisionAuthorityStatus` 중 **판정이 내려진** 값만 (근거가 있는 3값). `'불명'` 은 제외된다.
 * F1-c 신규 (DECISIONS #38 · ADR-0006).
 */
export type DecisionAuthorityJudged = Exclude<DecisionAuthorityStatus, '불명'>;

/**
 * 🔴 필드 이름이 **중립**이다 — `status`/`evidence` 는 어떤 응답 payload에도 나가지 않는다
 * (AC-064③ grep 보호). `resolveAuthority()` 의 반환 타입일 뿐, `TicketResult`·`DecisionItem`
 * 은 각자의 필드 이름(`decisionAuthority`/`authorityStatus`)으로 이 값을 옮겨 담는다
 * (`contract.ts` `TicketAuthority`/`ItemAuthority` 참조).
 * F1-c 신규 (DECISIONS #38 · ADR-0006).
 */
export type AuthorityVerdict =
  | { status: DecisionAuthorityJudged; evidence: string }
  | { status: '불명'; evidence: string | null };

/**
 * 🔴 불변식 2·3의 **유일한 통로**. 근거가 없으면(`evidence === null`) `'불명'` 으로 되돌리고,
 * 상태가 이미 `'불명'` 이면 근거가 있어도 `'불명'` 을 유지한다 — 판정을 지어내지 않는다
 * (`docs/Architecture.md` Conventions 9, F1-c).
 *
 * 판정 로직(텍스트에서 상태를 뽑는 본체)은 T24가 이 파일에 추가하고 T26이 재사용한다
 * (AC-064④) — 이 함수는 판정기가 아니라 **불변식 가드**다.
 */
export function resolveAuthority(
  status: DecisionAuthorityStatus,
  evidence: string | null,
): AuthorityVerdict {
  return evidence === null || status === '불명'
    ? { status: '불명', evidence }
    : { status, evidence };
}
