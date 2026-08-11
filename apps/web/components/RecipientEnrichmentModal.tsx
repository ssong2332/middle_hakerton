'use client';

/**
 * T65 — UX-018 Stage 1(조회) + Stage 2 일부(관측, AC-071만) (`docs/UX.md:814-843`). AC-065,
 * AC-071, AC-072, AC-078.
 *
 * 🔴 **ux-design 라우팅은 stale하다(Duty to Refute) — 이 화면은 이미 UX-018로 완전히 스펙되어
 * 있다**(`docs/UX.md:814` "Recipient Public Profile Enrichment & Collaboration Style
 * Inference", States 절이 Stage 1·2를 문항 단위로 고정). `docs/Tasks.md` T65 행의 "화면 신설이므로
 * ux-design 라우팅 필요"는 v2.7 시점(UX.md가 2필드짜리 초안이었을 때)의 문구가 v5.0 재설계 이후
 * 갱신되지 않은 채 남은 것이다 — T52/T40/T54와 같은 패턴(전부 stale로 확인됨).
 *
 * 🔴 **범위 — Stage 3(제안)·Stage 4(합의)는 이 컴포넌트에 없다.** `docs/UX.md:834` Architect
 * Handoff Priority: "T68·T69 are the new tasks covering Stages 2–4" — 근거 인용·확신도·규약
 * 저장은 T68/T69의 몫이다. 이 컴포넌트는 URL 조회 → location/company/미등록 표시 → 타임존 후보
 * 확정 → (있으면) 활동 시간대 관측 사실 표시까지만 담당한다.
 *
 * 🔴 **관측 지표는 4종이 아니라 1종만 표시한다(스코프 갭, T64가 이미 architect 라우팅 표시함)** —
 * `docs/Tasks.md` T65 원문은 "관측 지표 4종도 함께 표시"라고 적지만, T64가 실제로 산출·저장하는
 * 것은 활동 시간대(AC-071) 하나뿐이다(`apps/web/app/api/enrichment/fetch/route.ts` 헤더 주석 —
 * 코멘트 길이/이모지 빈도/응답 지연 3종은 `POST /api/enrichment/observe`(T68 범위)가 필요한데
 * 아직 스키마·라우트가 없다). 없는 지표를 지어내 보여줄 수 없으므로 여기서는 활동 시간대만
 * 렌더하고, 나머지 3종은 렌더하지 않는다(있는 척하지 않는다 — AC-034와 같은 원칙).
 *
 * 🔴 **확정 타임존은 슬롯이 하나뿐이다** — `recipient_enrichments.activity_timezone_confirmed`
 * (`docs/Database.md:221`) 컬럼은 1개이며, location 기반 후보와 활동 기반 후보를 담을 별도
 * 컬럼이 없다. 이 화면은 둘을 **하나의 라디오 그룹**으로 합쳐 보여주고, 사용자가 고른 값 하나만
 * 이 컬럼에 저장한다 — 스키마가 고정한 형태이며 이 컴포넌트가 임의로 컬럼을 나누지 않는다.
 *
 * Accessibility — `ResponseDeadlineModal.tsx`(T40)와 같은 포커스 트랩·Escape·복귀 패턴을 그대로
 * 따른다.
 */
import { useEffect, useRef, useState } from 'react';
import styles from './RecipientEnrichmentModal.module.css';

interface EnrichmentSnapshot {
  location: string | null;
  company: string | null;
  activityHourHistogram: number[] | null;
  activitySampleCount: number | null;
  activityTimezoneConfirmed: string | null;
  timezoneCandidates: string[];
  activityTimeCandidate: string | null;
  fetchedAt: string | null;
  sourceUrl: string | null;
}

const EMPTY_SNAPSHOT: EnrichmentSnapshot = {
  location: null,
  company: null,
  activityHourHistogram: null,
  activitySampleCount: null,
  activityTimezoneConfirmed: null,
  timezoneCandidates: [],
  activityTimeCandidate: null,
  fetchedAt: null,
  sourceUrl: null,
};

