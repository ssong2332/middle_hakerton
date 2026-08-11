'use client';

/**
 * T40 — UX-005 Response Deadline Negotiation Modal (`docs/UX.md:442-471`). AC-036, AC-005.
 *
 * 🔴 이 화면은 **NORMAL/LOW 메시지에서만** 열린다(AC-005) — 렌더 게이트는 이 컴포넌트가 아니라
 * 호출부(`RecipientPanel`/`MediationWorkspace`)가 담당한다(부재-비활성화 원칙, T57/T40 선례와
 * 같은 이유). 이 컴포넌트 자신은 열렸다는 전제로만 동작한다.
 *
 * 🔴 **수신자 근무시간 데이터 출처 — 스코프 결정(사용자 확인, 2026-08-11)**. `POST /api/deadline/
 * check`(T39)가 요구하는 `recipient.timezone/workStart/workEnd`를 저장·조회할 데이터 소스가
 * 이 리포 어디에도 없다(`docs/UX.md:471` "data source unresolved"로 명시된 채로 남아있던 항목).
 * T31/UX-012(Meeting Time Suggestion)가 이미 쓴 것과 같은 완화책 — **이 세션에서만 쓰는 수동
 * 입력**(저장하지 않음, `docs/UX.md:682` "manual entry only for this session")을 이 모달 안에
 * 그대로 적용한다. 저장된 프로필 데이터가 생기면(수신자 보강, T64/T65) 그 값으로 미리 채우는
 * 것은 이후 라운드의 몫이다.
 *
 * 🔴 **자동 변경 금지(AC-036)** — 이 컴포넌트는 어떤 경로로도 스스로 기한을 바꾸지 않는다.
 * 역제안은 목록으로만 보여주고, 사용자가 명시적으로 하나를 고른 뒤에만 `onConfirm()`을 부른다.
 *
 * Accessibility(UX-005) — 열려 있는 동안 포커스를 가두고(Tab 순환), Escape는 Cancel과 동일하게
 * 닫으며, 닫히면 포커스가 트리거 버튼으로 돌아간다. 날짜/시각 입력은 포인터 전용이 아니라 키보드로
 * 접근 가능한 텍스트 입력이어야 한다 — 네이티브 `datetime-local`/`time` input을 그대로 쓴다(둘
 * 다 이미 키보드로 값을 입력할 수 있다).
 */
import { useEffect, useRef, useState } from 'react';
import type { CountryCode, UrgencyLevel } from '@cross-border/core';
import styles from './ResponseDeadlineModal.module.css';

interface CounterOffer {
  date: string;
  rationale: string;
}

interface DeadlineCheckResponse {
  feasible: boolean;
  reason: string;
  counterOffers: CounterOffer[];
  skipped?: 'critical_immediate';
}

export interface ResponseDeadlineModalProps {
  open: boolean;
  urgency: UrgencyLevel;
  onClose: () => void;
  /** "Use this deadline" 또는 "Accept counter-offer" 클릭 시, 확정된 기한(UTC ISO)과 함께 호출된다. */
  onConfirm: (deadlineIso: string) => void;
}

