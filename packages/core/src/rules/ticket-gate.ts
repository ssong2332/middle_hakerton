/**
 * `TicketOption` 을 만드는 **유일한 통로** (F1-c, DECISIONS #38 · ADR-0006).
 * 위치 근거: `docs/Architecture.md:422~430`.
 *
 * `basis` 하나만 받아 `offered` 를 파생시킨다 — 짝을 손으로 조립하지 않는다.
 * 그렇게 하지 않으면 불변식 1(`offered === true` ⟺ `basis === 'signal_present'`)이
 * 주석으로만 남아 AC-058이 금지하는 "판정 실패인데 링크를 띄운다(fail-open)"가
 * 타입상 다시 가능해진다.
 */

import type { TicketOption, TicketOptionBasis } from '../contract';

export function ticketOptionFrom(basis: TicketOptionBasis): TicketOption {
  return basis === 'signal_present' ? { offered: true, basis } : { offered: false, basis };
}
