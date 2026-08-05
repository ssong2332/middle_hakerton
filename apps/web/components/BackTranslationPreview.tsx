'use client';

import type { ResponseSource, Warning } from '@cross-border/core';
import { NON_LIVE_NOTICE } from '../lib/non-live-notice';

export interface BackTranslationPreviewProps {
  originalText: string;
  backTranslation: string;
  warnings: Warning[];
  /**
   * 🔴 Major 3(reviewer 5차 REJECTED → 수정) — `docs/UX.md:920`(Minor, 사용자 지시 유지보수
   * 라운드로 :918에서 정정 — 문구 실제 위치가 옮겨졌다) "Fallback/cached response
   * indicator": live가 아닌 응답(cache/fallback)에는 항상 "폴백 응답 사용 중" 라벨이 근처에
   * 있어야 한다("a pre-scripted/cached response *instead of a live LLM result*" — cache도
   * live가 아니므로 대상이다). `source:'cache'`는 `apps/web/lib/llm/openai.ts:253`으로 실제
   * 도달 가능한 값이다.
   *
   * 🔴 (2026-08-05 갱신 — F1-e, DECISIONS #48 · ADR-0009 D3) 호출부(`SenderPanel.tsx`)는 이제
   * `MediationResult.source`(세 스텝 합산값)가 아니라 **`MediationResult.stepSources.c4`**를
   * 넘긴다 — 이 컴포넌트가 보여주는 `backTranslation`은 C4 산출물이므로 "이 영역의 진실"은
   * C4의 출처뿐이다(ADR-0009 D3 매핑표 "c4 → backTranslation"). 이 컴포넌트 자체의 prop 이름·
   * 렌더 로직은 바뀌지 않는다 — 무엇을 넘기는지만 바뀐다.
   */
  source: ResponseSource;
}

/** AC-002 — 상시 노출되는 한계 문구. 조건부 렌더 금지("완전한 검증"으로 오해될 수 있어서다). */
const LIMITATION_NOTICE = '완전한 검증이 아니라 큰 오역을 걸러내는 1차 안전장치입니다.';

/**
 * C4 역번역 미리보기(`docs/UX.md` UX-004에 흡수, AC-001/AC-002/AC-041/AC-046③).
 * 원문·역번역을 나란히 표시하고, 한계 문구를 상시 노출하며, 존댓말 혼용 경고가 있을 때만
 * 보여준다(없으면 아무것도 표시하지 않는다). `source`가 `'live'`가 아니면(cache/fallback)
 * "폴백 응답 사용 중" 라벨을 함께 표시한다(AC-041).
 *
 * 🔴 `warnings[]`는 이모지 위험(R1)·호칭 미등록 경고도 함께 실어 나른다(`WarningType` 참조) —
 * `docs/UX.md` UX-004 States "Warning" 절의 "종류별로 분리해 렌더"를 따라 이 컴포넌트는
 * `honorificLevelMixed` 타입만 다룬다. 나머지 타입의 표시는 다른 컴포넌트(별도 태스크)의 몫이다.
 */
export function BackTranslationPreview({
  originalText,
  backTranslation,
  warnings,
  source,
}: BackTranslationPreviewProps) {
  const honorificWarning = warnings.find((warning) => warning.type === 'honorificLevelMixed');

  return (
    <section aria-label="역번역 미리보기">
      <div>
        <h3>원문</h3>
        <p>{originalText}</p>
      </div>
      <div>
        <h3>역번역</h3>
        <p>{backTranslation}</p>
      </div>
      {source !== 'live' && <p role="status">{NON_LIVE_NOTICE}</p>}
      <p role="note">{LIMITATION_NOTICE}</p>
      {honorificWarning ? <p role="alert">{honorificWarning.message}</p> : null}
    </section>
  );
}
