/**
 * `ticketOptionFrom` — F1-c 불변식 1의 유일한 통로 (AC-058).
 * 근거: `docs/Architecture.md:422~430`(F1-c), `docs/adr/0006-contract-invariants-as-discriminated-unions.md`.
 */
import { describe, expect, it } from 'vitest';
import { ticketOptionFrom } from './ticket-gate';

describe('ticketOptionFrom — F1-c 불변식 1의 유일한 통로 (AC-058)', () => {
  it('signal_present면 offered:true 를 반환한다', () => {
    expect(ticketOptionFrom('signal_present')).toEqual({ offered: true, basis: 'signal_present' });
  });

  it('signal_absent면 offered:false 를 반환한다 (AC-058 ① 대조군)', () => {
    expect(ticketOptionFrom('signal_absent')).toEqual({ offered: false, basis: 'signal_absent' });
  });

  it('undetermined면 fail-closed로 offered:false 를 반환한다 (판정 실패를 제시로 착각하지 않는다)', () => {
    expect(ticketOptionFrom('undetermined')).toEqual({ offered: false, basis: 'undetermined' });
  });
});
