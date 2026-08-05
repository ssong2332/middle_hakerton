'use client';

import { useState } from 'react';
import type { MediationResult, UrgencyLevel } from '@cross-border/core';
import { RecipientPanel } from './RecipientPanel';
import { SenderPanel } from './SenderPanel';

type MediationStatus = 'idle' | 'loading' | 'error' | 'success';
type ApproveStatus = 'idle' | 'sending' | 'sent' | 'error';

/**
 * 🔴 Critical(reviewer REJECTED → 수정) — 승인 대상을 라이브 state(`text`/`recipient`/
 * `urgencyOverride`)에서 읽으면, 실행 성공 후(재실행 없이) 원문을 편집하고 승인을 누를 때
 * 검토한 적 없는 새 텍스트가 발송될 수 있다. 성공 응답 시점에 이 스냅샷을 별도 state로
 * 고정하고, `handleApprove()`는 항상 이 스냅샷 값만 전송한다 — 라이브 state를 절대 참조하지
 * 않는다. `urgency`는 서버가 실제로 반영한 값(`body.urgency`)을 담는다 — 성공 후 재실행 없이
 * 긴급도만 override하면 배지는 즉시 바뀌지만(AC-004, 화면 미리보기), 그 override는 "다음 실행"
 * 요청에만 실제로 반영되므로 스냅샷은 그 override를 담지 않는다(검토되지 않은 값이기 때문).
 */
interface ApprovalSnapshot {
  text: string;
  recipient: string;
  urgency: UrgencyLevel;
  transformed: string;
}

const srOnlyStyle = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

// Major 4(reviewer REJECTED → 수정) — AC-009 "발신자·수신자 패널이 나란히 표시된다"가 시각적으로
// 구현되지 않았다(리포 전체에 스타일이 0건 — 이 클러스터가 만든 회귀는 아니다). 정교한 디자인
// 시스템 없이 최소 flex 레이아웃으로 AC-009 조건("나란히 비교 가능")만 충족한다.
const twoPanelStyle = { display: 'flex', gap: '24px', alignItems: 'flex-start' } as const;
const panelColumnStyle = { flex: '1 1 0%', minWidth: 0 } as const;

/**
 * T13/T14 — UX-004 Two-Panel Mediation Workspace 본체(AC-009). 발신자 패널(`SenderPanel`)과
 * 수신자 패널(`RecipientPanel`)을 조합하고, `POST /api/mediate`(실행) → `POST /api/messages`
 * (승인 후 전송, AC-010)의 두 호출을 소유한다.
 *
 * 🔴 `apps/web/components/MediationDemoForm.tsx`(T6의 최소 하네스)를 흡수·대체한다 — 그 파일의
 * 헤더 주석이 "T12/T13이 실제 UX-004를 완성하면 이 컴포넌트는 그 화면에 흡수·대체될 수 있다"고
 * 예고했다. `UrgencyPanel`/`BackTranslationPreview`(T8/T6)는 `SenderPanel` 안에서 그대로 재사용된다.
 *
 * 🔴 AC-010 — `POST /api/messages`를 호출하는 코드 경로는 `handleApprove`(승인 버튼 클릭 핸들러)
 * 하나뿐이다. `handleRunMediation`이나 다른 어떤 effect도 이 함수를 자동 호출하지 않는다.
 *
 * ## T16 — 진행 표시 방식(판단 근거, 2026-08-05)
 * `docs/UX.md` UX-004 States "Loading"·Visual Design Brief(`docs/UX.md:1013`)이 요구하는
 * "단계 라벨 진행 표시"를 `SenderPanel`이 로딩 중 렌더한다(`분류 중 → 변환 중 → 역번역 중`,
 * UX.md의 예시 문구를 그대로 씀). 이 라우트(`POST /api/mediate`)는 서버에서 C1→C2→C4를 순차
 * 실행한 뒤 **한 번에** 응답하므로(`apps/web/app/api/mediate/route.ts`), 클라이언트는 서버가
 * 지금 어느 단계인지 알 방법이 **물리적으로 없다**(SSE·폴링 같은 새 실시간 인프라를 도입하지
 * 않는다 — `docs/Architecture.md` "실시간이 필요 없는 이유", 이 태스크 지시사항).
 *
 * 두 방식을 검토했다:
 * - **(채택) 정적 전체 문구** — 로딩 중 내내 `"분류 중 → 변환 중 → 역번역 중"`을 그대로 보여준다.
 * - **(기각) 타이머 기반 의사(pseudo) 진행** — `setInterval`로 일정 시간마다 표시 단계를
 *   "분류 중" → "변환 중" → "역번역 중" 순으로 바꾼다.
 *
 * 정적 문구를 택한 이유: ① `docs/UX.md:1013`의 예시가 문자 그대로 이 조인 문자열이라 가장
 * 직접적인 근거다. ② 의사 타이머는 실제 서버 진행과 무관하게 시간만으로 단계를 넘기므로, 예를
 * 들어 C2(톤 변환)가 예상보다 오래 걸리는 동안 화면은 이미 "역번역 중"을 보여줄 수 있다 —
 * 이것은 실제 상태를 지어내 보여주는 것과 같은 종류의 문제다(`docs/CodingRules.md` Error
 * Handling "없는 값을 지어내지 않는다"를 UI 상태에도 같은 정신으로 적용). ③ 정적 문구는 스피너가
 * 아니므로 "멈춰 보이지 않는다"(AC-029)는 요구를 이미 만족한다 — 스피너가 "멈춰 보이는" 것은
 * 애니메이션이 멎기 때문이고, 애초에 애니메이션이 없는 서술형 문구에는 "멎는 순간"이 없다.
 * ④ 새 타이머·정리(cleanup) 로직이 없어 컴포넌트가 더 단순하고, 테스트에 fake timer가 필요 없다.
 * 서버가 실제 단계별 진행을 노출하게 되면(향후 범위 밖) 그때 실제 값 기반으로 교체한다.
 */
