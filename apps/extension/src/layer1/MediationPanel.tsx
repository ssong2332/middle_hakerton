/**
 * UX-016 Universal Selection Mediation Panel — T56 서브셋(AC-052②, AC-053, AC-010, AC-066,
 * AC-028 + NotLoggedIn). 이 태스크 범위 밖(다른 태스크 소관): Interpret 모드(T59) · 수신자 후보
 * 탐지(T66) · Mark 모드(T71) · 실제 "입력창에 삽입" DOM 조작(T57, `registry.ts`).
 *
 * 🔴 파일명(PascalCase) — `docs/CodingRules.md` Naming "컴포넌트를 export하는 .tsx는
 * PascalCase" 규칙에 맞춰 T2 스캐폴드의 `panel.tsx`에서 이 이름으로 옮겼다(`git mv`, T56).
 *
 * 🔴 층 2 레지스트리(`registry.ts`)는 아직 `export {}`뿐인 순수 스텁이다(T57 소유,
 * `Layer2Adapter` 인터페이스 미정) — 여기서 그 계약을 대신 만들지 않는다. 대신 아래
 * `hasLayer2Adapter = false` 상수가 T57이 실제 조회 함수로 교체할 자리를 표시한다. 그 결과 이
 * 패널은 지금 **항상** ClipboardOnly다 — `docs/UX.md:763`가 이것을 "특수 상태가 아니라 일상
 * 케이스"로 명시한다(AC-053②③).
 *
 * 수신자 필드를 두지 않는다 — 수신자 후보 탐지(AC-067/068, T66)가 아직 없는 상태에서 수동 입력
 * 필드만 먼저 만들면 다음 라운드에 다시 손대야 한다. 필드가 아예 없으면 recipient는 항상
 * `null`이고, "수신자는 절대 필수가 아니다"(AC-066①)·"수신자를 지어내지 않는다"(AC-066④) 둘 다
 * 자동으로 성립한다 — PersonalizationOff 표시(AC-066③)는 `result.personalizationApplied`를
 * 그대로 읽는다.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { MediationResult } from '@cross-border/core';
import { callMediationApi } from '../shared/api';
import { getStoredToken } from '../shared/token-storage';
import { NON_LIVE_NOTICE } from '../shared/non-live-notice';

export interface MediationPanelProps {
  initialText: string;
  onClose: () => void;
}

type Status = 'checkingAuth' | 'notLoggedIn' | 'idle' | 'loading' | 'success' | 'error';

// 🔴 T57 seam — 지금은 항상 false. T57이 registry.ts에 실제 조회 함수를 채우면 이 상수를
// 그 호출로 바꾼다(`docs/CodingRules.md` Directory Rules — layer1은 layer2를 import하지 않는다).
const hasLayer2Adapter = false;

const APP_ORIGIN = (import.meta.env.VITE_APP_ORIGIN as string | undefined) ?? '';

// 🔴 M-3(reviewer) — `navigator.clipboard`가 아예 없는 비-보안 컨텍스트(`http://` 호스트 페이지)
// 를 위한 `execCommand('copy')` 폴백. 실패하면 false를 반환해 handleCopy가 에러 메시지를 보여주게
// 한다 — 실패를 삼키지 않는다.
function fallbackCopyToClipboard(text: string): boolean {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function MediationPanel({ initialText, onClose }: MediationPanelProps) {
  const [status, setStatus] = useState<Status>('checkingAuth');
  const [text, setText] = useState(initialText);
  const [result, setResult] = useState<MediationResult | null>(null);
  const [finalText, setFinalText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // 🔴 M-4(reviewer) — `getStoredToken()`이 reject해도(예: `chrome.storage.session`의 access
  // level이 아직 올라가기 전 race) "확인 중…"에 무한히 머물지 않고 NotLoggedIn으로 빠진다.
  useEffect(() => {
    let cancelled = false;
    getStoredToken()
      .then((token) => {
        if (!cancelled) setStatus(token ? 'idle' : 'notLoggedIn');
      })
      .catch(() => {
        if (!cancelled) setStatus('notLoggedIn');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') onClose();
  }

  // 🔴 AC-010 — 이 함수를 호출하는 코드 경로는 "중재 실행" 버튼의 명시적 클릭 하나뿐이다.
  async function runMediation() {
    setStatus('loading');
    setErrorMessage(null);
    setCopyError(null);
    const response = await callMediationApi({
      text,
      recipient: null,
      context: { languageDirection: 'ko-en', channel: 'extension' },
    });
    if (!response.ok) {
      if (response.reason === 'not-logged-in') {
        setStatus('notLoggedIn');
        return;
      }
      setErrorMessage(response.error.message);
      setStatus('error');
      return;
    }
    setResult(response.data);
    setFinalText(response.data.transformed);
    setCopied(false);
    setStatus('success');
  }

  // 🔴 AC-010/AC-053 — 클립보드 복사는 이 명시적 클릭 핸들러 하나에서만 일어난다.
  // 🔴 M-3(reviewer) — `navigator.clipboard.writeText`는 비-보안(`http://`) 호스트 페이지에서
  // `navigator.clipboard` 자체가 없거나, 문서 포커스 상실·권한 거부로 reject할 수 있다. 조용히
  // 죽지 않고(UX-016 Failure "Copy는 절대 dead end가 아니다") 눈에 보이는 실패 메시지를 보여준다.
  // 보안 컨텍스트가 아니라 Clipboard API 자체가 없는 경우엔 `execCommand('copy')` 폴백을 먼저
  // 시도한다.
  async function handleCopy() {
    setCopyError(null);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(finalText);
      } else if (!fallbackCopyToClipboard(finalText)) {
        throw new Error('clipboard unavailable');
      }
      setCopied(true);
    } catch {
      setCopied(false);
      setCopyError('클립보드 복사에 실패했습니다. 텍스트를 직접 선택해 복사해 주세요.');
    }
  }

  const c2Source = result?.stepSources?.c2 ?? result?.source;
  const showFallbackNotice = status === 'success' && result !== null && c2Source !== 'live';

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="중재 패널"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      style={panelStyle}
    >
      <div style={headerStyle}>
        <span>중재 패널</span>
        <button type="button" onClick={onClose} aria-label="닫기" style={closeButtonStyle}>
          ×
        </button>
      </div>

      {status === 'checkingAuth' && <p role="status">확인 중…</p>}

      {status === 'notLoggedIn' && (
        <div>
          <p role="alert">로그인이 필요합니다. 웹앱에서 먼저 확장을 연결해 주세요.</p>
          {APP_ORIGIN && (
            <a href={`${APP_ORIGIN}/extension/connect`} target="_blank" rel="noopener noreferrer">
              {APP_ORIGIN}/extension/connect 열기
            </a>
          )}
        </div>
      )}

      {(status === 'idle' ||
        status === 'loading' ||
        status === 'error' ||
        status === 'success') && (
        <>
          <label htmlFor="cbm-panel-text">선택한 텍스트</label>
          <textarea
            id="cbm-panel-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={status === 'loading'}
          />
          <button
            type="button"
            onClick={() => void runMediation()}
            disabled={text.trim() === '' || status === 'loading'}
          >
            {status === 'error' ? '다시 시도' : '중재 실행'}
          </button>

          {status === 'loading' && <p role="status">분류 중 → 변환 중 → 역번역 중</p>}
          {status === 'error' && errorMessage && <p role="alert">{errorMessage}</p>}

          {status === 'success' && result && (
            <div>
              <p role="status">긴급도: {result.urgency}</p>
              {result.personalizationApplied === false && (
                <p role="status">개인화 미적용 — 기본 변환만 적용되었습니다</p>
              )}
              {showFallbackNotice && <p role="status">{NON_LIVE_NOTICE}</p>}

              <label htmlFor="cbm-panel-final-text">변환된 메시지</label>
              <textarea
                id="cbm-panel-final-text"
                value={finalText}
                onChange={(event) => {
                  setFinalText(event.target.value);
                  setCopied(false);
                  setCopyError(null);
                }}
              />

              <p>역번역: {result.backTranslation}</p>
              <p style={{ fontSize: '11px' }}>
                완전한 검증이 아니라 큰 오역을 걸러내는 1차 안전장치입니다.
              </p>

              <div>
                {/* AC-053①②③④ — Copy는 결과가 있을 때만 활성화된다. Insert는 hasLayer2Adapter가
                    false인 한(T57 이전) 아예 렌더되지 않는다 — 회색 비활성 버튼을 두지 않는다
                    (`docs/UX.md:929` Absent-not-disabled controls). */}
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  disabled={finalText.trim() === ''}
                >
                  클립보드에 복사
                </button>
                {hasLayer2Adapter && (
                  <button type="button" disabled>
                    입력창에 삽입
                  </button>
                )}
              </div>
              {copied && <p role="status">복사됨</p>}
              {copyError && <p role="alert">{copyError}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  top: '16px',
  right: '16px',
  width: '360px',
  maxHeight: '80vh',
  overflowY: 'auto',
  background: '#fff',
  color: '#111',
  border: '1px solid #ccc',
  borderRadius: '8px',
  boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
  padding: '12px',
  fontSize: '13px',
  fontFamily: 'system-ui, sans-serif',
  zIndex: 2147483647,
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontWeight: 600,
  marginBottom: '8px',
};

const closeButtonStyle: React.CSSProperties = {
  minWidth: '44px',
  minHeight: '44px',
  border: 'none',
  background: 'transparent',
  fontSize: '18px',
  cursor: 'pointer',
};
