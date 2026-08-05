/**
 * T6 — C4 역번역 미리보기 UI. AC-001(원문·역번역 나란히) / AC-002(한계 문구 상시 노출) /
 * AC-046③(존댓말 혼용 경고, 없으면 아무것도 표시하지 않음).
 *
 * 🔴 `@testing-library/jest-dom`은 설치돼 있지 않다(새 의존성 추가 없음) — `toBeInTheDocument()`
 * 대신 vitest 내장 매처(`toBeTruthy`/`toBeNull`)로 존재/부재를 확인한다.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BackTranslationPreview } from './BackTranslationPreview';

describe('BackTranslationPreview', () => {
  it('AC-001 — 원문과 역번역을 나란히 표시한다', () => {
    render(
      <BackTranslationPreview
        originalText="내일까지 확인 부탁드립니다."
        backTranslation="Please confirm by tomorrow."
        warnings={[]}
        source="live"
      />,
    );

    expect(screen.getByText('내일까지 확인 부탁드립니다.')).toBeTruthy();
    expect(screen.getByText('Please confirm by tomorrow.')).toBeTruthy();
  });

  it('AC-002 — 경고 유무와 무관하게 한계 문구를 항상 표시한다', () => {
    render(
      <BackTranslationPreview
        originalText="원문"
        backTranslation="역번역"
        warnings={[]}
        source="live"
      />,
    );

    expect(
      screen.getByText('완전한 검증이 아니라 큰 오역을 걸러내는 1차 안전장치입니다.'),
    ).toBeTruthy();
  });

  it('AC-046③ — 존댓말 혼용 경고가 있으면 표시한다', () => {
    render(
      <BackTranslationPreview
        originalText="원문"
        backTranslation="역번역"
        warnings={[
          {
            type: 'honorificLevelMixed',
            message: '한 메시지 안에 존댓말 레벨(합쇼체/해요체)이 섞여 있습니다.',
            subject: null,
          },
        ]}
        source="live"
      />,
    );

    expect(
      screen.getByText('한 메시지 안에 존댓말 레벨(합쇼체/해요체)이 섞여 있습니다.'),
    ).toBeTruthy();
  });

  it('경고가 없으면 존댓말 혼용 경고 영역을 렌더하지 않는다', () => {
    render(
      <BackTranslationPreview
        originalText="원문"
        backTranslation="역번역"
        warnings={[]}
        source="live"
      />,
    );

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('honorificLevelMixed가 아닌 다른 타입의 warning은 이 컴포넌트가 표시하지 않는다(종류별로 분리해 렌더)', () => {
    render(
      <BackTranslationPreview
        originalText="원문"
        backTranslation="역번역"
        warnings={[{ type: 'emojiRisk', message: '이모지 경고', subject: '👍' }]}
        source="live"
      />,
    );

    expect(screen.queryByRole('alert')).toBeNull();
  });

  // Major 3(reviewer 5차 REJECTED → 수정) — `docs/UX.md:918` "Fallback/cached response
  // indicator": live가 아닌 응답(cache/fallback)은 항상 "폴백 응답 사용 중" 라벨을 근처에
  // 표시해야 한다. `source:'cache'`는 `apps/web/lib/llm/openai.ts:253`으로 실제 도달 가능하다.
  it('AC-041 — source가 live면 "폴백 응답 사용 중" 라벨을 표시하지 않는다', () => {
    render(
      <BackTranslationPreview
        originalText="원문"
        backTranslation="역번역"
        warnings={[]}
        source="live"
      />,
    );

    expect(screen.queryByText('폴백 응답 사용 중')).toBeNull();
  });

  it('AC-041 — source가 cache면 "폴백 응답 사용 중" 라벨을 표시한다(캐시도 live가 아니다)', () => {
    render(
      <BackTranslationPreview
        originalText="원문"
        backTranslation="역번역"
        warnings={[]}
        source="cache"
      />,
    );

    expect(screen.getByText('폴백 응답 사용 중')).toBeTruthy();
  });

  it('AC-041 — source가 fallback이면 "폴백 응답 사용 중" 라벨을 표시한다', () => {
    render(
      <BackTranslationPreview
        originalText="원문"
        backTranslation="역번역"
        warnings={[]}
        source="fallback"
      />,
    );

    expect(screen.getByText('폴백 응답 사용 중')).toBeTruthy();
  });
});
