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

      <button type="button" onClick={onRunMediation} disabled={!canRun}>
        실행
      </button>
      {status === 'loading' && <p role="status">처리 중…</p>}
      {status === 'error' && <p role="alert">처리에 실패했습니다</p>}

      {status === 'success' && result && (
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
