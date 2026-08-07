'use client';

import styles from './RecipientPanel.module.css';

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
  /**
   * 🔴 T25/AC-058 — 이 결과에 대해 C6 티켓 변환 옵션이 제시되었는가(`ticketOption.offered`,
   * `docs/UX.md` UX-007 Entry). `false`면 "Convert to Task Ticket" 링크를 **완전히 렌더하지
   * 않는다** — 비활성·회색 링크 금지(AC-058②, "Absent-not-disabled controls" 패턴,
   * `PrimaryNav.tsx`의 `implemented` 필터와 같은 원칙). 기본값 `false` — 기존 호출부를 깨지 않기
   * 위한 선택적 prop이다(`isRunning`과 같은 패턴).
   */
  ticketOffered?: boolean;
  /** 🔴 링크 클릭 시 호출된다 — 원문을 세션에 저장하고 `/ticket`으로 이동하는 것은 부모
   * (`MediationWorkspace`, `apps/web/lib/ticket-draft.ts`)의 책임이다. `ticketOffered=true`일
   * 때만 실제로 렌더·호출된다. */
  onConvertToTicket?: () => void;
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
  ticketOffered = false,
  onConvertToTicket,
}: RecipientPanelProps) {
  const isDelivered = approveStatus === 'sent';
  // MJ-3(사용자 지시 유지보수 라운드) — 최종 발송문이 비어 있으면(공백만 있는 경우 포함) 승인
  // 버튼을 비활성화한다. 🔴 Minor(사용자 지시 유지보수 라운드, 코멘트 정정) — 서버
  // (`messagesRequestSchema.finalText: z.string().min(1)`, `apps/web/app/api/messages/route.ts`)의
  // `z.string().min(1)`은 `""`만 거부하고 `.trim()`을 하지 않으므로 공백뿐인 값("   ")은 서버
  // 검증을 그대로 통과한다 — "서버가 이미 빈 값을 400으로 거부한다"는 문자열 빈 값(`""`)에만
  // 참이다. 아래 `.trim()`으로 공백뿐인 값까지 클라이언트에서 먼저 막으므로(1차 방어선), 이
  // 컴포넌트가 서버보다 더 엄격한 판정을 한다 — 서버는 여전히 2차 방어선이지만 공백뿐인 값에
  // 대해서는 사실상 걸러줄 것이 없다(서버 쪽 완화는 이 태스크 범위 밖).
  const isFinalTextEmpty = finalText.trim() === '';

  return (
    <section aria-label="수신자 패널">
      <div className={styles.header}>
        <h2 className={styles.title}>수신자에게 보이는 메시지</h2>
      </div>
      {!hasResult && (
        <p className={styles.emptyState}>
          메시지를 실행하면 여기에서 상대방이 받을 내용을 확인할 수 있습니다.
        </p>
      )}
      {hasResult && (
        <>
          <div className={styles.fieldGroup}>
            <label htmlFor="final-text">최종 발송문</label>
            <textarea
              id="final-text"
              value={finalText}
              disabled={isDelivered}
              onChange={(event) => onFinalTextChange(event.target.value)}
            />
          </div>
          {/* T25/AC-058① — UX-007로의 유일한 진입 경로(`docs/UX.md` UX-007 Entry, UX-004 Steps
              7). `ticketOffered`가 false면 이 블록 자체가 렌더되지 않는다(위 AC-058②). */}
          {!isDelivered && ticketOffered && (
            <button
              type="button"
              className={styles.ticketLink}
              onClick={() => onConvertToTicket?.()}
            >
              Convert to Task Ticket
            </button>
          )}
          {approveStatus === 'error' && (
            <p role="alert" className={styles.errorText}>
              승인 처리에 실패했습니다. 다시 시도해 주세요.
            </p>
          )}
          {/* 🔴 Critical(reviewer REJECTED → 수정) — 원문/수신자/긴급도 override가 승인 대상
              스냅샷과 달라지면(재실행 없이 편집됨) 아직 검토되지 않은 값이므로 승인을 막는다.
              M1(reviewer 최종 APPROVED → 수정) — 긴급도 override도 같은 사유이므로 문구도
              세 사유를 모두 포함하도록 일반화한다(원인을 텍스트/수신자로만 한정하지 않는다). */}
          {!isDelivered && isStale && (
            <p role="status" className={styles.statusText}>
              메시지, 수신자 또는 긴급도가 변경되었습니다 — 다시 실행한 뒤 승인할 수 있습니다.
            </p>
          )}
          {/* Minor(사용자 지시 유지보수 라운드) — MJ-3은 버튼만 비활성화하고 인라인 사유가 없어
              "죽은 버튼"처럼 보였다. `isStale`과 같은 패턴(role="status")으로 이유를 알려준다.
              isStale과 동시에 뜰 수 있으므로 서로 다른 문구로 별도 렌더한다. */}
          {!isDelivered && !isStale && isFinalTextEmpty && (
            <p role="status" className={styles.statusText}>
              최종 발송문을 입력해야 승인할 수 있습니다.
            </p>
          )}
          {isDelivered ? (
            <p role="status" className={styles.delivered}>
              발송됨 — {sentAt}
            </p>
          ) : (
            <button
              type="button"
              className={styles.approveButton}
              onClick={onApprove}
              disabled={approveStatus === 'sending' || isStale || isRunning || isFinalTextEmpty}
            >
              승인 & 전송
            </button>
          )}
          {approveStatus === 'sending' && (
            <p role="status" className={styles.statusText}>
              전송 중…
            </p>
          )}
        </>
      )}
    </section>
  );
}
