'use client';

import { useState } from 'react';
import type { MediationResult } from '@cross-border/core';
import { BackTranslationPreview } from './BackTranslationPreview';

type Status = 'idle' | 'loading' | 'error' | 'success';

/**
 * 🔴 `POST /api/mediate`를 실제로 호출하는 **최소** 폼 — UX-004 전체 화면이 아니다.
 * `apps/web/app/(app)/mediate/page.tsx`의 원래 스캐폴드 주석("실제 화면은 T12/T13이 채운다")을
 * 그대로 존중한다: 긴급도 override·티켓 링크·공휴일 충돌·2패널 레이아웃 등은 이 컴포넌트가
 * 다루지 않는다(T8/T12/T13 등의 범위). 이 폼이 존재하는 유일한 이유는 T6의 AC-030 동적 검증
 * ("브라우저 네트워크 탭에서 역번역 요청 1건을 실행")이 열 수 있는 실제 페이지가 필요하기
 * 때문이다 — T12/T13이 실제 UX-004를 완성하면 이 컴포넌트는 그 화면에 흡수·대체될 수 있다.
 */
export function MediationDemoForm() {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<MediationResult | null>(null);

  async function runMediation() {
    setStatus('loading');
    try {
      const response = await fetch('/api/mediate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text,
          recipient: null,
          context: { languageDirection: 'ko-en', channel: 'web' },
        }),
      });
      if (!response.ok) {
        setStatus('error');
        return;
      }
      const body = (await response.json()) as MediationResult;
      setResult(body);
      setStatus('success');
    } catch {
      setStatus('error');
    }
  }

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
