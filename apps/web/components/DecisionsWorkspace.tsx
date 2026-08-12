'use client';

/**
 * T27 — UX-008 Decision Summary & Unresolved Detector View 본체. `docs/UX.md` UX-008
 * (AC-019, AC-020, AC-038, AC-050, AC-064②). 진입은 nav "Decisions" 항목이며(구현 완료 후
 * `PrimaryNav.tsx`의 `implemented` 플래그는 오케스트레이터가 켠다 — 이 태스크 범위 밖), 이
 * 화면 자체는 `TicketWorkspace`(T25)와 달리 세션에서 원문을 읽지 않고 사용자가 직접 붙여넣는다
 * (`docs/UX.md` UX-008 Primary Actions "Paste/enter thread text").
 *
 * States: Empty(첫 Generate 클릭 전) / Loading(요약 생성 중) / Error(실패, 재시도, 입력 보존) /
 * Result(Decision/Owner/Deadline/결정 권한 상태 표 + 별도 미확정 경고 목록). 폼(입력창 +
 * Generate 버튼)은 상태와 무관하게 항상 렌더한다 — Secondary Action "Re-run with edited thread
 * text"(UX-008)가 Result 상태에서도 입력을 편집해 곧바로 재생성할 수 있어야 하기 때문이다
 * (`SenderPanel.tsx`의 "실행"/"다시 시도" 같은 버튼 재사용 관례를 그대로 따른다).
 */
import { useState } from 'react';
import type { DecisionItem, SummaryResult, UnresolvedItem } from '@cross-border/core';
import { NON_LIVE_NOTICE } from '../lib/non-live-notice';
import styles from './DecisionsWorkspace.module.css';

type Status = 'empty' | 'loading' | 'error' | 'result';

const MISSING_FIELD_LABELS: Record<UnresolvedItem['missingFields'][number], string> = {
  owner: '담당자',
  dueDate: '기한',
};

/** AC-020 — 근거 없는 담당자·기한은 `null`로 온다. `??`/`||` 폴백이 아니라 명시적 분기로만
 * "미정"을 렌더한다 — 폴백 연산자는 빈 문자열 등 의도치 않은 falsy 값까지 같이 삼킬 수 있어
 * 백엔드 계약(널 아니면 실제 값)을 조용히 위반해도 못 잡아낸다(T25/AC-062 리뷰 교훈). */
function cellText(value: string | null): string {
  return value === null ? '미정' : value;
}

export function DecisionsWorkspace() {
  const [threadText, setThreadText] = useState('');
  const [status, setStatus] = useState<Status>('empty');
  const [summary, setSummary] = useState<SummaryResult | null>(null);

  async function runSummary(text: string) {
    setStatus('loading');
    try {
      const response = await fetch('/api/summary', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ threadText: text, context: { channel: 'web' } }),
      });
      if (!response.ok) {
        setStatus('error');
        return;
      }
      const body = (await response.json()) as SummaryResult;
      setSummary(body);
      setStatus('result');
    } catch {
      setStatus('error');
    }
  }

  function handleGenerate() {
    void runSummary(threadText);
  }

  const canGenerate = threadText.trim() !== '' && status !== 'loading';

  return (
    <div>
      <div className={styles.fieldGroup}>
        <label htmlFor="decisions-thread-text">스레드 텍스트</label>
        <textarea
          id="decisions-thread-text"
          className={styles.textarea}
          value={threadText}
          onChange={(event) => setThreadText(event.target.value)}
        />
      </div>

      <button
        type="button"
        className={styles.generateButton}
        onClick={handleGenerate}
        disabled={!canGenerate}
      >
        {status === 'loading' && <span aria-hidden="true" className={styles.spinner} />}
        {status === 'error' ? '다시 시도' : '요약 만들기'}
      </button>

      {status === 'empty' && (
        <p className={styles.emptyHint}>스레드 텍스트를 입력하고 요약을 생성하세요.</p>
      )}

      {status === 'loading' && (
        <p role="status" className={styles.loadingText}>
          요약 생성 중…
        </p>
      )}

      {status === 'error' && (
        <p role="alert" className={styles.errorText}>
          요약 생성에 실패했습니다. 스레드 텍스트는 그대로 보존되어 있습니다.
        </p>
      )}

      {status === 'result' && summary && <SummaryResultView summary={summary} />}
    </div>
  );
}

