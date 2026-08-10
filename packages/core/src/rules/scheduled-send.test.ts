// `scheduled-send.ts` 회귀 검증 — AC-024. `docs/Tasks.md` T32.
// "수신자 로컬 아침" 정의(고정 09:00, 새벽=21:00~07:00)는 2026-08-10 사용자 결정.
import { describe, expect, it } from 'vitest';
import { suggestScheduledSend } from './scheduled-send';

describe('suggestScheduledSend — AC-024', () => {
  it('낮 시간(새벽 아님)이면 추천하지 않는다', () => {
    // 2026-03-16 10:00 서울 = UTC 01:00
    const result = suggestScheduledSend('Asia/Seoul', new Date('2026-03-16T01:00:00Z'));
    expect(result.recommended).toBe(false);
    expect(result.suggestedUtc).toBeNull();
  });

  it('밤 새벽(21:00 이후)이면 다음날 09:00을 추천한다', () => {
    // 2026-03-16 22:00 서울 = UTC 13:00
    const result = suggestScheduledSend('Asia/Seoul', new Date('2026-03-16T13:00:00Z'));
    expect(result.recommended).toBe(true);
    expect(result.suggestedUtc).toBe('2026-03-17T00:00:00.000Z');
  });

  it('새벽(07:00 이전)이면 같은 날 09:00을 추천한다', () => {
    // 2026-03-16 03:00 서울 = UTC(전날) 18:00
    const result = suggestScheduledSend('Asia/Seoul', new Date('2026-03-15T18:00:00Z'));
    expect(result.recommended).toBe(true);
    expect(result.suggestedUtc).toBe('2026-03-16T00:00:00.000Z');
  });

  it('경계값 21:00 정각은 새벽으로 취급한다', () => {
    // 2026-03-16 21:00 서울 = UTC 12:00
    const result = suggestScheduledSend('Asia/Seoul', new Date('2026-03-16T12:00:00Z'));
    expect(result.recommended).toBe(true);
  });

  it('경계값 07:00 정각은 새벽이 아니다(근무 시작 시각)', () => {
    // 2026-03-16 07:00 서울 = UTC(전날) 22:00
    const result = suggestScheduledSend('Asia/Seoul', new Date('2026-03-15T22:00:00Z'));
    expect(result.recommended).toBe(false);
  });

  it('경계값 06:59는 새벽이다', () => {
    // 2026-03-16 06:59 서울 = UTC(전날) 21:59
    const result = suggestScheduledSend('Asia/Seoul', new Date('2026-03-15T21:59:00Z'));
    expect(result.recommended).toBe(true);
  });

  it('경계값 20:59는 새벽이 아니다', () => {
    // 2026-03-16 20:59 서울 = UTC 11:59
    const result = suggestScheduledSend('Asia/Seoul', new Date('2026-03-16T11:59:00Z'));
    expect(result.recommended).toBe(false);
  });

  it('recipientLocalNow는 참고용으로 수신자 현지 시각을 담는다', () => {
    const result = suggestScheduledSend('Asia/Seoul', new Date('2026-03-16T01:00:00Z'));
    expect(result.recipientLocalNow).toBe('2026-03-16 10:00');
  });
});
