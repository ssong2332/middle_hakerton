'use client';

/**
 * T25 — UX-007 Vent-to-Ticket View 본체. `docs/UX.md` UX-007 (AC-017, AC-018, AC-058, AC-062,
 * AC-064①). 진입은 오직 `RecipientPanel`의 "Convert to Task Ticket" 링크 하나뿐이다(AC-058) —
 * 이 컴포넌트는 그 클릭이 남긴 세션 데이터를 소비할 뿐, 자체 게이트를 만들지 않는다(`POST
 * /api/ticket`이 이미 자체 게이트를 만들지 않는 것과 같은 원칙, `docs/API.md`의 해당 라우트
 * "게이트" 행 참조).
 *
 * States: Loading(변환 진행 중) / Error(변환 실패, 원문 보존 + 재시도) / Result(4섹션 항상 렌더 +
 * 결정 권한 상태, 각 섹션 독립 편집 가능) — 여기에 이 태스크의 판단으로 추가한 "원본 없음" 상태
 * (`/ticket`에 직접 URL로 접근하는 등 `TICKET_DRAFT_SESSION_KEY`가 비어 있는 잔여 경로, UX.md가
 * 이 정확한 엣지 케이스를 명시하지 않아 architect/UX 스펙 문구 없이 이 태스크 범위에서 정한다) —
 * `docs/API.md` "POST /api/ticket" 게이트 행이 이 라우트를 직접 호출하는 잔여 표면은 UI 레벨
 * 보장의 한계라고 이미 명시한다.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TicketResult, TicketSections } from '@cross-border/core';
import { NON_LIVE_NOTICE } from '../lib/non-live-notice';
import { TICKET_DRAFT_SESSION_KEY } from '../lib/ticket-draft';
import styles from './TicketWorkspace.module.css';

const MEDIATE_ROUTE = '/mediate';

type Status = 'loading' | 'error' | 'result' | 'no-source';

type SectionKey = keyof TicketSections;

const SECTION_LABELS: Array<{ key: SectionKey; label: string }> = [
  { key: 'problem', label: '문제 정의' },
  { key: 'impact', label: '영향·리스크' },
  { key: 'request', label: '요청 사항' },
  { key: 'concernLevel', label: '우려 수준' },
];

/** "Use this ticket" 클릭 시 4섹션을 하나의 메시지 본문으로 조립한다(구현 판단 — `docs/UX.md`
 * UX-007이 정확한 포맷을 지정하지 않는다, Exit "the ticket content as the message to approve/
 * send"). 라벨을 그대로 살려 사람이 읽어도 어느 섹션인지 알 수 있게 한다. */
function assembleTicketMessage(sections: TicketSections): string {
  return SECTION_LABELS.map(({ key, label }) => `[${label}]\n${sections[key]}`).join('\n\n');
}

