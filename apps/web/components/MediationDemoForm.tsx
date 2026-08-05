'use client';

import { useState } from 'react';
import type { MediationResult, UrgencyLevel } from '@cross-border/core';
import { BackTranslationPreview } from './BackTranslationPreview';
import { UrgencyPanel } from './UrgencyPanel';

type Status = 'idle' | 'loading' | 'error' | 'success';

/**
 * 🔴 `POST /api/mediate`를 실제로 호출하는 **최소** 폼 — UX-004 전체 화면이 아니다.
 * `apps/web/app/(app)/mediate/page.tsx`의 원래 스캐폴드 주석("실제 화면은 T12/T13이 채운다")을
 * 그대로 존중한다: 티켓 링크·공휴일 충돌·2패널 레이아웃 등은 이 컴포넌트가 다루지 않는다
 * (T12/T13 등의 범위). 이 폼이 존재하는 유일한 이유는 T6의 AC-030 동적 검증("브라우저 네트워크
 * 탭에서 역번역 요청 1건을 실행")이 열 수 있는 실제 페이지가 필요하기 때문이다 — T12/T13이 실제
 * UX-004를 완성하면 이 컴포넌트는 그 화면에 흡수·대체될 수 있다.
 * 🔴 T8이 긴급도 결과 표시 + override(`UrgencyPanel`)를 이 폼에 통합했다(AC-003/AC-004) —
 * 이 폼 범위 안에서 "이후 처리에 반영"은 override 값을 **다음 "실행" 요청의
 * `context.urgencyOverride`에 싣는 것**을 뜻한다. 이 폼에는 "Approve & Send" 같은 별도 발송
 * 단계가 아직 없어(T14 범위), override가 영향을 주는 "이후 처리"는 현재 이 한 지점뿐이다.
 */
export function MediationDemoForm() {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<MediationResult | null>(null);
  // 🔴 AC-004 — 사용자가 override로 선택한 등급. null이면 "override 안 함"(C1 판정을 그대로
  // 쓴다)이며 기본값을 지어내지 않는다. 새 결과가 오면 서버 응답의 `urgency`가 이미 이 값을
  // 반영한 값이므로(route.ts) 초기화해 다음 override 사이클을 준비한다.
  const [urgencyOverride, setUrgencyOverride] = useState<UrgencyLevel | null>(null);
  // 🔴 M1(reviewer 라운드 → 수정) — 현재 화면에 표시 중인 `result`를 만든 요청에 실제로 실어
  // 보낸 override 값. `urgencyOverride`는 다음 선택을 위해 응답을 받자마자 리셋되지만, 이 값은
  // 그 응답에 대응하는 채로 남아 있는다 — override 반영 후 재실행해도 "사용자가 등급을
  // 조정했습니다" 안내가 사라지지 않게 해서, 화면에 "override로 나온 등급 + override 전 근거
  // 문장"만 남아 AI가 그 근거로 판단한 것처럼 보이는 모순을 막는다. F1 계약(`packages/core/src/
  // contract.ts`)에는 필드를 추가하지 않는다 — 화면 로컬 상태만으로 해결 가능하다.
  const [appliedOverride, setAppliedOverride] = useState<UrgencyLevel | null>(null);

  async function runMediation() {
    setStatus('loading');
    // 이번 요청에 실제로 실어 보낼 override 값 — 응답을 받은 뒤 `urgencyOverride`는 다음 선택을
    // 위해 리셋되므로, 리셋 전에 따로 붙잡아 둔다.
    const requestOverride = urgencyOverride;
    try {
      const response = await fetch('/api/mediate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text,
          recipient: null,
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
      setAppliedOverride(requestOverride);
      setUrgencyOverride(null);
      setStatus('success');
    } catch {
      setStatus('error');
    }
  }

  // 화면에 보일 긴급도 — override를 골랐으면 그 값을 즉시 반영하고(서버 재호출 없이), 아니면
  // 마지막 결과의 등급을 보여준다(AC-004 "override한 값이 이후 처리에 반영된다"의 화면 절반).
  const displayedUrgency = urgencyOverride ?? result?.urgency ?? null;
  // 사용자가 지금 select를 만지는 중이면(아직 제출 전) 그 값과 마지막 결과를 비교해 즉시
  // 판정하고, 그렇지 않으면(제출 완료 후) 이번 결과를 만든 요청에 override가 실제로 실려
  // 있었는지로 판정한다 — 그래야 재실행 후에도 안내가 유지된다(M1).
  const isOverridden =
    urgencyOverride !== null ? urgencyOverride !== result?.urgency : appliedOverride !== null;

  return (
    <div>
      <label htmlFor="mediation-demo-text">메시지</label>
      <textarea
        id="mediation-demo-text"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <button
        type="button"
        onClick={runMediation}
        disabled={text.trim() === '' || status === 'loading'}
      >
        실행
      </button>
      {/* Major 1(QA 6차 NO-GO → 수정) — `docs/UX.md:912` Duplicate/double-click submission +
          `docs/UX.md:904` Loading("never a bare unlabeled spinner"). */}
      {status === 'loading' && <p role="status">처리 중…</p>}
      {status === 'error' && <p role="alert">처리에 실패했습니다</p>}
      {status === 'success' && result && (
        <>
          {/* 🔴 기존 T6 테스트 픽스처처럼 `urgency`가 없는 응답도 있을 수 있어(과거 스텁 응답
              형태) displayedUrgency가 없으면 이 패널만 생략한다 — 나머지 결과 표시는 그대로다. */}
          {displayedUrgency && (
            <UrgencyPanel
              urgency={displayedUrgency}
              urgencyReason={result.urgencyReason}
              isOverridden={isOverridden}
              onOverride={setUrgencyOverride}
            />
          )}
          <BackTranslationPreview
            originalText={text}
            backTranslation={result.backTranslation}
            warnings={result.warnings}
            source={result.source}
          />
          {/* Major 4(QA 6차 NO-GO → 수정) — `docs/UX.md:924` "Personalization-off indicator"
              (AC-059③/AC-066③). `personalizationApplied === false`를 무음 처리하지 않는다. */}
          {result.personalizationApplied === false && (
            <p role="status">개인화 미적용 — 기본 변환만 적용되었습니다</p>
          )}
        </>
      )}
    </div>
  );
}
