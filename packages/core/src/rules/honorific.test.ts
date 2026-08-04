/**
 * AC-046③ — EN→KO 변환문의 종결어미 레벨(합쇼체/해요체) 혼용 감지.
 * 🔴 규칙 기반(표층 문자열 매칭)이며 형태소 분석기를 쓰지 않는다 — 스팟체크 결과는 T5
 * 구현 보고서에 남긴다(오탐/누락 가능성 존재를 알고 쓴다).
 */
import { describe, expect, it } from 'vitest';
import { detectHonorificMixing, honorificMixedWarning } from './honorific';

describe('detectHonorificMixing', () => {
  it('합쇼체와 해요체가 한 메시지에 섞이면 true (AC-046①)', () => {
    expect(detectHonorificMixing('확인 부탁드립니다. 편하실 때 연락 주세요.')).toBe(true);
  });

  it('전부 해요체면 false', () => {
    expect(detectHonorificMixing('내일 회의가 있어요. 자료 준비해 주세요.')).toBe(false);
  });

  it('전부 합쇼체면 false', () => {
    expect(detectHonorificMixing('내일 회의가 있습니다. 자료를 준비해 주십시오.')).toBe(false);
  });

  it('문장이 하나뿐이면 어느 레벨이든 혼용일 수 없다', () => {
    expect(detectHonorificMixing('확인 부탁드립니다.')).toBe(false);
    expect(detectHonorificMixing('확인해 주세요.')).toBe(false);
  });

  it('분류되지 않는 문장(명사구 등)은 판정에서 제외한다 — 판정 불가를 혼용으로 오판하지 않는다', () => {
    expect(detectHonorificMixing('회의 안건: 예산 검토')).toBe(false);
  });

  it('빈 문자열은 혼용이 아니다', () => {
    expect(detectHonorificMixing('')).toBe(false);
  });

  it('다문장 판정불가 — 첫 문장은 판정되고 두 번째 문장이 판정 불가(명사구)이면 혼용이 아니다(reviewer 뮤턴트 kill: 판정 불가를 임의 레벨로 대체하면 이 케이스가 true로 잘못 뒤집힌다)', () => {
    expect(detectHonorificMixing('확인 부탁드립니다. 회의 안건: 예산 검토')).toBe(false);
  });

  it('스팟체크 케이스 — 마침표 뒤 공백이 없어도 문장을 나눠 혼용을 검출한다', () => {
    expect(detectHonorificMixing('확인 부탁드립니다.편하실 때 연락 주세요.')).toBe(true);
  });

  it('스팟체크 케이스 — 종결어미와 마침표 사이의 괄호 부기("(v2)")를 허용하고 혼용을 검출한다', () => {
    expect(detectHonorificMixing('자료를 첨부했습니다(v2). 확인해 주세요.')).toBe(true);
  });

  // 🔴 reviewer 5차 Critical — 합쇼체 종결어미(니다/니까/십시오) 뒤 공백 기준 분리를 채택해
  // 케이스 1·4를 고쳤다(구두점이 아예 없거나, 구두점 없는 절 경계를 이모지가 대신하는 경우).
  it('스팟체크 케이스 1 — 구두점이 전혀 없어도 합쇼체 종결어미 뒤에서 나뉘어 혼용을 검출한다', () => {
    expect(detectHonorificMixing('확인 부탁드립니다 편하실 때 연락 주세요')).toBe(true);
  });

  it('스팟체크 케이스 4 — 이모지가 절 경계에 있어도(구두점 없음) 합쇼체 종결어미 뒤에서 나뉜다', () => {
    expect(detectHonorificMixing('확인 부탁드립니다 🙏 연락 주세요.')).toBe(true);
  });

  // 🔴 QA 6차 Critical(수정) — 이전 주석은 "합쇼체 경계 분리가 요/죠 신호를 건드리지 않으므로
  // 케이스 5의 오탐 표면을 넓히지 않는다"고 단정했으나, QA가 4개 반례(케이스 7~10, 아래)로
  // 실측 반증했다. 이 케이스 5 테스트는 "동일하다"는 주장이 아니라 known gap의 현재 실측값을
  // 고정하는 회귀 테스트일 뿐이다.
  it('케이스 5(known gap, 보정하지 않음) — 명사 "필요"가 "-요"로 끝나는 오탐', () => {
    expect(detectHonorificMixing('추가 검토가 필요. 내일까지 회신 부탁드립니다.')).toBe(true);
  });

  // 🔴 QA 6차 Critical(수정) — 케이스 1·4를 고친 합쇼체 경계 분리 자체가 새로 만든 오탐 계열
  // (`honorific.ts` 파일 헤더 주석 케이스 7~10 참조). 사용자 승인에 따라 코드는 고치지 않고
  // known gap으로 값만 고정한다(레드→그린이 아니라, 변경하지 않은 기존 동작을 있는 그대로
  // 기록하는 특성화 테스트다).
  it('케이스 7(known gap, 보정하지 않음) — 합쇼체 경계 분리 후 뒤 조각이 "필요"로 끝나는 오탐', () => {
    expect(detectHonorificMixing('확인 부탁드립니다 추가 검토가 필요')).toBe(true);
  });

  it('케이스 8(known gap, 보정하지 않음) — 합쇼체 경계 분리 후 뒤 조각이 "중요"로 끝나는 오탐', () => {
    expect(detectHonorificMixing('확인 부탁드립니다 이건 아주 중요')).toBe(true);
  });

  it('케이스 9(known gap, 보정하지 않음) — 합쇼체 경계 분리 후 뒤 조각이 "중요"로 끝나는 오탐(2)', () => {
    expect(detectHonorificMixing('자료 첨부했습니다 회신은 내일까지가 중요')).toBe(true);
  });

  it('케이스 10(known gap, 보정하지 않음) — 합쇼체 경계 분리 후 뒤 조각이 "주요"로 끝나는 오탐', () => {
    expect(detectHonorificMixing('보고드립니다 이번 건은 주요')).toBe(true);
  });

  // 합쇼체 종결어미 뒤에 공백 없이 곧장 다른 형태소("만" 등)가 이어지면 문장이 실제로 끝난 게
  // 아니므로, 새 분리 규칙("니다/니까/십시오" 뒤 공백)이 "니다만"의 "니다"에서 잘못 끼어들면
  // 안 된다("니다" 바로 다음 글자가 공백이 아니라 "만"이라 매치되지 않는다) — 전부 합쇼체인
  // 문장이 이 규칙 때문에 잘못 쪼개져 다른 레벨을 만들어내지 않는지 회귀 방지.
  it('"습니다만"처럼 합쇼체 종결어미 뒤에 조사가 곧장 이어지면 그 자리에서 나누지 않는다(전부 합쇼체 유지)', () => {
    expect(detectHonorificMixing('결정했습니다만 확정 통보는 별도로 드리겠습니다.')).toBe(false);
  });
});

describe('honorificMixedWarning', () => {
  it('혼용이 감지되면 honorificLevelMixed 타입 경고를 반환한다(AC-046③)', () => {
    const warning = honorificMixedWarning('확인 부탁드립니다. 편하실 때 연락 주세요.');
    expect(warning).not.toBeNull();
    expect(warning?.type).toBe('honorificLevelMixed');
    expect(warning?.message.length).toBeGreaterThan(0);
  });

  it('혼용이 없으면 null을 반환한다 — 경고가 없으면 아무것도 표시하지 않는다', () => {
    expect(honorificMixedWarning('내일 회의가 있어요. 자료 준비해 주세요.')).toBeNull();
  });

  it('경고 문구에 국가·국민성 서술을 넣지 않는다(Conventions 7)', () => {
    const warning = honorificMixedWarning('확인 부탁드립니다. 편하실 때 연락 주세요.');
    expect(warning?.message).not.toMatch(/한국|korea|korean|국민성/i);
  });
});
