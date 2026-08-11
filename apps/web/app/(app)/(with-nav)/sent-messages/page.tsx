'use client';

/**
 * UX-015 Sent Messages & Reminder Approval Screen — `docs/UX.md:721-750`. AC-044(전체),
 * AC-063(공휴일 데이터 없는 국가 무표기). `docs/Tasks.md` T52.
 *
 * States(UX-015 States 그대로): Loading(skeleton) / Empty("발송한 메시지가 없습니다") /
 * Error(재시도) / Row-BelowThreshold(경과일만 표시, 리마인드 액션 없음) /
 * Row-ThresholdReached(`businessDaysElapsed >= 2`이고 미마킹이면 "무응답 N일째" 배지 +
 * "리마인드 검토") / ReminderReview(C2 초안 표시·편집·Approve & Send) /
 * ReminderSent(타임스탬프 로그) / Replied-Marked(정적 "답장 받음", 리마인드 액션 영구 숨김).
 *
 * 🔴 Validation(UX-015) — "답장 받음"은 되돌리기 없음(단방향). "Approve & Send"는 초안이 성공
 * 로드된 뒤에만 활성화되고 클릭 즉시 비활성화된다(중복 발송 방지).
 *
 * 🔴 Business Rules(UX-015 Architect Handoff) — "이 화면은 문구 생성 로직을 구현하지 않는다,
 * 표시·편집·승인만 한다"·"설정/임계값 컨트롤을 노출하지 않는다"(둘 다 백엔드 T51/T53에 이미
 * 있는 규칙, 이 화면이 다시 만들지 않는다).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './sent-messages.module.css';

const LOAD_FAILED_MESSAGE = '불러오지 못했습니다, 다시 시도해주세요';
const EMPTY_MESSAGE = '발송한 메시지가 없습니다';
const MARK_REPLIED_FAILED_MESSAGE = '저장하지 못했습니다, 다시 시도해주세요';
const REMINDER_DRAFT_FAILED_MESSAGE = '리마인드 문구 생성 실패';
const REMINDER_SEND_FAILED_MESSAGE = '발송하지 못했습니다, 다시 시도해주세요';

interface MessageListItem {
  id: string;
  recipient: string;
  recipientCountry: string | null;
  finalText: string;
  urgency: string;
  sentAt: string;
  replied: boolean;
  repliedMarkedAt: string | null;
  businessDaysElapsed: number | null;
  reminderSuggested: boolean;
  isReminder: boolean;
  mediationApplied: boolean;
}

type ReminderRowState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'review'; draftText: string }
  | { status: 'sending'; draftText: string }
  | { status: 'sent'; sentAt: string };

async function extractErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

export default function SentMessagesPage() {
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [items, setItems] = useState<MessageListItem[]>([]);
  const [markErrors, setMarkErrors] = useState<Record<string, string>>({});
  const [marking, setMarking] = useState<Record<string, boolean>>({});
  const [reminderState, setReminderState] = useState<Record<string, ReminderRowState>>({});
  const reviewRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const fetchItems = useCallback(async () => {
    try {
      const response = await fetch('/api/messages');
      if (!response.ok) {
        setStatus('error');
        return;
      }
      const body = (await response.json()) as { items: MessageListItem[] };
      setItems(body.items);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  // fetch-on-mount — `terminology/page.tsx`(T23)와 같은 이유로 이 한 줄만 억제한다.
  /* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount, terminology/page.tsx와 같은 근거 */
  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function retry() {
    setStatus('loading');
    void fetchItems();
  }

  async function markReplied(id: string) {
    setMarking((previous) => ({ ...previous, [id]: true }));
    setMarkErrors((previous) => ({ ...previous, [id]: '' }));
    try {
      const response = await fetch(`/api/messages/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ replied: true }),
      });
      if (!response.ok) {
        const message = await extractErrorMessage(response, MARK_REPLIED_FAILED_MESSAGE);
        setMarkErrors((previous) => ({ ...previous, [id]: message }));
        return;
      }
      const updated = (await response.json()) as { replied: boolean; repliedMarkedAt: string | null };
      setItems((previous) =>
        previous.map((item) =>
          item.id === id
            ? {
                ...item,
                replied: updated.replied,
                repliedMarkedAt: updated.repliedMarkedAt,
                businessDaysElapsed: null,
                reminderSuggested: false,
              }
            : item,
        ),
      );
    } catch {
      setMarkErrors((previous) => ({ ...previous, [id]: MARK_REPLIED_FAILED_MESSAGE }));
    } finally {
      setMarking((previous) => ({ ...previous, [id]: false }));
    }
  }

  async function reviewReminder(id: string) {
    setReminderState((previous) => ({ ...previous, [id]: { status: 'loading' } }));
    try {
      const response = await fetch(`/api/messages/${id}/reminder`, { method: 'POST' });
      if (!response.ok) {
        setReminderState((previous) => ({ ...previous, [id]: { status: 'error' } }));
        return;
      }
      const body = (await response.json()) as { draftText: string };
      setReminderState((previous) => ({
        ...previous,
        [id]: { status: 'review', draftText: body.draftText },
      }));
      // 리뷰 영역이 렌더된 뒤 포커스를 옮긴다(키보드 접근성 — UX-015 Accessibility).
      requestAnimationFrame(() => reviewRefs.current[id]?.focus());
    } catch {
      setReminderState((previous) => ({ ...previous, [id]: { status: 'error' } }));
    }
  }

  function editDraft(id: string, text: string) {
    setReminderState((previous) => {
      const current = previous[id];
      if (!current || (current.status !== 'review' && current.status !== 'sending')) return previous;
      return { ...previous, [id]: { status: 'review', draftText: text } };
    });
  }

  function dismissReview(id: string) {
    setReminderState((previous) => ({ ...previous, [id]: { status: 'idle' } }));
  }

  async function approveAndSend(item: MessageListItem) {
    const current = reminderState[item.id];
    if (!current || current.status !== 'review') return;
    const draftText = current.draftText;
    setReminderState((previous) => ({ ...previous, [item.id]: { status: 'sending', draftText } }));
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          originalText: draftText,
          finalText: draftText,
          aiSuggestedText: draftText,
          urgency: item.urgency,
          recipient: item.recipient,
          recipientCountry: item.recipientCountry,
          channel: 'web_mock',
          mediationApplied: true,
          isReminder: true,
          parentMessageId: item.id,
        }),
      });
      if (!response.ok) {
        const message = await extractErrorMessage(response, REMINDER_SEND_FAILED_MESSAGE);
        setReminderState((previous) => ({
          ...previous,
          [item.id]: { status: 'review', draftText },
        }));
        setMarkErrors((previous) => ({ ...previous, [item.id]: message }));
        return;
      }
      const created = (await response.json()) as { sentAt: string };
      setReminderState((previous) => ({
        ...previous,
        [item.id]: { status: 'sent', sentAt: created.sentAt },
      }));
    } catch {
      setReminderState((previous) => ({ ...previous, [item.id]: { status: 'review', draftText } }));
      setMarkErrors((previous) => ({ ...previous, [item.id]: REMINDER_SEND_FAILED_MESSAGE }));
    }
  }

  if (status === 'loading') {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>발송 내역</h1>
        <div className={styles.skeleton} aria-busy="true" aria-label="발송 내역 불러오는 중">
          <div className={styles.skeletonRow} />
          <div className={styles.skeletonRow} />
          <div className={styles.skeletonRow} />
        </div>
      </main>
    );
  }

  if (status === 'error') {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>발송 내역</h1>
        <div role="alert" className={styles.banner}>
          <p>{LOAD_FAILED_MESSAGE}</p>
          <button type="button" className={styles.retryButton} onClick={retry}>
            다시 시도
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>발송 내역</h1>
      <p className={styles.lead}>
        보낸 메시지를 확인하고, 아직 답장이 없는 건에는 정중한 리마인드를 검토·승인할 수 있습니다.
      </p>

      {items.length === 0 && <p className={styles.emptyMessage}>{EMPTY_MESSAGE}</p>}

      <ul className={styles.list}>
        {items.map((item) => {
          const rowReminder = reminderState[item.id] ?? { status: 'idle' as const };
          const showThreshold =
            !item.replied && item.reminderSuggested && item.businessDaysElapsed !== null;

          return (
            <li key={item.id} className={styles.item}>
              <div className={styles.itemHeader}>
                <span className={styles.itemRecipient}>{item.recipient}</span>
                <span className={styles.itemSentAt}>{new Date(item.sentAt).toLocaleString()}</span>
              </div>
              <p className={styles.itemText}>{item.finalText}</p>

              <div className={styles.statusRow}>
                {item.replied ? (
                  <span className={styles.repliedTag}>답장 받음</span>
                ) : item.businessDaysElapsed !== null ? (
                  <span className={styles.elapsedTag}>
                    {showThreshold ? `무응답 ${item.businessDaysElapsed}일째` : `경과 ${item.businessDaysElapsed}일`}
                  </span>
                ) : null}
              </div>

              {!item.replied && (
                <div className={styles.itemActions}>
                  <button
                    type="button"
                    className={styles.markButton}
                    disabled={marking[item.id]}
                    onClick={() => void markReplied(item.id)}
                  >
                    답장 받음
                  </button>
                  {showThreshold && rowReminder.status === 'idle' && (
                    <button
                      type="button"
                      className={styles.reviewButton}
                      onClick={() => void reviewReminder(item.id)}
                    >
                      리마인드 검토
                    </button>
                  )}
                  {showThreshold && rowReminder.status === 'error' && (
                    <button
                      type="button"
                      className={styles.reviewButton}
                      onClick={() => void reviewReminder(item.id)}
                    >
                      다시 시도
                    </button>
                  )}
                </div>
              )}

              {markErrors[item.id] && (
                <p role="alert" className={styles.errorText}>
                  {markErrors[item.id]}
                </p>
              )}

              {rowReminder.status === 'loading' && (
                <p className={styles.loadingText} aria-live="polite">
                  리마인드 문구 생성 중…
                </p>
              )}

              {rowReminder.status === 'error' && (
                <p role="alert" className={styles.errorText}>
                  {REMINDER_DRAFT_FAILED_MESSAGE}
                </p>
              )}

              {(rowReminder.status === 'review' || rowReminder.status === 'sending') && (
                <div
                  className={styles.reviewBox}
                  role="dialog"
                  aria-label="리마인드 검토"
                  tabIndex={-1}
                  ref={(node) => {
                    reviewRefs.current[item.id] = node;
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') dismissReview(item.id);
                  }}
                >
                  <label htmlFor={`reminder-draft-${item.id}`}>리마인드 문구(편집 가능)</label>
                  <textarea
                    id={`reminder-draft-${item.id}`}
                    className={styles.reviewTextarea}
                    value={rowReminder.draftText}
                    disabled={rowReminder.status === 'sending'}
                    onChange={(event) => editDraft(item.id, event.target.value)}
                  />
                  <div className={styles.reviewActions}>
                    <button
                      type="button"
                      className={styles.approveButton}
                      disabled={rowReminder.status === 'sending' || rowReminder.draftText.trim() === ''}
                      onClick={() => void approveAndSend(item)}
                    >
                      Approve & Send
                    </button>
                    <button
                      type="button"
                      className={styles.cancelButton}
                      disabled={rowReminder.status === 'sending'}
                      onClick={() => dismissReview(item.id)}
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}

              {rowReminder.status === 'sent' && (
                <p className={styles.sentLog}>
                  리마인드 발송됨 · {new Date(rowReminder.sentAt).toLocaleString()}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