export function MediationWorkspace() {
  const [text, setText] = useState('');
  const [recipient, setRecipient] = useState('');
  const [status, setStatus] = useState<MediationStatus>('idle');
  const [result, setResult] = useState<MediationResult | null>(null);
  // AC-004 override 상태 — `MediationDemoForm`의 기존 판단을 그대로 옮긴다.
  const [urgencyOverride, setUrgencyOverride] = useState<UrgencyLevel | null>(null);
  const [appliedOverride, setAppliedOverride] = useState<UrgencyLevel | null>(null);

  // 승인 대상 최종문 — 중재 성공 시 result.transformed로 초기화되고, 승인 전 편집 가능하다
  // (`docs/UX.md` UX-004 Secondary Actions "Edit transformed text before approving").
  const [finalText, setFinalText] = useState('');
  // Critical — 승인 대상 스냅샷. 성공 시점에만 갱신되고, 이후 편집 중인 라이브 state와는 별개다.
  const [approvalSnapshot, setApprovalSnapshot] = useState<ApprovalSnapshot | null>(null);
  const [approveStatus, setApproveStatus] = useState<ApproveStatus>('idle');
  const [sentAt, setSentAt] = useState<string | null>(null);

  const displayedUrgency = urgencyOverride ?? result?.urgency ?? null;
  const isOverridden =
    urgencyOverride !== null ? urgencyOverride !== result?.urgency : appliedOverride !== null;

  // Major 1 — 승인 가능 여부는 `status==='success'`가 아니라 스냅샷 존재 여부로 판정한다.
  // 재실행이 실패해도(status가 'error'로 바뀌어도) 직전 성공 결과의 스냅샷은 남아 있으므로
  // 승인 가능 상태가 유지된다(`docs/UX.md` UX-004 Failure).
  const hasResult = approvalSnapshot !== null;
  // M2(reviewer 최종 APPROVED, Major 비차단 → 수정) — 재실행이 진행 중일 때(`status==='loading'`)
  // 그 사이 승인이 성공하면, 재실행 완료 후 스냅샷이 새 결과로 교체되어 "발송됨" 표시와 함께
  // 실제로 전송되지 않은 값이 남는 불일치가 생긴다(`docs/UX.md` UX-004 Validation "disabled
  // during Loading/Error" — Error는 Major 1에서 예외 처리했지만 Loading은 예외가 아니다).
  const isRunning = status === 'loading';
  // Critical — 라이브 원문/수신자가 스냅샷과 달라지면(재실행 없이 편집됐다는 뜻) 그 차이는 아직
  // 어떤 중재 결과로도 검토되지 않은 것이므로 승인을 막는다.
  //
  // M1(reviewer 최종 APPROVED, Major 비차단 → 수정) — 긴급도 override도 같은 규칙을 따른다.
  // override가 걸려 있고(`urgencyOverride !== null`) 그 값이 스냅샷의 등급과 다르면, 배지는
  // 이미 바뀌었지만 그 override는 아직 어떤 실행으로도 검토되지 않았다(override는 "다음 실행"
  // 요청에만 실제로 반영된다 — `handleRunMediation` 참조). text/recipient와 동일하게 재실행
  // 전까지 승인을 막아, 배지(문면)와 실제 전송값이 어긋나는 상태가 생기지 않게 한다.
  const isStale =
    approvalSnapshot !== null &&
    (text !== approvalSnapshot.text ||
      recipient !== approvalSnapshot.recipient ||
      (urgencyOverride !== null && urgencyOverride !== approvalSnapshot.urgency));

  // Major 6① — UX-004 Accessibility "A live region announces mediation completion/failure,
  // including when new Misread Risk ... appear."
  const liveAnnouncement =
    status === 'success'
      ? `중재가 완료되었습니다.${
          result && result.misreadRisks.length > 0
            ? ` 오해 위험 ${result.misreadRisks.length}건이 발견되었습니다.`
            : ''
        }`
      : status === 'error'
        ? '중재 처리에 실패했습니다.'
        : '';

  async function handleRunMediation() {
    setStatus('loading');
    // 새 실행을 시작하면 이전 승인 상태를 초기화한다 — 이전 결과에 대한 "발송됨" 상태가 새
    // 결과에 남아있으면 안 된다.
    setApproveStatus('idle');
    setSentAt(null);
    const requestOverride = urgencyOverride;
    try {
      const response = await fetch('/api/mediate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text,
          recipient: recipient || null,
          context: {
            languageDirection: 'ko-en',
            channel: 'web',
            urgencyOverride: requestOverride,
          },
        }),
      });
      if (!response.ok) {
        setStatus('error');
        return;
      }
      const body = (await response.json()) as MediationResult;
      setResult(body);
      setFinalText(body.transformed);
      // Critical — 이 실행이 실제로 검토·승인 가능한 대상이 되는 유일한 지점. text/recipient는
      // 이 요청을 만든 값 그대로, urgency는 서버가 반영한 값 그대로 고정한다.
      setApprovalSnapshot({
        text,
        recipient,
        urgency: body.urgency,
        transformed: body.transformed,
      });
      setAppliedOverride(requestOverride);
      setUrgencyOverride(null);
      setStatus('success');
    } catch {
      setStatus('error');
    }
  }

  // 🔴 AC-010 — 이 함수를 호출하는 코드 경로는 `RecipientPanel`의 승인 버튼 `onClick` 하나뿐이다.
  async function handleApprove() {
    // Critical — 스냅샷이 없거나(승인 대상 없음) 라이브 state가 스냅샷과 달라졌으면(검토 안 됨)
    // 전송하지 않는다. UI(disabled 버튼)가 1차 방어선이고, 이 검사는 2차 방어선이다.
    if (!approvalSnapshot || isStale) return;
    setApproveStatus('sending');
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          originalText: approvalSnapshot.text,
          finalText,
          aiSuggestedText: approvalSnapshot.transformed,
          urgency: approvalSnapshot.urgency,
          recipient: approvalSnapshot.recipient,
          recipientCountry: null,
          recipientTimezone: null,
          channel: 'web_mock',
          scheduledFor: null,
          mediationApplied: true,
        }),
      });
      if (!response.ok) {
        setApproveStatus('error');
        return;
      }
      const body = (await response.json()) as { sentAt: string };
      setSentAt(body.sentAt);
      setApproveStatus('sent');
    } catch {
      setApproveStatus('error');
    }
  }

  return (
    <div>
      {/* Major 6① — 시각적으로는 숨기고 스크린리더에만 노출한다(중복 시각 텍스트를 만들지
          않는다). 다른 상태 표시(`role="status"`, "처리 중…" 등)와는 별개의 영역이다. */}
      <div aria-live="polite" role="status" aria-label="중재 진행 상태 알림" style={srOnlyStyle}>
        {liveAnnouncement}
      </div>
      <div style={twoPanelStyle}>
        <div style={panelColumnStyle}>
          <SenderPanel
            text={text}
            onTextChange={setText}
            recipient={recipient}
            onRecipientChange={setRecipient}
            status={status}
            result={result}
            urgencyOverride={urgencyOverride}
            onOverride={setUrgencyOverride}
            isOverridden={isOverridden}
            displayedUrgency={displayedUrgency}
            onRunMediation={handleRunMediation}
            hasResult={hasResult}
          />
        </div>
        <div style={panelColumnStyle}>
          <RecipientPanel
            hasResult={hasResult}
            isStale={isStale}
            isRunning={isRunning}
            finalText={finalText}
            onFinalTextChange={setFinalText}
            onApprove={handleApprove}
            approveStatus={approveStatus}
            sentAt={sentAt}
          />
        </div>
      </div>
    </div>
  );
}