const COUNTRY_OPTIONS: Array<{ value: CountryCode | ''; label: string }> = [
  { value: '', label: '(선택 안 함)' },
  { value: 'KR', label: '한국' },
  { value: 'US', label: '미국' },
  { value: 'JP', label: '일본' },
  { value: 'CN', label: '중국' },
];

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isValidTimezone(value: string): boolean {
  if (value.trim() === '') return false;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** `neededBy`(datetime-local 값)가 지금보다 미래인지 — 호출 시점(이벤트 핸들러)에서만 부른다,
 * 렌더 본문에서 직접 `Date.now()`를 읽지 않는다(react-hooks/purity, 렌더는 순수해야 한다). */
function isFuture(neededByValue: string): boolean {
  return neededByValue !== '' && new Date(neededByValue).getTime() > Date.now();
}

type Status = 'idle' | 'loading' | 'error' | 'result';

export function ResponseDeadlineModal({ open, urgency, onClose, onConfirm }: ResponseDeadlineModalProps) {
  const [neededBy, setNeededBy] = useState('');
  // react-hooks/purity — `Date.now()`를 렌더 본문에서 직접 읽지 않기 위해, "미래인가" 판정을
  // 값이 바뀌는 이벤트 핸들러 시점에만 계산해 상태로 들고 있는다(`isFuture()` 참조).
  const [neededByIsFuture, setNeededByIsFuture] = useState(true);
  const [timezone, setTimezone] = useState('');
  const [workStart, setWorkStart] = useState('');
  const [workEnd, setWorkEnd] = useState('');
  const [country, setCountry] = useState<CountryCode | ''>('');
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<DeadlineCheckResponse | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // 열릴 때: 트리거 요소를 기억하고 모달 첫 포커스 가능 요소로 포커스를 옮긴다.
  // 닫힐 때: 폼 상태를 초기화하고(다음에 다시 열었을 때 이전 결과가 잔존하지 않도록) 포커스를
  // 트리거로 되돌린다.
  useEffect(() => {
    if (open) {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      first?.focus();
    } else {
      // `terminology/page.tsx`의 fetch-on-mount와 같은 근거로 이 블록만 억제한다 — 모달이
      // 닫히는 시점에 폼 상태를 초기화하는 것은 외부 트리거(부모의 `open` 변경)에 대한 정당한
      // 동기화이며, 사용자 입력에 반응하는 일반적인 setState와는 다른 성격이다.
      /* eslint-disable react-hooks/set-state-in-effect -- 모달 close 시 폼 초기화, 위 근거 참조 */
      setNeededBy('');
      setNeededByIsFuture(true);
      setTimezone('');
      setWorkStart('');
      setWorkEnd('');
      setCountry('');
      setStatus('idle');
      setResult(null);
      setSelectedOffer(null);
      /* eslint-enable react-hooks/set-state-in-effect */
      returnFocusRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  function close() {
    onClose();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const isFutureDeadline = neededBy !== '' && neededByIsFuture;
  const isRecipientFormValid =
    isValidTimezone(timezone) &&
    /^([01]\d|2[0-3]):([0-5]\d)$/.test(workStart) &&
    /^([01]\d|2[0-3]):([0-5]\d)$/.test(workEnd) &&
    workStart < workEnd;
  const canSubmit = isFutureDeadline && isRecipientFormValid && status !== 'loading';

  async function handleSubmit() {
    setStatus('loading');
    try {
      const response = await fetch('/api/deadline/check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          urgency,
          neededBy: new Date(neededBy).toISOString(),
          recipient: {
            timezone,
            workStart,
            workEnd,
            ...(country ? { country } : {}),
          },
        }),
      });
      if (!response.ok) {
        setStatus('error');
        return;
      }
      const body = (await response.json()) as DeadlineCheckResponse;
      setResult(body);
      setSelectedOffer(null);
      setStatus('result');
    } catch {
      setStatus('error');
    }
  }

  function handleUseThisDeadline() {
    onConfirm(new Date(neededBy).toISOString());
    onClose();
  }

  function handleAcceptCounterOffer() {
    if (!selectedOffer) return;
    onConfirm(selectedOffer);
    onClose();
  }

  return (
    <div className={styles.overlay}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="응답 기한 협상"
        className={styles.modal}
        onKeyDown={handleKeyDown}
      >
        <h2 className={styles.title}>응답 기한 협상</h2>

        <div className={styles.field}>
          <label htmlFor="deadline-needed-by">희망 응답 기한</label>
          <input
            id="deadline-needed-by"
            type="datetime-local"
            value={neededBy}
            onChange={(event) => {
              const value = event.target.value;
              setNeededBy(value);
              setNeededByIsFuture(isFuture(value));
              setStatus('idle');
            }}
          />
          {neededBy !== '' && !isFutureDeadline && (
            <p role="alert" className={styles.errorText}>
              미래 날짜/시각을 입력해주세요
            </p>
          )}
        </div>

        <p className={styles.sectionLabel}>
          수신자 근무 정보 <span className={styles.sectionHint}>(이 세션에만 사용, 저장하지 않음)</span>
        </p>
        <div className={styles.field}>
          <label htmlFor="deadline-timezone">수신자 타임존(IANA, 예: Asia/Tokyo)</label>
          <input
            id="deadline-timezone"
            type="text"
            value={timezone}
            onChange={(event) => {
              setTimezone(event.target.value);
              setStatus('idle');
            }}
          />
        </div>
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label htmlFor="deadline-work-start">근무 시작</label>
            <input
              id="deadline-work-start"
              type="time"
              value={workStart}
              onChange={(event) => {
                setWorkStart(event.target.value);
                setStatus('idle');
              }}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="deadline-work-end">근무 종료</label>
            <input
              id="deadline-work-end"
              type="time"
              value={workEnd}
              onChange={(event) => {
                setWorkEnd(event.target.value);
                setStatus('idle');
              }}
            />
          </div>
        </div>
        <div className={styles.field}>
          <label htmlFor="deadline-country">수신자 국가(공휴일 대조용, 선택)</label>
          <select
            id="deadline-country"
            value={country}
            onChange={(event) => setCountry(event.target.value as CountryCode | '')}
          >
            {COUNTRY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className={styles.submitButton}
          disabled={!canSubmit}
          onClick={() => void handleSubmit()}
        >
          실현 가능성 확인
        </button>

        {status === 'error' && (
          <p role="alert" className={styles.errorText}>
            확인하지 못했습니다, 다시 시도해주세요
          </p>
        )}

        {status === 'result' && result && result.feasible && result.counterOffers.length === 0 && (
          <div className={styles.resultBox} role="status">
            <p>이 기한은 실현 가능합니다.</p>
            <button type="button" className={styles.confirmButton} onClick={handleUseThisDeadline}>
              이 기한 사용
            </button>
          </div>
        )}

        {status === 'result' && result && !result.feasible && (
          <div className={styles.resultBox} role="status">
            <p>{result.reason}</p>
            {result.counterOffers.length > 0 && (
              <fieldset className={styles.offerList}>
                <legend>대체 기한 후보</legend>
                {result.counterOffers.map((offer) => (
                  <label key={offer.date} className={styles.offerItem}>
                    <input
                      type="radio"
                      name="counter-offer"
                      value={offer.date}
                      checked={selectedOffer === offer.date}
                      onChange={() => setSelectedOffer(offer.date)}
                    />
                    {new Date(offer.date).toLocaleString()} — {offer.rationale}
                  </label>
                ))}
              </fieldset>
            )}
            <button
              type="button"
              className={styles.confirmButton}
              disabled={!selectedOffer}
              onClick={handleAcceptCounterOffer}
            >
              역제안 수락
            </button>
          </div>
        )}

        <button type="button" className={styles.cancelButton} onClick={close}>
          취소
        </button>
      </div>
    </div>
  );
}