export interface RecipientEnrichmentModalProps {
  open: boolean;
  /** 상대 식별자(이메일) — `SenderPanel`의 "받는 사람" 필드 값. */
  recipient: string;
  onClose: () => void;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type LoadStatus = 'idle' | 'loading' | 'loaded' | 'error';
type FetchStatus = 'idle' | 'loading' | 'error';
type ConfirmStatus = 'idle' | 'saving' | 'error';
type ClearStatus = 'idle' | 'clearing' | 'error';

export function RecipientEnrichmentModal({ open, recipient, onClose }: RecipientEnrichmentModalProps) {
  const [urlInput, setUrlInput] = useState('');
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('idle');
  const [snapshot, setSnapshot] = useState<EnrichmentSnapshot>(EMPTY_SNAPSHOT);
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>('idle');
  const [selectedTimezone, setSelectedTimezone] = useState('');
  const [confirmStatus, setConfirmStatus] = useState<ConfirmStatus>('idle');
  const [clearStatus, setClearStatus] = useState<ClearStatus>('idle');

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // 🔴 AC-065② — 이 GET은 "검색/크롤링"이 아니라 사용자가 이전에 이미 붙여넣었던 값을 다시
  // 보여주는 재조회다(같은 사용자·같은 상대에 한정, 새 외부 조회를 일으키지 않는다 —
  // `apps/web/app/api/enrichment/route.ts` 헤더 주석 참조). 열릴 때 1회만 실행한다.
  /* eslint-disable react-hooks/set-state-in-effect -- 모달 open 시 1회 외부 상태 로드, ResponseDeadlineModal.tsx 선례와 동일 */
  useEffect(() => {
    if (open) {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      setLoadStatus('loading');
      fetch(`/api/enrichment?recipient=${encodeURIComponent(recipient)}`)
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error('load failed'))))
        .then((body: EnrichmentSnapshot & { showEnrichmentLink: boolean }) => {
          setSnapshot(body);
          setSelectedTimezone(body.activityTimezoneConfirmed ?? '');
          setLoadStatus('loaded');
        })
        .catch(() => setLoadStatus('error'));
      const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      first?.focus();
    } else {
      setUrlInput('');
      setLoadStatus('idle');
      setSnapshot(EMPTY_SNAPSHOT);
      setFetchStatus('idle');
      setSelectedTimezone('');
      setConfirmStatus('idle');
      setClearStatus('idle');
      returnFocusRef.current?.focus();
    }
  }, [open, recipient]);
  /* eslint-enable react-hooks/set-state-in-effect */

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

  // 🔴 AC-065② — 외부(GitHub) 조회를 실제로 일으키는 유일한 코드 경로. 사용자의 명시적 클릭
  // 하나뿐이며, 텍스트 변경·모달 오픈 등 다른 어떤 이벤트도 이 함수를 부르지 않는다.
  async function handleFetch() {
    setFetchStatus('loading');
    try {
      const response = await fetch('/api/enrichment/fetch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ recipient, profileUrl: urlInput }),
      });
      if (!response.ok) {
        setFetchStatus('error');
        return;
      }
      const body = (await response.json()) as EnrichmentSnapshot;
      setSnapshot(body);
      setSelectedTimezone('');
      setFetchStatus('idle');
      setLoadStatus('loaded');
    } catch {
      setFetchStatus('error');
    }
  }

  // 🔴 AC-065④/AC-071③ — 후보를 사용자가 명시적으로 고르고 이 버튼을 눌러야만 저장된다.
  // 자동 확정 코드 경로는 없다(라디오는 `checked` 상태만 바꿀 뿐 저장하지 않는다).
  async function handleConfirmTimezone() {
    if (!selectedTimezone) return;
    setConfirmStatus('saving');
    try {
      const response = await fetch('/api/enrichment', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ recipient, activityTimezoneConfirmed: selectedTimezone }),
      });
      if (!response.ok) {
        setConfirmStatus('error');
        return;
      }
      setSnapshot((prev) => ({ ...prev, activityTimezoneConfirmed: selectedTimezone }));
      setConfirmStatus('idle');
    } catch {
      setConfirmStatus('error');
    }
  }

  async function handleClear() {
    setClearStatus('clearing');
    try {
      const response = await fetch(`/api/enrichment?recipient=${encodeURIComponent(recipient)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        setClearStatus('error');
        return;
      }
      setSnapshot(EMPTY_SNAPSHOT);
      setUrlInput('');
      setSelectedTimezone('');
      setClearStatus('idle');
    } catch {
      setClearStatus('error');
    }
  }

  const combinedCandidates = [
    ...snapshot.timezoneCandidates,
    ...(snapshot.activityTimeCandidate ? [snapshot.activityTimeCandidate] : []),
  ];
  const hasAnyValue = snapshot.location !== null || snapshot.company !== null || snapshot.sourceUrl !== null;

  return (
    <div className={styles.overlay}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="상대방 정보 보강"
        className={styles.modal}
        onKeyDown={handleKeyDown}
      >
        <h2 className={styles.title}>상대방 정보 보강</h2>
        <p className={styles.disclosure}>
          상대가 공개한 프로필 페이지를 사용자가 직접 붙여넣어 조회합니다 — 검색·자동 수집은
          하지 않으며, 상대는 이 서비스의 회원이 아닙니다.
        </p>

        <div className={styles.field}>
          <label htmlFor="enrichment-url">공개 프로필 URL(GitHub)</label>
          <input
            id="enrichment-url"
            type="text"
            value={urlInput}
            onChange={(event) => setUrlInput(event.target.value)}
            placeholder="https://github.com/username"
          />
        </div>
        <button
          type="button"
          className={styles.fetchButton}
          disabled={urlInput.trim() === '' || fetchStatus === 'loading'}
          onClick={() => void handleFetch()}
        >
          조회
        </button>
        {fetchStatus === 'error' && (
          <p role="alert" className={styles.errorText}>
            조회에 실패했습니다. 다시 시도해주세요.
          </p>
        )}

        {loadStatus === 'loading' && (
          <p role="status" className={styles.statusText}>
            불러오는 중…
          </p>
        )}

        {loadStatus === 'loaded' && hasAnyValue && (
          <div className={styles.resultBox} role="status">
            <p>
              <span className={styles.resultLabel}>회사(company)</span>{' '}
              {snapshot.company ?? '미등록'}
            </p>
            <p>
              <span className={styles.resultLabel}>지역(location)</span>{' '}
              {snapshot.location ?? '미등록'}
            </p>
            {snapshot.sourceUrl && (
              <p className={styles.sourceText}>
                출처: {snapshot.sourceUrl} · 조회 시각:{' '}
                {snapshot.fetchedAt ? new Date(snapshot.fetchedAt).toLocaleString() : '미등록'}
              </p>
            )}
          </div>
        )}

        {/* Stage 2(관측) — 활동 시간대 하나만(스코프 갭, 파일 헤더 주석 참조). 성향·성격 서술
            없이 표본 수·관측 사실만 문장으로 표시한다(AC-071⑤/AC-072④). */}
        {loadStatus === 'loaded' && snapshot.activitySampleCount !== null && (
          <div className={styles.observationBox} role="status">
            <p className={styles.sectionLabel}>관측 — 공개 활동 시간대</p>
            {snapshot.activityHourHistogram !== null && snapshot.activityTimeCandidate ? (
              <p>
                공개 활동은 {snapshot.activityTimeCandidate}에 가장 많습니다 (표본{' '}
                {snapshot.activitySampleCount}건).
              </p>
            ) : (
              <p>표본 부족으로 활동 시간대를 산출하지 않았습니다 (현재 표본 {snapshot.activitySampleCount}건).</p>
            )}
          </div>
        )}

        {combinedCandidates.length > 0 && (
          <fieldset className={styles.timezoneFieldset}>
            <legend>타임존 후보 — 확정해야 개인화에 반영됩니다</legend>
            {combinedCandidates.map((candidate) => (
              <label key={candidate} className={styles.candidateItem}>
                <input
                  type="radio"
                  name="timezone-candidate"
                  value={candidate}
                  checked={selectedTimezone === candidate}
                  onChange={() => setSelectedTimezone(candidate)}
                />
                {candidate}
              </label>
            ))}
            <button
              type="button"
              className={styles.confirmButton}
              disabled={!selectedTimezone || confirmStatus === 'saving'}
              onClick={() => void handleConfirmTimezone()}
            >
              확정
            </button>
            {confirmStatus === 'error' && (
              <p role="alert" className={styles.errorText}>
                확정 저장에 실패했습니다. 다시 시도해주세요.
              </p>
            )}
            {snapshot.activityTimezoneConfirmed && (
              <p role="status" className={styles.statusText}>
                현재 확정된 값: {snapshot.activityTimezoneConfirmed}
              </p>
            )}
          </fieldset>
        )}

        {hasAnyValue && (
          <button
            type="button"
            className={styles.clearButton}
            disabled={clearStatus === 'clearing'}
            onClick={() => void handleClear()}
          >
            보강 정보 삭제
          </button>
        )}
        {clearStatus === 'error' && (
          <p role="alert" className={styles.errorText}>
            삭제에 실패했습니다. 다시 시도해주세요.
          </p>
        )}

        <button type="button" className={styles.closeButton} onClick={close}>
          닫기
        </button>
      </div>
    </div>
  );
}
