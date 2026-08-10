'use client';

/**
 * UX-011 Pair Communication Protocol Screen — 목록/진입 화면(`docs/UX.md` UX-011 Entry: "Nav
 * menu 'Pair Protocols' → select/enter a counterpart"). `docs/Tasks.md` T41. AC-037.
 *
 * 기존 규약이 있는 상대 목록은 `GET /api/pair-protocols`(T66, `docs/API.md`)를 그대로 재사용한다
 * — 이 라우트는 규약 값 자체가 아니라 식별자 목록만 반환하므로 T41/T42의 `GET /api/protocol`
 * 영역과 겹치지 않는다(`apps/web/app/api/pair-protocols/route.ts` 헤더 주석 참조). 상세(4항목
 * 값·저장)는 `[counterpart]/page.tsx`가 담당한다.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from './pair-protocols.module.css';

const LOAD_FAILED_MESSAGE = '불러오지 못했습니다, 다시 시도해주세요';
const EMPTY_MESSAGE = '아직 등록된 상대가 없습니다. 아래에서 상대를 지정해 규약을 시작하세요';
const INVALID_EMAIL_MESSAGE = '올바른 이메일 형식이 아닙니다';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function PairProtocolsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [counterparts, setCounterparts] = useState<string[]>([]);
  const [newCounterpart, setNewCounterpart] = useState('');
  const [openError, setOpenError] = useState<string | null>(null);

  const fetchCounterparts = useCallback(async () => {
    try {
      const response = await fetch('/api/pair-protocols');
      if (!response.ok) {
        setStatus('error');
        return;
      }
      const body = (await response.json()) as { counterparts: string[] };
      setCounterparts(body.counterparts);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount, terminology/page.tsx와 같은 근거 */
  useEffect(() => {
    void fetchCounterparts();
  }, [fetchCounterparts]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function retry() {
    setStatus('loading');
    void fetchCounterparts();
  }

  function openCounterpart() {
    const trimmed = newCounterpart.trim();
    if (!EMAIL_PATTERN.test(trimmed)) {
      setOpenError(INVALID_EMAIL_MESSAGE);
      return;
    }
    setOpenError(null);
    router.push(`/pair-protocols/${encodeURIComponent(trimmed)}`);
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

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>쌍방 규약</h1>
      <p className={styles.lead}>
        상대와 직설 허용·이모지·호칭·마감 표현을 합의해 저장합니다 — 합의된 값은 그 상대에게 보내는
        메시지에 우선 적용됩니다.
      </p>

      <section className={styles.openSection} aria-label="상대 지정">
        <h2 className={styles.sectionTitle}>상대 지정</h2>
        <div className={styles.field}>
          <label htmlFor="new-counterpart">상대 이메일</label>
          <input
            id="new-counterpart"
            type="text"
            value={newCounterpart}
            onChange={(event) => {
              setNewCounterpart(event.target.value);
              setOpenError(null);
            }}
          />
          {openError && (
            <p role="alert" className={styles.errorText}>
              {openError}
            </p>
          )}
        </div>
        <button
          type="button"
          className={styles.openButton}
          disabled={newCounterpart.trim().length === 0}
          onClick={openCounterpart}
        >
          열기
        </button>
      </section>

      <section aria-label="기존 상대 목록">
        {counterparts.length === 0 ? (
          <p className={styles.emptyMessage}>{EMPTY_MESSAGE}</p>
        ) : (
          <ul className={styles.list}>
            {counterparts.map((counterpart) => (
              <li key={counterpart} className={styles.item}>
                <Link href={`/pair-protocols/${encodeURIComponent(counterpart)}`}>{counterpart}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