export function TicketWorkspace() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('loading');
  const [sourceText, setSourceText] = useState('');
  const [ticket, setTicket] = useState<TicketResult | null>(null);
  const [sections, setSections] = useState<TicketSections | null>(null);

  async function runConversion(text: string) {
    setStatus('loading');
    try {
      const response = await fetch('/api/ticket', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, context: { channel: 'web' } }),
      });
      if (!response.ok) {
        setStatus('error');
        return;
      }
      const body = (await response.json()) as TicketResult;
      setTicket(body);
      setSections(body.sections);
      setStatus('result');
    } catch {
      setStatus('error');
    }
  }

  // 🔴 `react-hooks/set-state-in-effect` — `MediationWorkspace.tsx`와 같은 근거로 이 한 줄만
  // 억제한다(`apps/web/app/(app)/(with-nav)/profile/page.tsx`의 fetch-on-mount 선례). 마운트
  // 시 1회만 실행 — 원본 텍스트는 이 화면 안에서 바뀌지 않는다(재시도는 handleRetry가 같은
  // sourceText로 다시 호출한다).
  /* eslint-disable react-hooks/set-state-in-effect -- mount 시 sessionStorage 읽기 + fetch, 위 근거 참조 */
  useEffect(() => {
    const stored = sessionStorage.getItem(TICKET_DRAFT_SESSION_KEY);
    if (stored === null) {
      setStatus('no-source');
      return;
    }
    setSourceText(stored);
    void runConversion(stored);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleRetry() {
    void runConversion(sourceText);
  }

  function handleSectionChange(key: SectionKey, value: string) {
    setSections((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  // 🔴 Exit "Use this ticket" — 편집된 4섹션을 조립해 `/mediate`가 복원할 초안으로 세션에 저장한다
  // (`apps/web/lib/ticket-draft.ts`). `TICKET_DRAFT_SESSION_KEY`를 원문에서 티켓 조립문으로
  // 덮어쓴다 — `MediationWorkspace`는 이 키가 "원문"인지 "티켓 조립문"인지 구분하지 않고 그대로
  // 작성창에 복원한다(단일 채널, 방향과 무관하게 "돌아갔을 때 채울 값" 하나).
  function handleUseTicket() {
    if (!sections) return;
    sessionStorage.setItem(TICKET_DRAFT_SESSION_KEY, assembleTicketMessage(sections));
    router.push(MEDIATE_ROUTE);
  }

  // 🔴 Exit "Back to message" — 세션의 원문을 그대로 둔 채 돌아간다(discard, 원본 free-text
  // 메시지가 그대로 보존되어야 한다는 Exit 스펙 그대로).
  function handleBackToMessage() {
    router.push(MEDIATE_ROUTE);
  }

  if (status === 'no-source') {
    return (
      <div className={styles.emptyState} role="alert">
        <p>원본 메시지를 찾을 수 없습니다. 중재 화면에서 다시 시도해 주세요.</p>
        <button type="button" className={styles.backButton} onClick={handleBackToMessage}>
          중재 화면으로 돌아가기
        </button>
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <p role="status" className={styles.loadingText}>
        티켓으로 변환하는 중…
      </p>
    );
  }

  if (status === 'error') {
    return (
      <div>
        <p role="alert" className={styles.errorText}>
          티켓 변환에 실패했습니다. 원문은 그대로 보존되어 있습니다.
        </p>
        <button type="button" className={styles.retryButton} onClick={handleRetry}>
          재시도
        </button>
        <button type="button" className={styles.backButton} onClick={handleBackToMessage}>
          Back to message
        </button>
      </div>
    );
  }

  if (!ticket || !sections) return null;

  return (
    <div>
      {/* MAJ-1(reviewer follow-up, AC-041 / docs/UX.md:920) — `SenderPanel.tsx`의 폴백 배지
          관례를 그대로 따른다: live가 아닌 응답(cache/fallback)이면 결과 근처에 항상 이 라벨을
          보여준다. `TicketResultBase.source`는 (`MediationResult.stepSources`와 달리) 4섹션 +
          결정 권한 상태 전체를 아우르는 단일 값이다(`packages/core/src/contract.ts`). */}
      {ticket.source !== 'live' && (
        <p role="status" className={styles.nonLiveNotice}>
          {NON_LIVE_NOTICE}
        </p>
      )}

      {SECTION_LABELS.map(({ key, label }) => (
        // MAJ-2(reviewer follow-up) — heading에 `id`를 달고 section이 `aria-labelledby`로
        // 가리켜 이름 있는 landmark로 노출한다(unnamed `role="region"`은 랜드마크 트리에서
        // 빠진다). 명시적 `role="region"`은 필요 없다 — 접근 가능한 이름이 있는 `<section>`은
        // 그 자체로 이미 region landmark로 노출된다. 이전에 `aria-labelledby`를 피했던 이유
        // (아래 `<textarea aria-label={label}>`와 접근 가능한 이름이 겹쳐 `getByLabelText` 류
        // 쿼리가 유일한 대상을 못 찾음)는 테스트 쿼리 쪽 문제이므로, 테스트를
        // `getByRole('textbox', { name: label })`로 바꿔 해소한다(section은 `role="region"`
        // 쿼리로 구분된다).
        <section
          key={key}
          aria-labelledby={`ticket-section-${key}-heading`}
          className={styles.sectionBlock}
        >
          <h2 id={`ticket-section-${key}-heading`} className={styles.sectionHeading}>
            {label}
          </h2>
          {key === 'concernLevel' && (
            <p className={styles.concernBadge}>
              <span aria-hidden="true" className={styles.concernIcon}>
                ▲
              </span>
              <span>{sections.concernLevel}</span>
            </p>
          )}
          <textarea
            id={`ticket-section-${key}`}
            aria-label={label}
            className={styles.sectionTextarea}
            value={sections[key]}
            onChange={(event) => handleSectionChange(key, event.target.value)}
          />
        </section>
      ))}

      {/* AC-050①/AC-064① — 읽기 전용 결정 권한 상태. 판정값이면 근거 문장이 항상 함께 있고
          (`TicketAuthority` 판별 유니온), `불명`이면 근거가 없을 수 있다 — 그 경우 근거 문장
          영역을 아예 렌더하지 않는다(빈 문자열을 지어내 채우지 않는다, AC-020 원칙). */}
      <section aria-label="결정 권한 상태" className={styles.authorityBlock}>
        <h2 className={styles.sectionHeading}>결정 권한 상태</h2>
        <p className={styles.authorityValue}>{ticket.decisionAuthority}</p>
        {ticket.decisionAuthorityEvidence && (
          <p className={styles.authorityEvidence}>{ticket.decisionAuthorityEvidence}</p>
        )}
      </section>

      <div className={styles.actions}>
        <button type="button" className={styles.useButton} onClick={handleUseTicket}>
          Use this ticket
        </button>
        <button type="button" className={styles.backButton} onClick={handleBackToMessage}>
          Back to message
        </button>
      </div>
    </div>
  );
}
