/**
 * UX-016 Universal Selection Mediation Panel — T56 서브셋(AC-052②, AC-053, AC-010, AC-066,
 * AC-028 + NotLoggedIn) + T57("입력창에 삽입" 실제 동작, AC-053②①④·AC-040). 이 태스크 범위 밖
 * (다른 태스크 소관): Interpret 모드(T59) · 수신자 후보 탐지(T66) · Mark 모드(T71).
 *
 * 🔴 파일명(PascalCase) — `docs/CodingRules.md` Naming "컴포넌트를 export하는 .tsx는
 * PascalCase" 규칙에 맞춰 T2 스캐폴드의 `panel.tsx`에서 이 이름으로 옮겼다(`git mv`, T56).
 *
 * T57 — `adapter` prop은 `panel-mount.tsx`(→ 그 호출자인 `content.ts`)가 레지스트리 조회
 * (`registry.ts`의 `findAdapterForUrl`) 결과를 그대로 전달한다. 이 컴포넌트 자신은 조회하지
 * 않는다 — `layer1/`은 `layer2/**`를 import할 수 없다(`docs/CodingRules.md` Directory Rules).
 * `adapter`가 `null`이면(층 2 미등록 사이트 — 일상 케이스, `docs/UX.md:763`) "입력창에 삽입"은
 * 아예 렌더되지 않는다(비활성 버튼 금지 — AC-053②).
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
import type { Layer2Adapter } from './registry';

export interface MediationPanelProps {
  initialText: string;
  onClose: () => void;
  /** T57 — 현재 사이트에 매칭된 층 2 어댑터, 없으면 `null`(기본값). */
  adapter?: Layer2Adapter | null;
  /**
   * ADR-0010/F4-a — 선택이 시작된 host 페이지 요소. `panel-mount.tsx`가
   * `SelectionPayload.origin`을 그대로 전달한다. prop으로만 보관한다 — 패널 인스턴스가
   * 해제되면 함께 사라져야 detached 노드를 붙들지 않는다(모듈 전역에 담지 않는다).
   */
  origin?: HTMLElement | null;
}

type Status = 'checkingAuth' | 'notLoggedIn' | 'idle' | 'loading' | 'success' | 'error';
type InsertStatus = 'idle' | 'inserted' | 'failed';

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

export function MediationPanel({
  initialText,
  onClose,
  adapter = null,
  origin = null,
}: MediationPanelProps) {
  const [status, setStatus] = useState<Status>('checkingAuth');
  const [text, setText] = useState(initialText);
  const [result, setResult] = useState<MediationResult | null>(null);
  const [finalText, setFinalText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [insertStatus, setInsertStatus] = useState<InsertStatus>('idle');
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
    setInsertStatus('idle');
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

  // 🔴 T57/AC-053④ — 이 함수를 호출하는 코드 경로는 "입력창에 삽입" 버튼의 명시적 클릭
  // 하나뿐이다. 🔴 AC-040 — `adapter.insert()` 호출 외에는 어떤 전송/제출/`.click()` 코드도
  // 실행하지 않는다(대상 사이트의 send/submit 컨트롤을 자동 클릭하지 않는다).
  // findInput()이 null이거나 insert()가 false를 반환하는 두 경우를 하나의 `catch-all`
  // (`||`/`??`)로 뭉치지 않는다 — 둘 다 결과적으로 InsertFailed로 보이지만, 각각 명시적
  // 조건문으로 구분해 "어댑터 자체가 없음"(ClipboardOnly)과 혼동하지 않는다.
  // 🔴 M-1(reviewer) — 성공 시 `docs/UX.md:763`(States)·`:760`(Exit)·`:187`(UF-011 step 7)
  // 세 곳이 일치해서 요구하는 대로 패널을 즉시 닫는다(`onClose`는 닫기 버튼/Escape와 같은 prop).
  // 🔴 M-2(reviewer) — 층 2 어댑터는 서드파티 페이지 DOM을 건드리므로 `findInput`/`insert`가
  // throw할 수 있다(호스트 페이지 구조 변경 등). throw를 삼키지 않고 InsertFailed와 동일하게
  // 취급한다 — 그래야 "클릭했는데 아무 반응 없음"이라는 최악의 실패 모드를 피한다.
  function handleInsert() {
    if (!adapter) return;
    try {
      const inputEl = adapter.findInput({ element: origin });
      if (inputEl === null) {
        setInsertStatus('failed');
        return;
      }
      const inserted = adapter.insert(inputEl, finalText);
      if (inserted === false) {
        setInsertStatus('failed');
        return;
      }
      setInsertStatus('inserted');
      onClose();
    } catch {
      setInsertStatus('failed');
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
                  setInsertStatus('idle');
                }}
              />

              <p>역번역: {result.backTranslation}</p>
              <p style={{ fontSize: '11px' }}>
                완전한 검증이 아니라 큰 오역을 걸러내는 1차 안전장치입니다.
              </p>

              <div>
                {/* AC-053①②③④ — Copy는 결과가 있을 때만 활성화된다. Insert는 `adapter`가
                    `null`인 한(현재 사이트에 매칭되는 층 2 모듈이 없음) 아예 렌더되지 않는다 —
                    회색 비활성 버튼을 두지 않는다(`docs/UX.md:929` Absent-not-disabled
                    controls). `adapter`가 있으면 실제로 클릭 가능한 버튼으로 렌더된다. */}
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  disabled={finalText.trim() === ''}
                >
                  클립보드에 복사
                </button>
                {adapter && (
                  <button
                    type="button"
                    onClick={handleInsert}
                    disabled={finalText.trim() === ''}
                  >
                    입력창에 삽입
                  </button>
                )}
              </div>
              {copied && <p role="status">복사됨</p>}
              {copyError && <p role="alert">{copyError}</p>}
              {insertStatus === 'inserted' && <p role="status">삽입됨</p>}
              {insertStatus === 'failed' && (
                <p role="alert">
                  입력창에 삽입하지 못했습니다. 대상 사이트의 화면 구조가 바뀌었을 수 있습니다 —
                  클립보드 복사를 이용해 주세요.
                </p>
              )}
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
