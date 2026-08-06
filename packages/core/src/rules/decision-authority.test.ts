/**
 * `resolveAuthority` — F1-c 불변식 2·3의 유일한 통로 (AC-050①/AC-064⑤).
 * 근거: `docs/Architecture.md:394~400`(F1-c), `docs/adr/0006-contract-invariants-as-discriminated-unions.md`.
 */
import { describe, expect, it } from 'vitest';
import { resolveAuthority } from './decision-authority';

describe('resolveAuthority — F1-c 불변식 2·3의 유일한 통로 (AC-050①/AC-064⑤)', () => {
  it('근거가 있고 상태가 판정값이면 그대로 반환한다', () => {
    expect(resolveAuthority('확정', '팀장이 메시지에서 승인했다')).toEqual({
      status: '확정',
      evidence: '팀장이 메시지에서 승인했다',
    });
  });

  it('근거가 없으면 상태와 무관하게 불명으로 되돌린다 (판정을 지어내지 않는다)', () => {
    expect(resolveAuthority('확정', null)).toEqual({ status: '불명', evidence: null });
  });

  it('상태가 이미 불명이면 근거가 있어도 불명을 유지한다', () => {
    expect(resolveAuthority('불명', '근거 문장')).toEqual({
      status: '불명',
      evidence: '근거 문장',
    });
  });
});