function SummaryResultView({ summary }: { summary: SummaryResult }) {
  return (
    <div>
      {/* AC-041, `docs/UX.md:920` — `TicketWorkspace`의 폴백 배지 관례와 동일. */}
      {summary.source !== 'live' && (
        <p role="status" className={styles.nonLiveNotice}>
          {NON_LIVE_NOTICE}
        </p>
      )}

      {/* M-1, `docs/UX.md:923` — "정상적으로 판정됐지만 비어 있음"과 "렌더링 버그로 빈 화면"이
          똑같이 보이면 안 된다. `decisions: []`는 유효한 정상 응답(AC-020 원칙)이므로 표 대신
          그 사실을 명시한다 — 아래 미확정 목록의 빈 상태 처리(:139)와 같은 패턴. */}
      {summary.decisions.length === 0 ? (
        <p className={styles.decisionsEmpty}>결정사항이 발견되지 않았습니다.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Decision</th>
              <th scope="col">Owner</th>
              <th scope="col">Deadline</th>
              <th scope="col">결정 권한 상태</th>
            </tr>
          </thead>
          <tbody>
            {summary.decisions.map((item, index) => (
              <DecisionRow key={index} item={item} />
            ))}
          </tbody>
        </table>
      )}

      {/* UX.md:544 — 표와 "별도"의 미확정 경고 목록. T44(planner Decision #121)가 더 정교하게
          다듬을 예정이지만, UX-008 States 자체가 Result 상태에 이 목록을 요구하므로 단순하고
          정확한 버전을 여기서 렌더한다 — 표 행에 접지 않는다. */}
      <section aria-label="미확정 항목" className={styles.unresolvedSection}>
        <h2 className={styles.sectionHeading}>미확정 항목</h2>
        {summary.unresolved.length === 0 ? (
          <p className={styles.unresolvedEmpty}>미확정 항목이 없습니다.</p>
        ) : (
          <ul className={styles.unresolvedList}>
            {summary.unresolved.map((item, index) => (
              <li key={index}>
                {item.decision} —{' '}
                {item.missingFields.map((field) => MISSING_FIELD_LABELS[field]).join(', ')} 미정
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function DecisionRow({ item }: { item: DecisionItem }) {
  return (
    <tr>
      <td>{item.decision}</td>
      <td>{cellText(item.owner)}</td>
      <td>{cellText(item.dueDate)}</td>
      {/* AC-050①②/AC-064②⑤ — `authorityStatus`는 판별 유니온이라 `불명`이면 근거가 없을 수
          있고, 판정값이면 근거가 항상 함께 있다. 값 자체는 `불명`을 포함해 항상 문자열로
          렌더한다 — 빈칸·아이콘 단독 표시 금지. 근거 문장은 같은 셀 안에 상태값 아래로
          쌓는다(5번째 열을 새로 만들지 않는다) — `TicketWorkspace.tsx`(T25)가 이미 값+근거를
          같은 블록에 쌓는 관례를 쓰고, 이 표는 4열 헤더가 AC-019로 고정돼 있어 열을 늘리면
          그 표를 스캔하기 어렵게 만들 뿐 UX.md가 요구하는 바도 아니다(UX-008은 이 배치를
          명시하지 않는다 — UX-007과 달리). 근거가 없으면(`불명`+`null`) 아무것도 지어내지
          않는다(AC-020 원칙과 동일). */}
      <td>
        <p className={styles.authorityValue}>{item.authorityStatus}</p>
        {item.authorityEvidence && (
          <p className={styles.authorityEvidence}>{item.authorityEvidence}</p>
        )}
      </td>
    </tr>
  );
}
