'use client';

/**
 * UX-011 Pair Communication Protocol Screen — 상대별 상세(4항목 합의·저장, 배지, MismatchBanner).
 * `docs/UX.md` UX-011. `docs/Tasks.md` T41/T69. AC-037, AC-075, AC-079, AC-083.
 *
 * 🔴 이 화면은 `RecipientAutoSelected`/`RecipientCandidates`(UF-019, P2 cut-eligible·별도
 * 태스크)는 렌더하지 않는다 — UX-011 범위가 아니다(UF-019는 UX-016 층 1 패널 몫).
 *
 * 🔴 **(2026-08-11, T69) MismatchBanner 추가.** `GET /api/protocol/mismatches`(T70)가 만든
 * `axes[]`를 이 화면이 그대로 렌더만 한다 — 판정은 이미 서버가 끝냈다(`docs/UX.md:649` "this
 * screen does not compute the comparison itself, only renders it"). 조회 실패는 에러가
 * 아니다(advisory data — 배너 영역이 그냥 안 보인다, UX-011 Failure 행). **저장 성공 시 배너
 * 전부를 지운다** — Save가 4축을 항상 함께 쓰므로(`saveProtocol()`), 방금 저장된 값이 새 기준이
 * 되고 다음 관측 주기가 다시 불일치를 찾을 때까지는 재조회 전엔 stale 배너를 보여주지 않는다
 * (`docs/UX.md:311` "Saving an axis whose banner is showing clears that banner").
 *
 * 🔴 AuthorshipShown 배지는 `inference_draft`(ⓐ)를 만드는 쓰기 경로가 여전히 없다(T69의
 * `POST /api/protocol/confirm-inference`는 `untouched`→`sender_confirmed`로 직접 전이한다,
 * `docs/Database.md:161` architect 판단) — 실제로는 ⓑ/ⓒ/ⓓ 세 값만 관측된다. 렌더 자체는 4값
 * 전부 지원한다(UX-011 States 요구).
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import styles from '../pair-protocols.module.css';

const LOAD_FAILED_MESSAGE = '불러오지 못했습니다, 다시 시도해주세요';
const SAVE_FAILED_MESSAGE = '저장하지 못했습니다, 다시 시도해주세요';

type DirectnessAllowed = 'yes' | 'no';
type EmojiPolicy = 'ok' | 'avoid';
type AuthorshipState = 'untouched' | 'inference_draft' | 'sender_confirmed' | 'counterpart_authored';

interface ProtocolRecord {
  counterpart: string;
  directnessAllowed: DirectnessAllowed | null;
  emojiPolicy: EmojiPolicy | null;
  addressForm: string | null;
  deadlineStyle: string | null;
  authorshipState: AuthorshipState;
}

/** T70 `GET /api/protocol/mismatches` 응답 축(`docs/API.md:249`) — 이 화면은 이 중 규약 4항목에
 * 붙일 자리가 있는 `emoji`/`directness`만 렌더한다(`addressForm`/`deadline`은 아직 판정 로직이
 * 없어 T70이 실제로는 만들지 않는다 — 나오더라도 이 화면은 렌더 대상 목록에 없는 축을 그냥
 * 무시한다). */
type MismatchAxis = 'emoji' | 'directness' | 'addressForm' | 'deadline';

interface MismatchAxisResult {
  axis: MismatchAxis;
  mismatched: boolean;
  comparison: string;
  sampleCount: number;
  sources: ('manual' | 'github')[];
}

/** UX-011 States "AuthorshipShown" — 정확히 4값, 배지 색이 아니라 텍스트로만 표시한다(Accessibility). */
const AUTHORSHIP_LABEL: Record<AuthorshipState, string> = {
  untouched: '아직 정해지지 않음',
  inference_draft: '추론 초안',
  sender_confirmed: '발신자가 확정',
  counterpart_authored: '상대가 직접 작성',
};

const DIRECTNESS_LABEL: Record<DirectnessAllowed, string> = { yes: '허용', no: '비허용' };
const EMOJI_LABEL: Record<EmojiPolicy, string> = { ok: '사용 가능', avoid: '사용 지양' };

