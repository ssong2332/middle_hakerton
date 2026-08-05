'use client';

export interface RecipientPanelProps {
  /**
   * 승인 대상 스냅샷이 있는가 — 없으면 승인할 대상 자체가 없다(Empty 상태). 🔴 Major 1
   * (reviewer REJECTED → 수정) — `status==='success'`가 아니라 스냅샷 존재 여부로 판정해야
   * 한다. 재실행이 실패해도 직전 성공 스냅샷이 남아 있으면 이 값은 계속 `true`여야 한다
   * (`docs/UX.md` UX-004 Failure).
   */
  hasResult: boolean;
  /**
   * 🔴 Critical(reviewer REJECTED → 수정) — 라이브 원문/수신자/긴급도 override가 승인 대상
   * 스냅샷과 달라졌다는 뜻(재실행 없이 편집됨, 아직 검토되지 않음). `true`면 승인 버튼을
   * 비활성화한다(`docs/UX.md` UX-004 Validation "for the current text"). M1(reviewer 최종
   * APPROVED → 수정) — 긴급도 override도 text/recipient와 동일한 규칙으로 이 판정에 포함된다.
   */
  isStale: boolean;
  /**
   * 🔴 M2(reviewer 최종 APPROVED, Major 비차단 → 수정) — 재실행이 진행 중(`status==='loading'`)
   * 이면 `true`. 직전 성공 스냅샷이 있어도 재실행이 끝나면 그 스냅샷이 새 결과로 교체되므로,
   * 진행 중인 동안 승인이 성공하면 "발송됨" 표시와 함께 실제로 전송되지 않은 값이 남는
   * 불일치가 생긴다 — 그래서 승인을 막는다(`docs/UX.md` UX-004 Validation "disabled during
   * Loading/Error"). 기본값 `false` — 기존 호출부를 깨지 않기 위한 선택적 prop이다.
   */
  isRunning?: boolean;
  /** 상대방이 받을 최종 발송문 초안(중재 결과로 채워지고, 승인 전 편집 가능). */
  finalText: string;
  onFinalTextChange: (value: string) => void;
  /** 🔴 명시적 클릭에서만 호출된다 — 이 콜백을 부모가 자동으로 부르지 않는 것이 AC-010의 전제다. */
  onApprove: () => void;
  approveStatus: 'idle' | 'sending' | 'sent' | 'error';
  /** 승인 성공 후 서버가 반환한 발송 시각(`POST /api/messages` 응답의 `sentAt`). */
  sentAt: string | null;
}

/**
 * T13/T14 — UX-004 수신자 패널(AC-009 2패널 중 우측) + 승인 후 전송(AC-010).
 *
 * States(`docs/UX.md` UX-004):
 * - Empty: 아직 실행 결과가 없다 — 안내 문구만, 승인 버튼 없음.
 * - ReadyToApprove: 결과가 있고 아직 발송 전 — 편집 가능한 최종문 + 승인 버튼.
 * - Delivered: 승인 성공 — 타임스탬프 로그 + 그 메시지의 입력 잠금(`docs/UX.md` UX-004 States
 *   "Delivered: Recipient panel switches to a timestamped log entry, inputs lock").
 * - Error: 승인 요청 실패 — 오류 배너, 재시도 가능(버튼 다시 활성화).
 *
 * 🔴 승인 버튼은 클릭 즉시 자기 자신을 비활성화한다(`docs/UX.md` Interaction Patterns
 * "Duplicate/double-click submission") — `approveStatus==='sending'`이면 disabled.
 */
export function RecipientPanel({
  hasResult,
  isStale,
  isRunning = false,
  finalText,
  onFinalTextChange,
  onApprove,
  approveStatus,
  sentAt,
}: RecipientPanelProps) {
  const isDelivered = approveStatus === 'sent';
  // MJ-3(사용자 지시 유지보수 라운드) — 최종 발송문이 비어 있으면(공백만 있는 경우 포함) 승인
  // 버튼을 비활성화한다. 서버(`messagesRequestSchema.finalText: z.string().min(1)`,
  // `apps/web/app/api/messages/route.ts`)가 이미 빈 값을 400으로 거부하지만, 그때까지는 클라이언트가
  // 막지 않아 사용자가 실패 응답을 받고서야 알게 됐다 — 여기서 먼저 막는다(2차 방어선은 서버).
  const isFinalTextEmpty = finalText.trim() === '';

  return (
    <section aria-label="수신자 패널">
      <h2>수신자가 받을 내용</h2>
      {!hasResult && <p>메시지를 실행하면 여기에서 상대방이 받을 내용을 확인할 수 있습니다.</p>}
      {hasResult && (
        <>
          <label htmlFor="final-text">최종 발송문</label>
          <textarea
            id="final-text"
            value={finalText}
            disabled={isDelivered}
            onChange={(event) => onFinalTextChange(event.target.value)}
          />
          {approveStatus === 'error' && (
            <p role="alert">승인 처리에 실패했습니다. 다시 시도해 주세요.</p>
          )}
          {/* 🔴 Critical(reviewer REJECTED → 수정) — 원문/수신자/긴급도 override가 승인 대상
              스냅샷과 달라지면(재실행 없이 편집됨) 아직 검토되지 않은 값이므로 승인을 막는다.
              M1(reviewer 최종 APPROVED → 수정) — 긴급도 override도 같은 사유이므로 문구도
              세 사유를 모두 포함하도록 일반화한다(원인을 텍스트/수신자로만 한정하지 않는다). */}
          {!isDelivered && isStale && (
            <p role="status">
              메시지, 수신자 또는 긴급도가 변경되었습니다 — 다시 실행한 뒤 승인할 수 있습니다.
            </p>
          )}
          {isDelivered ? (
            <p role="status">발송됨 — {sentAt}</p>
          ) : (
            <button
              type="button"
              onClick={onApprove}
              disabled={approveStatus === 'sending' || isStale || isRunning || isFinalTextEmpty}
            >
              승인 & 전송
            </button>
          )}
          {approveStatus === 'sending' && <p role="status">전송 중…</p>}
        </>
      )}
    </section>
  );
}
