'use client';

/**
 * T65/T69 — UX-018 Stage 1(조회)~4(합의) (`docs/UX.md:814-843`). AC-065, AC-071, AC-072, AC-073,
 * AC-074, AC-078.
 *
 * 🔴 **ux-design 라우팅은 stale하다(Duty to Refute) — 이 화면은 이미 UX-018로 완전히 스펙되어
 * 있다**(`docs/UX.md:814` "Recipient Public Profile Enrichment & Collaboration Style
 * Inference", States 절이 Stage 1~4를 문항 단위로 고정). `docs/Tasks.md` T65/T69 행의 "화면
 * 신설이므로 ux-design 라우팅 필요"는 v2.7 시점(UX.md가 2필드짜리 초안이었을 때)의 문구가 v5.0
 * 재설계 이후 갱신되지 않은 채 남은 것이다 — T52/T40/T54/T65와 같은 패턴(전부 stale로 확인됨).
 *
 * 🔴 **(2026-08-11, T69) Stage 3(제안)·Stage 4(합의) 추가.** `docs/UX.md:834` Architect
 * Handoff Priority가 "T68·T69 are the new tasks covering Stages 2–4"라고 명시한 그대로 — T68이
 * `POST /api/enrichment/suggest`(Stage 3, 근거 인용)를 만들었고, 이 컴포넌트가 그 응답을 보여준
 * 뒤 사용자가 확인·수정한 값만 `POST /api/protocol/confirm-inference`(Stage 4, T69 신규)로
 * 확정 저장한다. **확정 전에는 이 컴포넌트가 그 어떤 저장 요청도 보내지 않는다**(AC-074② —
 * `suggest` 응답은 세션 상태(`suggestions`)로만 들고 있고, "확정하고 규약에 저장" 클릭 전까지
 * 네트워크 쓰기 요청이 없다).
 *
 * 🔴 **Stage 4 초안 값은 제안이 없는 3축을 null로 지어내 덮지 않는다** — `confirmInference()`가
 * 받은 4개 필드를 그대로 UPDATE하므로(`saveProtocol()`과 같은 "전체 상태 전송" 계약), 제안이
 * 없는 축은 기존 규약값(`GET /api/protocol`)으로 미리 채워 넣는다. 이 화면이 "합의" 단계라고
 * 해서 나머지 3축을 비우는 부작용을 만들지 않는다.
 *
 * 🔴 **관측 지표는 4종이 아니라 1종만 표시한다(스코프 갭, T64가 이미 architect 라우팅 표시함)** —
 * `docs/Tasks.md` T65 원문은 "관측 지표 4종도 함께 표시"라고 적지만, T64가 실제로 산출·저장하는
 * 것은 활동 시간대(AC-071) 하나뿐이다(`apps/web/app/api/enrichment/fetch/route.ts` 헤더 주석 —
 * 코멘트 길이/이모지 빈도/응답 지연 3종은 `POST /api/enrichment/observe`(T68 범위)가 필요한데
 * 아직 스키마·라우트가 없다). 없는 지표를 지어내 보여줄 수 없으므로 여기서는 활동 시간대만
 * 렌더하고, 나머지 3종은 렌더하지 않는다(있는 척하지 않는다 — AC-034와 같은 원칙). **제안(Stage
 * 3)은 이모지 축 하나뿐이다** — `packages/core/src/steps/suggest.ts` 헤더 주석과 같은 이유.
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
import Link from 'next/link';
import styles from './RecipientEnrichmentModal.module.css';

interface StyleSuggestionDraft {
  axis: 'directnessAllowed' | 'emojiPolicy' | 'addressForm' | 'deadlineStyle';
  value: string;
  evidence: { indicatorKey: string; observedValue: number };
  evidenceCount?: number;
  confidence?: number;
}

type SuggestResponseBody =
  | { suggestions: StyleSuggestionDraft[]; source: string }
  | { suggestions: []; insufficientSample: true; requiredSampleCount: number; currentSampleCount: number }
  | { suggestions: []; protocolAlreadyAuthored: true };

interface ProtocolSnapshot {
  directnessAllowed: 'yes' | 'no' | null;
  emojiPolicy: 'ok' | 'avoid' | null;
  addressForm: string | null;
  deadlineStyle: string | null;
}

type SuggestStatus = 'idle' | 'loading' | 'result' | 'insufficientSample' | 'protocolAuthored' | 'error';
type AgreementStatus = 'idle' | 'confirming' | 'confirmed' | 'conflict' | 'error';

const AXIS_LABEL: Record<StyleSuggestionDraft['axis'], string> = {
  directnessAllowed: '직설 허용',
  emojiPolicy: '이모지',
  addressForm: '호칭',
  deadlineStyle: '마감 표현',
};

function findDraftValue(suggestions: StyleSuggestionDraft[], axis: StyleSuggestionDraft['axis']): string | null {
  return suggestions.find((suggestion) => suggestion.axis === axis)?.value ?? null;
}

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

  // Stage 3(제안, AC-073) — `suggestions`는 세션 상태로만 존재하고 확정 전까지 어디에도
  // 저장되지 않는다(AC-074②).
  const [suggestStatus, setSuggestStatus] = useState<SuggestStatus>('idle');
  const [suggestions, setSuggestions] = useState<StyleSuggestionDraft[]>([]);
  const [sampleInfo, setSampleInfo] = useState<{ required: number; current: number } | null>(null);

  // Stage 4(합의, AC-074) — 제안이 없는 축은 기존 규약값으로 미리 채운다(위 파일 헤더 주석).
  const [draftDirectness, setDraftDirectness] = useState<'yes' | 'no' | null>(null);
  const [draftEmoji, setDraftEmoji] = useState<'ok' | 'avoid' | null>(null);
  const [draftAddressForm, setDraftAddressForm] = useState('');
  const [draftDeadlineStyle, setDraftDeadlineStyle] = useState('');
  const [agreementStatus, setAgreementStatus] = useState<AgreementStatus>('idle');

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
      setSuggestStatus('idle');
      setSuggestions([]);
      setSampleInfo(null);
      setDraftDirectness(null);
      setDraftEmoji(null);
      setDraftAddressForm('');
      setDraftDeadlineStyle('');
      setAgreementStatus('idle');
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

  // 🔴 AC-073⑤ — 이 클릭이 Stage 3 진입을 만드는 유일한 트리거다(자동 생성 아님, UX-018
  // Validation "협업 스타일 제안 보기 is enabled once Stage 2's observation has rendered").
  async function handleViewSuggestion() {
    setSuggestStatus('loading');
    try {
      const response = await fetch('/api/enrichment/suggest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ recipient }),
      });
      if (!response.ok) {
        setSuggestStatus('error');
        return;
      }
      const body = (await response.json()) as SuggestResponseBody;
      if ('protocolAlreadyAuthored' in body && body.protocolAlreadyAuthored) {
        setSuggestStatus('protocolAuthored');
        return;
      }
      if ('insufficientSample' in body && body.insufficientSample) {
        setSampleInfo({ required: body.requiredSampleCount, current: body.currentSampleCount });
        setSuggestStatus('insufficientSample');
        return;
      }

      // 🔴 파일 헤더 주석 — 제안이 없는 3축은 null로 지어내지 않고 기존 규약값으로 채운다.
      let existing: ProtocolSnapshot | null = null;
      try {
        const protocolResponse = await fetch(`/api/protocol?counterpart=${encodeURIComponent(recipient)}`);
        if (protocolResponse.ok) {
          existing = (await protocolResponse.json()) as ProtocolSnapshot;
        }
      } catch {
        existing = null;
      }
      setSuggestions(body.suggestions);
      setDraftDirectness(
        (findDraftValue(body.suggestions, 'directnessAllowed') as 'yes' | 'no' | null) ??
          existing?.directnessAllowed ??
          null,
      );
      setDraftEmoji(
        (findDraftValue(body.suggestions, 'emojiPolicy') as 'ok' | 'avoid' | null) ??
          existing?.emojiPolicy ??
          null,
      );
      setDraftAddressForm(findDraftValue(body.suggestions, 'addressForm') ?? existing?.addressForm ?? '');
      setDraftDeadlineStyle(findDraftValue(body.suggestions, 'deadlineStyle') ?? existing?.deadlineStyle ?? '');
      setSuggestStatus('result');
    } catch {
      setSuggestStatus('error');
    }
  }

  // 🔴 AC-074② — 이 클릭 전까지 규약/추론 레코드는 어디에도 쓰이지 않는다(`suggestions`는
  // 컴포넌트 상태일 뿐). AC-074④ — 409면 상대가 그 사이 직접 작성한 것이므로 초안을 버린다.
  async function handleConfirmAgreement() {
    setAgreementStatus('confirming');
    try {
      const response = await fetch('/api/protocol/confirm-inference', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          counterpart: recipient,
          directnessAllowed: draftDirectness,
          emojiPolicy: draftEmoji,
          addressForm: draftAddressForm.trim() || null,
          deadlineStyle: draftDeadlineStyle.trim() || null,
        }),
      });
      if (response.status === 409) {
        setAgreementStatus('conflict');
        return;
      }
      if (!response.ok) {
        setAgreementStatus('error');
        return;
      }
      setAgreementStatus('confirmed');
    } catch {
      setAgreementStatus('error');
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

        {/* Stage 3(제안, AC-073) — 관측이 렌더된 뒤에만 트리거를 보여준다(UX-018 Validation).
            자동 생성 없음 — 사용자의 이 클릭 하나가 유일한 진입점이다. */}
        {loadStatus === 'loaded' && suggestStatus === 'idle' && (
          <button
            type="button"
            className={styles.fetchButton}
            onClick={() => void handleViewSuggestion()}
          >
            협업 스타일 제안 보기
          </button>
        )}
        {suggestStatus === 'loading' && (
          <p role="status" className={styles.statusText}>
            제안을 불러오는 중…
          </p>
        )}
        {suggestStatus === 'error' && (
          <p role="alert" className={styles.errorText}>
            제안을 불러오지 못했습니다. 다시 시도해주세요.
          </p>
        )}
        {suggestStatus === 'protocolAuthored' && (
          <div className={styles.resultBox} role="status">
            <p>상대가 이미 이 규약을 직접 작성했습니다 — 제안을 만들지 않습니다.</p>
            <Link href={`/pair-protocols/${encodeURIComponent(recipient)}`}>규약 보기</Link>
          </div>
        )}
        {suggestStatus === 'insufficientSample' && sampleInfo && (
          <p role="status" className={styles.statusText}>
            표본 부족으로 제안하지 않음 (현재 표본 {sampleInfo.current}건, 필요 {sampleInfo.required}건).
          </p>
        )}

        {/* Stage 4(합의, AC-074) — SuggestionResult에서만 진입 가능. 확정 전까지는 저장하지
            않는다는 고지가 항상 함께 보인다(AC-074⑤). */}
        {suggestStatus === 'result' && agreementStatus !== 'confirmed' && agreementStatus !== 'conflict' && (
          <div className={styles.resultBox}>
            <p className={styles.sectionLabel}>제안 — 근거와 함께</p>
            {suggestions.map((suggestion) => (
              <p key={suggestion.axis}>
                {AXIS_LABEL[suggestion.axis]}: {suggestion.value} — 근거: {suggestion.evidence.indicatorKey}{' '}
                {suggestion.evidence.observedValue} (근거 {suggestion.evidenceCount ?? suggestion.confidence}건)
              </p>
            ))}
            <p className={styles.disclosure}>이것은 제안이며 확정 전에는 저장되지 않습니다.</p>

            <fieldset className={styles.timezoneFieldset}>
              <legend>직설 허용</legend>
              {(['yes', 'no'] as const).map((value) => (
                <label key={value} className={styles.candidateItem}>
                  <input
                    type="radio"
                    name="draft-directness"
                    checked={draftDirectness === value}
                    onChange={() => setDraftDirectness(value)}
                  />
                  {value === 'yes' ? '허용' : '비허용'}
                </label>
              ))}
            </fieldset>
            <fieldset className={styles.timezoneFieldset}>
              <legend>이모지</legend>
              {(['ok', 'avoid'] as const).map((value) => (
                <label key={value} className={styles.candidateItem}>
                  <input
                    type="radio"
                    name="draft-emoji"
                    checked={draftEmoji === value}
                    onChange={() => setDraftEmoji(value)}
                  />
                  {value === 'ok' ? '사용 가능' : '사용 지양'}
                </label>
              ))}
            </fieldset>
            <div className={styles.field}>
              <label htmlFor="draft-address-form">호칭</label>
              <input
                id="draft-address-form"
                type="text"
                value={draftAddressForm}
                onChange={(event) => setDraftAddressForm(event.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="draft-deadline-style">마감 표현</label>
              <input
                id="draft-deadline-style"
                type="text"
                value={draftDeadlineStyle}
                onChange={(event) => setDraftDeadlineStyle(event.target.value)}
              />
            </div>

            <button
              type="button"
              className={styles.confirmButton}
              disabled={
                agreementStatus === 'confirming' ||
                draftDirectness === null ||
                draftEmoji === null ||
                draftAddressForm.trim().length === 0 ||
                draftDeadlineStyle.trim().length === 0
              }
              onClick={() => void handleConfirmAgreement()}
            >
              확정하고 규약에 저장
            </button>
            {agreementStatus === 'error' && (
              <p role="alert" className={styles.errorText}>
                확정 저장에 실패했습니다. 다시 시도해주세요.
              </p>
            )}
          </div>
        )}
        {agreementStatus === 'confirmed' && (
          <div className={styles.resultBox} role="status">
            <p>규약에 저장되었습니다.</p>
            <Link href={`/pair-protocols/${encodeURIComponent(recipient)}`}>규약 보기</Link>
          </div>
        )}
        {agreementStatus === 'conflict' && (
          <div className={styles.resultBox} role="alert">
            <p>상대가 그 사이 이 규약을 직접 작성해 확정할 수 없습니다 — 상대가 정한 값이 적용됩니다.</p>
            <Link href={`/pair-protocols/${encodeURIComponent(recipient)}`}>규약 보기</Link>
          </div>
        )}

        <button type="button" className={styles.closeButton} onClick={close}>
          닫기
        </button>
      </div>
    </div>
  );
}