function toBody(
  counterpart: string,
  directnessAllowed: DirectnessAllowed | null,
  emojiPolicy: EmojiPolicy | null,
  addressForm: string,
  deadlineStyle: string,
) {
  return {
    counterpart,
    directnessAllowed,
    emojiPolicy,
    addressForm: addressForm.trim() || null,
    deadlineStyle: deadlineStyle.trim() || null,
  };
}

async function extractErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

export default function PairProtocolCounterpartPage() {
  const params = useParams<{ counterpart: string }>();
  const counterpart = decodeURIComponent(params.counterpart ?? '');

  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [authorshipState, setAuthorshipState] = useState<AuthorshipState>('untouched');
  const [directnessAllowed, setDirectnessAllowed] = useState<DirectnessAllowed | null>(null);
  const [emojiPolicy, setEmojiPolicy] = useState<EmojiPolicy | null>(null);
  const [addressForm, setAddressForm] = useState('');
  const [deadlineStyle, setDeadlineStyle] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  // T69/UF-022 — MismatchBanner. 조회 실패는 advisory data라 에러로 다루지 않는다(파일 헤더
  // 주석) — `axes`가 그냥 빈 배열로 남는다.
  const [axes, setAxes] = useState<MismatchAxisResult[]>([]);
  const [expandedAxes, setExpandedAxes] = useState<Set<MismatchAxis>>(new Set());
  const [dismissedAxes, setDismissedAxes] = useState<Set<MismatchAxis>>(new Set());

  const fetchMismatches = useCallback(async () => {
    try {
      const response = await fetch(`/api/protocol/mismatches?counterpart=${encodeURIComponent(counterpart)}`);
      if (!response.ok) return;
      const body = (await response.json()) as { axes: MismatchAxisResult[] };
      setAxes(body.axes);
    } catch {
      // advisory data — 조용히 무시(파일 헤더 주석).
    }
  }, [counterpart]);

  const fetchProtocol = useCallback(async () => {
    try {
      const response = await fetch(`/api/protocol?counterpart=${encodeURIComponent(counterpart)}`);
      if (!response.ok) {
        setStatus('error');
        return;
      }
      const body = (await response.json()) as ProtocolRecord;
      setAuthorshipState(body.authorshipState);
      setDirectnessAllowed(body.directnessAllowed);
      setEmojiPolicy(body.emojiPolicy);
      setAddressForm(body.addressForm ?? '');
      setDeadlineStyle(body.deadlineStyle ?? '');
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [counterpart]);

  /* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount, terminology/page.tsx와 같은 근거 */
  useEffect(() => {
    void fetchProtocol();
    void fetchMismatches();
  }, [fetchProtocol, fetchMismatches]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function retry() {
    setStatus('loading');
    void fetchProtocol();
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setJustSaved(false);
    try {
      const response = await fetch('/api/protocol', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          toBody(counterpart, directnessAllowed, emojiPolicy, addressForm, deadlineStyle),
        ),
      });
      if (!response.ok) {
        setSaveError(await extractErrorMessage(response, SAVE_FAILED_MESSAGE));
        return;
      }
      const body = (await response.json()) as ProtocolRecord;
      setAuthorshipState(body.authorshipState);
      setJustSaved(true);
      // 🔴 UX-011 Validation — "Saving an axis whose banner is showing clears that banner"
      // (파일 헤더 주석). Save는 항상 4축을 함께 쓰므로 전부 지운다.
      setAxes([]);
      setExpandedAxes(new Set());
      setDismissedAxes(new Set());
    } catch {
      setSaveError(SAVE_FAILED_MESSAGE);
    } finally {
      setSaving(false);
    }
  }

  function toggleExpanded(axis: MismatchAxis) {
    setExpandedAxes((prev) => {
      const next = new Set(prev);
      if (next.has(axis)) next.delete(axis);
      else next.add(axis);
      return next;
    });
  }

  function dismissAxis(axis: MismatchAxis) {
    setDismissedAxes((prev) => new Set(prev).add(axis));
  }

  function renderMismatchBanner(axis: MismatchAxis) {
    const result = axes.find((entry) => entry.axis === axis && entry.mismatched);
    if (!result || dismissedAxes.has(axis)) return null;
    return (
      <div className={styles.mismatchBanner}>
        <p>합의된 규칙과 관측이 다릅니다. 확인해 보시겠어요?</p>
        {expandedAxes.has(axis) && <p>{result.comparison}</p>}
        <div className={styles.mismatchActions}>
          <button type="button" className={styles.mismatchButton} onClick={() => toggleExpanded(axis)}>
            확인
          </button>
          <button type="button" className={styles.mismatchButton} onClick={() => dismissAxis(axis)}>
            나중에
          </button>
        </div>
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>쌍방 규약</h1>
        <div className={styles.skeleton} aria-busy="true" aria-label="쌍방 규약 불러오는 중">
          <div className={styles.skeletonRow} />
          <div className={styles.skeletonRow} />
        </div>
      </main>
    );
  }

  if (status === 'error') {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>쌍방 규약</h1>
        <div role="alert" className={styles.banner}>
          <p>{LOAD_FAILED_MESSAGE}</p>
          <button type="button" className={styles.retryButton} onClick={retry}>
            다시 시도
          </button>
        </div>
      </main>
    );
  }

  // UX-011 Validation — 4항목이 모두 채워져야 Save가 활성화된다.
  const saveDisabled =
    saving ||
    directnessAllowed === null ||
    emojiPolicy === null ||
    addressForm.trim().length === 0 ||
    deadlineStyle.trim().length === 0;

  return (
    <main className={styles.page}>
      <Link href="/pair-protocols" className={styles.backLink}>
        ← 쌍방 규약 목록
      </Link>
      <h1 className={styles.title}>{counterpart}</h1>
      <p className={styles.badge}>{AUTHORSHIP_LABEL[authorshipState]}</p>

      <div className={styles.form}>
        <div className={styles.field}>
          {renderMismatchBanner('directness')}
          <span id="directness-label">직설 허용</span>
          <div className={styles.choiceGroup} role="group" aria-labelledby="directness-label">
            {(Object.keys(DIRECTNESS_LABEL) as DirectnessAllowed[]).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={directnessAllowed === value}
                className={
                  directnessAllowed === value
                    ? `${styles.choiceButton} ${styles.choiceButtonActive}`
                    : styles.choiceButton
                }
                onClick={() => {
                  setDirectnessAllowed(value);
                  setJustSaved(false);
                }}
              >
                {DIRECTNESS_LABEL[value]}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          {renderMismatchBanner('emoji')}
          <span id="emoji-label">이모지</span>
          <div className={styles.choiceGroup} role="group" aria-labelledby="emoji-label">
            {(Object.keys(EMOJI_LABEL) as EmojiPolicy[]).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={emojiPolicy === value}
                className={
                  emojiPolicy === value
                    ? `${styles.choiceButton} ${styles.choiceButtonActive}`
                    : styles.choiceButton
                }
                onClick={() => {
                  setEmojiPolicy(value);
                  setJustSaved(false);
                }}
              >
                {EMOJI_LABEL[value]}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="address-form">호칭</label>
          <input
            id="address-form"
            type="text"
            value={addressForm}
            onChange={(event) => {
              setAddressForm(event.target.value);
              setJustSaved(false);
            }}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="deadline-style">마감 표현</label>
          <input
            id="deadline-style"
            type="text"
            value={deadlineStyle}
            onChange={(event) => {
              setDeadlineStyle(event.target.value);
              setJustSaved(false);
            }}
          />
        </div>

        <button type="button" className={styles.saveButton} disabled={saveDisabled} onClick={() => void handleSave()}>
          저장
        </button>
        {saveError && (
          <p role="alert" className={styles.errorText}>
            {saveError}
          </p>
        )}
        {justSaved && !saveError && <p className={styles.savedText}>저장됨</p>}
      </div>
    </main>
  );
}
