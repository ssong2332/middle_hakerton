'use client';

import type { MediationResult, UrgencyLevel } from '@cross-border/core';
import { isValidEmailFormat } from '../lib/validate-email';
import { BackTranslationPreview } from './BackTranslationPreview';
import { ComparisonView } from './ComparisonView';
import { MisreadRiskPanel } from './MisreadRiskPanel';
import { UrgencyPanel } from './UrgencyPanel';

export interface SenderPanelProps {
  text: string;
  onTextChange: (value: string) => void;
  recipient: string;
  onRecipientChange: (value: string) => void;
  status: 'idle' | 'loading' | 'error' | 'success';
  result: MediationResult | null;
  urgencyOverride: UrgencyLevel | null;
  onOverride: (value: UrgencyLevel) => void;
  isOverridden: boolean;
  displayedUrgency: UrgencyLevel | null;
  /** 🔴 부모(`MediationWorkspace`)가 실제 `/api/mediate` 호출을 담당한다 — 이 컴포넌트는 클릭만 알린다. */
  onRunMediation: () => void;
  /**
   * 🔴 M-2(2026-08-05, reviewer REJECTED → 수정) — 승인 가능한 스냅샷(`approvalSnapshot`)이
   * 있는지. 결과 블록(등급/비교/오해 위험/역번역, 특히 폴백 배지)의 표시 여부를 `status==='success'`
   * 단독으로 판정하면, 재실행이 실패했을 때(`status==='error'`) 직전 성공 결과가 남아 있어도
   * 블록 전체가 사라진다 — `RecipientPanel`은 이미 `hasResult`(스냅샷 존재)로 승인 가능 여부를
   * 판정하므로, 그 사이에 "폴백 응답 사용 중" 라벨만 사라진 채로 승인 가능한 상태가 될 수 있었다
   * (AC-041 위반). `MediationWorkspace`의 `hasResult`(=`approvalSnapshot !== null`)를 그대로 받는다.
   */
  hasResult: boolean;
}

/**
 * T13 — UX-004 발신자 패널(AC-009 2패널 중 좌측). 메시지 작성 + 실행 + 결과(등급/비교/오해
 * 위험/역번역)를 담는다.
 *
 * Validation(`docs/UX.md` UX-004): 수신자 식별자 필수(이메일 형식), 메시지 텍스트 필수. 형식
 * 오류는 필드 아래 인라인 표시, 값이 유효해지면 사라진다. "실행"은 둘 다 유효할 때만 활성화된다.
 */
export function SenderPanel({
  text,
  onTextChange,
  recipient,
  onRecipientChange,
  status,
  result,
  onOverride,
  isOverridden,
  displayedUrgency,
  onRunMediation,
  hasResult,
}: SenderPanelProps) {
  const trimmedRecipient = recipient.trim();
  const recipientFormatInvalid = trimmedRecipient !== '' && !isValidEmailFormat(trimmedRecipient);
  const canRun =
    text.trim() !== '' &&
    trimmedRecipient !== '' &&
    !recipientFormatInvalid &&
    status !== 'loading';

  return (
    <section aria-label="발신자 패널">
      <h2>메시지 작성</h2>
      <label htmlFor="sender-recipient">받는 사람</label>
      <input
        id="sender-recipient"
        type="text"
        value={recipient}
        onChange={(event) => onRecipientChange(event.target.value)}
      />
      {recipientFormatInvalid && <p>받는 사람은 이메일 형식이어야 합니다.</p>}

      <label htmlFor="sender-text">메시지</label>
      <textarea
        id="sender-text"
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
      />

      {/* T16(AC-029, docs/UX.md:1015) — 실패 상태에서는 같은 버튼이 "다시 시도"로 바뀐다. 별도
          버튼을 추가하지 않는 이유: 핸들러(onRunMediation)가 동일하고("재시도 = 재실행"), 버튼을
          하나 더 두면 실패 상태에서 "실행"과 "다시 시도" 두 개가 동시에 보여 혼란을 준다. */}
      <button type="button" onClick={onRunMediation} disabled={!canRun}>
        {status === 'error' ? '다시 시도' : '실행'}
      </button>
      {/* T16(AC-029, docs/UX.md:1013) — 단계 라벨 진행 표시. `docs/UX.md`의 예시 문구를 그대로
          쓰는 정적 텍스트다(타이머로 단계를 전환하지 않는다) — 판단 근거는
          `MediationWorkspace.tsx` 헤더 주석 "T16 — 진행 표시 방식" 참조. */}
      {status === 'loading' && <p role="status">분류 중 → 변환 중 → 역번역 중</p>}
      {status === 'error' && <p role="alert">처리에 실패했습니다</p>}

      {/* M-2 — `status === 'success'` 단독이 아니라 `hasResult`(승인 가능한 스냅샷 존재)도
          함께 본다. 재실행이 실패해도(status==='error') 직전 성공 결과와 그 폴백 배지가
          유지되어야 RecipientPanel의 승인 가능 상태와 일치한다. */}
      {(status === 'success' || hasResult) && result && (
        <>
          {displayedUrgency && (
            <UrgencyPanel
              urgency={displayedUrgency}
              urgencyReason={result.urgencyReason}
              isOverridden={isOverridden}
              onOverride={onOverride}
            />
          )}
          {/* AC-008 — 원문/변환문/변환 이유 3열 비교 + AC-007 보존 항목 표시. */}
          <ComparisonView
            originalText={text}
            transformed={result.transformed}
            reason={result.reason}
            preserved={result.preserved}
          />
          {/* AC-043 — 오해 사전 경고. 승인(Approve & Send, RecipientPanel) 이전 단계인 이 화면에서
              항상 먼저 렌더된다. 빈 배열이면 컴포넌트 자체가 아무것도 그리지 않는다.
              🔴 `variant="full"` 고정 — `docs/UX.md` UX-004 States "MisreadRisk"는 Full/Reduced 중
              어느 쪽이 live인지를 "구현/일정 판단이며 사용자별 설정이 아니다"로 명시한다(Planning
              Decision #57). 지금 이 태스크 범위(T12/T13/T14)에는 일정 압박으로 축소해야 한다는
              신호가 없으므로 정보량이 더 많은 Full을 기본으로 택했다 — Reduced로 바꾸는 것은
              `MisreadRiskPanel`의 `variant` prop 하나만 바꾸면 되고, 데이터 생성(T10)에는 영향이
              없다(같은 패턴이 이미 존재 — "표시만 축소되고 데이터는 항상 동일"). */}
          <MisreadRiskPanel risks={result.misreadRisks} variant="full" />
          <BackTranslationPreview
            originalText={text}
            backTranslation={result.backTranslation}
            warnings={result.warnings}
            source={result.source}
          />
          {result.personalizationApplied === false && (
            <p role="status">개인화 미적용 — 기본 변환만 적용되었습니다</p>
          )}
        </>
      )}
    </section>
  );
}
