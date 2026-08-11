'use client';

/**
 * UX-019 Observation Sample Management Screen — SampleList(`docs/UX.md:845-874`). `docs/Tasks.md`
 * T72. AC-081②(핵심 제약 — 원문 절대 노출 금지)·④(삭제 시 재집계).
 *
 * 🔴 **AC-081② — 이 파일이 렌더하는 것은 출처·수집 시각·지표 기여도(집계 숫자)뿐이다.**
 * `SampleListItem`에는 원문 필드가 애초에 없다(`apps/web/lib/samples/storage.ts` 타입에서부터
 * 배제) — 이 화면이 "인용문을 보여줄 방법" 자체가 존재하지 않는다.
 *
 * 🔴 삭제 후 재집계는 별도 코드가 없다 — `GET /api/samples`를 다시 호출하면 지표를 캐시하지
 * 않는 저장소(`docs/Database.md:254`)가 남은 행만으로 자동 재집계한다(`storage.ts`의
 * `deleteSample()` 헤더 주석 참조). 이 화면은 삭제 성공 시 그 표본을 로컬 목록에서만 제거한다
 * (같은 결과, 재조회 왕복을 아끼는 낙관적 갱신).
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import styles from '../observation-samples.module.css';

const LOAD_FAILED_MESSAGE = '불러오지 못했습니다, 다시 시도해주세요';
const DELETE_FAILED_MESSAGE = '삭제하지 못했습니다, 다시 시도해주세요';
const EMPTY_MESSAGE = '이 상대에 대해 수집된 표본이 없습니다';
const DELETE_CONFIRM_MESSAGE = '이 표본을 삭제하시겠습니까?';

const SOURCE_LABEL: Record<'manual' | 'github', string> = { manual: '수동 표시', github: 'GitHub' };

interface IndicatorContribution {
  sentenceCount: number;
  emojiCount: number;
  charCount: number;
  hedgeCount: number;
  addressFormKind: string | null;
  deadlineMentionKind: string | null;
}

interface SampleListItem {
  id: string;
  counterpart: string;
  source: 'manual' | 'github';
  collectedAt: string;
  indicatorContribution: IndicatorContribution;
}

export default function ObservationSamplesCounterpartPage() {
  const params = useParams<{ counterpart: string }>();
  const counterpart = decodeURIComponent(params.counterpart ?? '');

  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [samples, setSamples] = useState<SampleListItem[]>([]);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const fetchSamples = useCallback(async () => {
    try {
      const response = await fetch('/api/samples');
      if (!response.ok) {
        setStatus('error');
        return;
      }
      const body = (await response.json()) as { samples: SampleListItem[] };
      setSamples(body.samples.filter((sample) => sample.counterpart === counterpart));
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [counterpart]);

  /* eslint-disable react-hooks/set-state-in-effect -- fetch-on-mount, pair-protocols/[counterpart]/page.tsx와 같은 근거 */
  useEffect(() => {
    void fetchSamples();
  }, [fetchSamples]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function retry() {
    setStatus('loading');
    void fetchSamples();
  }

  function requestDelete(id: string) {
    setDeleteTargetId(id);
  }

  function cancelDelete() {
    setDeleteTargetId(null);
  }

  // 🔴 AC-081④ — 이 클릭 하나만 삭제를 실행한다(같은 destructive-action 확인 패턴,
  // terminology/page.tsx 선례). 실패는 그 행에만 인라인 표시하고 목록에서 지우지 않는다
  // (`docs/UX.md:845` Failure "the sample is retained, retry available").
  async function confirmDelete() {
    if (!deleteTargetId) return;
    const id = deleteTargetId;
    setDeleting(true);
    setRowErrors((previous) => ({ ...previous, [id]: '' }));
    try {
      const response = await fetch(`/api/samples/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        setRowErrors((previous) => ({ ...previous, [id]: DELETE_FAILED_MESSAGE }));
        return;
      }
      setSamples((previous) => previous.filter((sample) => sample.id !== id));
      setDeleteTargetId(null);
    } catch {
      setRowErrors((previous) => ({ ...previous, [id]: DELETE_FAILED_MESSAGE }));
    } finally {
      setDeleting(false);
    }
  }

  if (status === 'loading') {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>{counterpart}</h1>
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
        <h1 className={styles.title}>{counterpart}</h1>
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
      <Link href="/observation-samples" className={styles.backLink}>
        ← 관측 표본 목록
      </Link>
      <h1 className={styles.title}>{counterpart}</h1>

      {samples.length === 0 ? (
        <p className={styles.emptyMessage}>{EMPTY_MESSAGE}</p>
      ) : (
        <ul className={styles.sampleList}>
          {samples.map((sample) => {
            const isDeleteTarget = deleteTargetId === sample.id;
            return (
              <li key={sample.id} className={styles.sampleItem}>
                {/* AC-081② — 여기 렌더되는 것은 출처·수집 시각뿐이다. 원문/인용문은 데이터
                    자체에 없다(SampleListItem 타입 참조). */}
                <span className={styles.sourceTag}>{SOURCE_LABEL[sample.source]}</span>
                <span className={styles.collectedAt}>
                  {new Date(sample.collectedAt).toLocaleString()}
                </span>
                {!isDeleteTarget && (
                  <button type="button" className={styles.deleteButton} onClick={() => requestDelete(sample.id)}>
                    삭제
                  </button>
                )}
                {isDeleteTarget && (
                  <div role="alert" className={styles.confirmBox}>
                    <p>{DELETE_CONFIRM_MESSAGE}</p>
                    <div className={styles.confirmActions}>
                      <button type="button" disabled={deleting} onClick={() => void confirmDelete()}>
                        삭제
                      </button>
                      <button type="button" onClick={cancelDelete}>
                        취소
                      </button>
                    </div>
                  </div>
                )}
                {rowErrors[sample.id] && (
                  <p role="alert" className={styles.errorText}>
                    {rowErrors[sample.id]}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
