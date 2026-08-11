'use client';

/**
 * UX-019 Observation Sample Management Screen — CounterpartList(`docs/UX.md:845-874`). `docs/Tasks.md`
 * T72. AC-081④(primary), AC-080⑤.
 *
 * 🔴 **"화면 신설이므로 ux-design 라우팅 필요"는 stale다(Duty to Refute)** — `docs/UX.md:845`
 * UX-019가 이미 States/Business Rules/Accessibility까지 완결적으로 스펙되어 있다(v6.0,
 * T65/T66/T71과 같은 반복 패턴). 라우팅 없이 직접 구현했다.
 *
 * `GET /api/samples`(T71이 만든 라우트에 이 태스크가 추가) 한 번으로 상대별 롤업 전체를 받는다
 * — 이 화면은 `counterparts`만 쓰고, `samples`는 상세 화면(`[counterpart]/page.tsx`)이 같은
 * 응답을 재사용해 필터링한다(쿼리 파라미터가 계약에 없다).
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './observation-samples.module.css';

const LOAD_FAILED_MESSAGE = '불러오지 못했습니다, 다시 시도해주세요';
const EMPTY_MESSAGE = '아직 수집된 관측 표본이 없습니다';

interface CounterpartSampleSummary {
  counterpart: string;
  total: number;
  bySource: { manual: number; github: number };
}

export default function ObservationSamplesPage() {
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [counterparts, setCounterparts] = useState<CounterpartSampleSummary[]>([]);

  const fetchOverview = useCallback(async () => {
    try {
      const response = await fetch('/api/samples');
      if (!response.ok) {
        setStatus('error');
        return;
      }
      const body = (await response.json()) as { counterparts: CounterpartSampleSummary[] };
      setCounterparts(body.counterparts);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount, pair-protocols/page.tsx와 같은 근거 */
  useEffect(() => {
    void fetchOverview();
  }, [fetchOverview]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function retry() {
    setStatus('loading');
    void fetchOverview();
  }

  if (status === 'loading') {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>관측 표본</h1>
        <div className={styles.skeleton} aria-busy="true" aria-label="관측 표본 불러오는 중">
          <div className={styles.skeletonRow} />
          <div className={styles.skeletonRow} />
        </div>
      </main>
    );
  }

  if (status === 'error') {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>관측 표본</h1>
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
      <h1 className={styles.title}>관측 표본</h1>
      <p className={styles.lead}>
        상대별로 수집된 관측 표본의 건수와 출처를 확인하고 삭제할 수 있습니다. 원문은 저장되지
        않습니다 — 건수·출처·수집 시각만 보관됩니다.
      </p>

      {counterparts.length === 0 ? (
        <p className={styles.emptyMessage}>{EMPTY_MESSAGE}</p>
      ) : (
        <ul className={styles.list}>
          {counterparts.map((entry) => (
            <li key={entry.counterpart} className={styles.item}>
              <Link href={`/observation-samples/${encodeURIComponent(entry.counterpart)}`}>
                <span className={styles.itemCounterpart}>{entry.counterpart}</span>
                <span className={styles.itemMeta}>
                  {entry.total}건 (수동 표시 {entry.bySource.manual} · GitHub {entry.bySource.github})
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
