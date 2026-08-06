/**
 * CRITICAL 즉시 발송 경로 판정 — AC-005("CRITICAL은 예약·지연 경로를 거치지 않고 즉시 발송
 * 경로로 진행된다") · AC-004("override한 값이 이후 처리에 반영된다")의 결합 지점.
 * `urgency-routing.ts` 헤더 주석 참조 — 여기서 검증하는 것은 순수 판정 로직뿐이며, 이 판정을
 * 소비해 실제로 예약·지연 단계를 건너뛰는 코드는 아직 이 저장소에 없다(T30 계열 후속).
 */
import { describe, expect, it } from 'vitest';
import { resolveDeliveryPath, resolveEffectiveUrgency } from './urgency-routing';

describe('resolveEffectiveUrgency', () => {
  it('override가 없으면(null) C1 판정을 그대로 쓴다(AC-003)', () => {
    expect(resolveEffectiveUrgency('NORMAL', null)).toBe('NORMAL');
  });

  it('override가 있으면 C1 판정 대신 override 값을 쓴다(AC-004)', () => {
    expect(resolveEffectiveUrgency('NORMAL', 'CRITICAL')).toBe('CRITICAL');
  });

  it('override가 C1 판정과 같은 값이어도 그 값을 그대로 쓴다', () => {
    expect(resolveEffectiveUrgency('LOW', 'LOW')).toBe('LOW');
  });
});

describe('resolveDeliveryPath', () => {
  it('CRITICAL이면 즉시 발송 경로를 반환한다(AC-005)', () => {
    expect(resolveDeliveryPath('CRITICAL')).toBe('immediate');
  });

  it('NORMAL이면 표준 경로를 반환한다', () => {
    expect(resolveDeliveryPath('NORMAL')).toBe('standard');
  });

  it('LOW이면 표준 경로를 반환한다', () => {
    expect(resolveDeliveryPath('LOW')).toBe('standard');
  });

  it('override로 CRITICAL이 된 등급도 즉시 발송 경로로 판정된다(AC-004+AC-005 결합)', () => {
    const effective = resolveEffectiveUrgency('NORMAL', 'CRITICAL');
    expect(resolveDeliveryPath(effective)).toBe('immediate');
  });
});
