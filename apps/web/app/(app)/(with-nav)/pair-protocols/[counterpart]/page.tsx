'use client';

/**
 * UX-011 Pair Communication Protocol Screen — 상대별 상세(4항목 합의·저장, 배지). `docs/UX.md`
 * UX-011. `docs/Tasks.md` T41. AC-037, AC-075.
 *
 * 🔴 이 화면은 `RecipientAutoSelected`/`RecipientCandidates`/`MismatchBanner`(UX-018/T70,
 * #34 P2 묶음)를 렌더하지 않는다 — 그 데이터 출처가 아직 없다(T64~T71 전부 `todo`). UX-011
 * Failure 행이 이 경우를 명시적으로 정상 상태로 취급한다("Mismatch-check data fails to load →
 * the banner area simply doesn't render... this is advisory data... its absence is never an
 * error state of its own"). AuthorshipShown 배지는 `inference_draft`(ⓐ)를 만드는 쓰기 경로가
 * 아직 없어(Stage 4 확정, `POST /api/protocol/confirm-inference`, 같은 #34 묶음) 실제로는
 * ⓑ/ⓒ/ⓓ 세 값만 관측된다 — 렌더 자체는 4값 전부 지원한다(UX-011 States 요구).
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
  }, [fetchProtocol]);
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
    } catch {
      setSaveError(SAVE_FAILED_MESSAGE);
    } finally {
      setSaving(false);
    }
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
