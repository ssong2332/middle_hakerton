/**
 * 결정 권한 상태(Decision Authority Status)의 **단일 출처**.
 *
 * 위치 근거: `docs/Architecture.md:241` — *"enum과 판정 로직은
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
