/**
 * UX-016 Universal Selection Mediation Panel — T56 서브셋(AC-052②, AC-053, AC-010, AC-066,
 * AC-028 + NotLoggedIn) + T57("입력창에 삽입" 실제 동작, AC-053②①④·AC-040) + T71(Mark 모드,
 * AC-080/AC-081). 이 태스크 범위 밖(다른 태스크 소관): Interpret 모드(T59) · 수신자 후보 탐지(T66).
 *
 * 🔴 **T71 — "ux-design 라우팅 필요"는 stale로 판단하고 직접 구현했다(Duty to Refute)** —
 * `docs/UX.md:763`(States) · `:773`(Business Rules) · `:1561`(Decision Log "새 화면이 아니라
 * 기존 패널 안의 세 번째 모드")가 Mark 모드를 이미 완결적으로 스펙해 두었다(T65/T66과 같은
 * 패턴, `docs/Tasks.md` T65 각주가 이미 이름 붙인 stale 반복).
 *
 * 🔴 **T71 스코프를 UX.md 원안보다 좁혔다(2가지) — 존재하지 않는 화면·데이터에 의존하지 않기
 * 위해서다:**
 * ① MarkModeSuccess의 "카운터파트의 갱신된 총 표본 수"는 표시하지 않는다 — `POST /api/samples`
 *    응답(`docs/API.md:342`)에 총 건수 필드가 없다(그 값은 `GET /api/samples`의 몫, T72 범위).
 *    지어낸 숫자를 보여주지 않고 "표본에 추가됨"만 표시한다.
 * ② "표본 관리 보기"(UX-019) 링크를 렌더하지 않는다 — UX-019 화면 자체가 아직 없다(T72 `todo`).
 *    없는 화면으로 가는 링크를 두면 클릭 시 404다(`docs/PRD.md` AC-084⑥ "구현되지 않았거나
 *    컷된 화면의 내비 항목은 렌더되지 않는다"와 같은 원칙을 여기도 적용). T72가 UX-019를 만들
 *    때 이 링크를 추가한다.
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
 * 🔴 T66(AC-067①, PRD Planning Decision #128) — 자유 입력 필드는 여전히 두지 않는다(페이지
 * 맥락 자동 감지는 스파이크에서 불가 판정, 스트레치로 이월 — `docs/UX.md` v6.7). 대신 기존
 * 쌍방 규약(`pair_protocols`) 상대 목록에서 고르는 `RecipientKnownCounterparts` 컨트롤만
 * 추가한다. 목록이 비어 있으면(규약 0건) 컨트롤 자체를 렌더하지 않는다(비활성 아님 —
 * "Absent-not-disabled controls" 패턴, `docs/UX.md:929`) — 그 경우 이전과 동일하게 recipient는
 * `null`로 남아 AC-066①④가 그대로 성립한다.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { computeIndicatorDeltas, LENGTH_COUNTER_SHOW_AT, SOFT_LENGTH_CAP } from '@cross-border/core';
import type { MediationResult } from '@cross-border/core';
import { addSample, callMediationApi, fetchKnownCounterparts } from '../shared/api';
import { getStoredToken } from '../shared/token-storage';
import { NON_LIVE_NOTICE } from '../shared/non-live-notice';
import { computeClampedPosition, shiftMarkSvg } from './selection';
import { getLayer1ColorScheme, getLayer1Theme, subscribeLayer1ThemeChange, type Layer1Theme } from './theme';
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
  /**
   * 🔴 (2026-08-12, T81) `SelectionPayload.rect` — 패널을 선택 위치 옆에 놓기 위한 앵커.
   * `panel-mount.tsx`가 그대로 전달한다. 없으면(구버전 호출자·테스트) 기존 우상단 고정
   * 위치로 폴백한다 — 이 prop을 생략해도 깨지지 않는다.
   */
  anchorRect?: DOMRect | null;
}

type Status = 'checkingAuth' | 'notLoggedIn' | 'idle' | 'loading' | 'success' | 'error';
type InsertStatus = 'idle' | 'inserted' | 'failed';
// T71 — `docs/UX.md:763` States. "mediate"가 기존 경로(이 파일의 나머지 status 값들), "mark"가
// 새 모드다. Interpret(T59)은 아직 없어 두 값뿐이다.
type PanelMode = 'mediate' | 'mark';
type MarkStatus = 'idle' | 'confirming' | 'success' | 'error';

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
  anchorRect = null,
}: MediationPanelProps) {
  // 🔴 (2026-08-12, T81) 다크모드 — host 페이지가 아니라 OS/브라우저 신호를 읽는다(`theme.ts`
  // 헤더 주석 참조). 패널은 버튼보다 오래 열려 있을 수 있어(LLM 호출 대기 등) 실시간 전환도
  // 구독한다.
  const [theme, setTheme] = useState<Layer1Theme>(() => getLayer1Theme());
  useEffect(() => subscribeLayer1ThemeChange(() => setTheme(getLayer1Theme())), []);

  // 🔴 (2026-08-12, T81→T82 후속) `anchorRect`가 있으면 선택 위치 옆에, 없으면 기존 우상단 고정
  // 위치로 폴백한다. 버튼과 같은 clamp 로직(`computeClampedPosition`)을 재사용해 뷰포트를
  // 벗어나지 않는다 — `docs/UX.md`가 이미 이 패널에 대해 "opens next to a text selection"이라고
  // 밝힌 요구를 실제로 구현한다(그동안 `payload.rect`가 `panel-mount.tsx`에서 버려지고 있었다).
  //
  // 🔴 (2026-08-12, T82) 사용자 재신고 — "패널이 드래그(스크롤) 시 여전히 고정돼 있다." T81은
  // 마운트 시점 1회만 위치를 계산했다 — 패널이 열린 뒤 페이지를 스크롤하면 버튼과 달리 패널은
  // 원래 화면 좌표에 그대로 남았다.
  //
  // 🔴 (2026-08-12, T83) 첫 수정(`window.scrollX/Y` 기반 문서 좌표 변환)이 실사용에서 또
  // 실패했다 — 원인: 그 방식은 **문서/윈도우 레벨 스크롤만** 반영한다. 이 페이지처럼 실제
  // 스크롤이 중첩된 내부 컨테이너(예: 피드 영역)에서 일어나면 `window.scrollY`는 전혀 변하지
  // 않아 재계산해도 값이 그대로였다(M-3 주석이 이미 언급한 "중첩 스크롤 컨테이너"와 같은 부류의
  // 문제, 버튼 쪽은 애초에 이 문제가 없다 — 아래 참조). 고친 방법: `origin`(선택이 시작된 host
  // 엘리먼트, prop으로 이미 갖고 있음)의 `getBoundingClientRect()`를 마운트 시점과 재계산
  // 시점에 각각 실측해 **그 델타(이동량)** 만큼 `anchorRect`를 평행이동한다. 엘리먼트
  // `getBoundingClientRect()`는 어떤 조상이 스크롤됐든(윈도우든 중첩 컨테이너든) 항상 현재
  // 뷰포트 기준 정답을 브라우저가 직접 계산해 주므로 스크롤 출처를 몰라도 된다.
  // 버튼(`selection.ts`)이 살아있는 `window.getSelection()`을 다시 읽는 방식을 쓰지 않는 이유는
  // 여기도 동일하다 — 패널 안 요소를 한 번이라도 클릭하면 그 mousedown이 문서 selection을
  // collapse시킨다는 구조적 한계(`focusFloatingButtonIfPresent` 헤더 주석) 때문에, 살아있는
  // selection 대신 안정적으로 유지되는 `origin` 엘리먼트 참조에 기댄다. `origin`이 없거나(폴백)
  // DOM에서 분리되면(예외적) 마지막으로 알려진 위치를 그대로 유지한다 — (0,0) 기준으로 튀지
  // 않는다.
  const [anchoredPos, setAnchoredPos] = useState<{ top: number; left: number } | null>(null);
  const anchorRectRef = useRef<DOMRect | null>(null);
  const originAtMountRef = useRef<{ top: number; left: number } | null>(null);

  const repositionNearAnchor = useCallback(() => {
    const anchor = anchorRectRef.current;
    if (!anchor || !panelRef.current) return;
    let effectiveRect: { top: number; bottom: number; left: number; right: number } = anchor;
    const originBase = originAtMountRef.current;
    if (origin && origin.isConnected && originBase) {
      const now = origin.getBoundingClientRect();
      const dx = now.left - originBase.left;
      const dy = now.top - originBase.top;
      effectiveRect = {
        top: anchor.top + dy,
        bottom: anchor.bottom + dy,
        left: anchor.left + dx,
        right: anchor.right + dx,
      };
    }
    const size = panelRef.current.getBoundingClientRect();
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    setAnchoredPos(computeClampedPosition(effectiveRect, { width: size.width, height: size.height }, viewport));
  }, [origin]);

  const [status, setStatus] = useState<Status>('checkingAuth');
  const [text, setText] = useState(initialText);
  const [result, setResult] = useState<MediationResult | null>(null);
  const [finalText, setFinalText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [insertStatus, setInsertStatus] = useState<InsertStatus>('idle');
  const [counterparts, setCounterparts] = useState<string[]>([]);
  const [recipient, setRecipient] = useState<string | null>(null);
  // T71 — Mark 모드 상태. `markCounterpart`/`markStatus`는 모드를 벗어나도 초기화하지 않는다
  // (실패 시 "선택 텍스트와 입력한 카운터파트 식별자 모두 유지" — `docs/UX.md:763`
  // MarkModeError, 사용자가 재시도 버튼만 다시 누르면 되게 한다).
  const [mode, setMode] = useState<PanelMode>('mediate');
  const [markCounterpart, setMarkCounterpart] = useState('');
  const [markStatus, setMarkStatus] = useState<MarkStatus>('idle');
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

  // 🔴 T66(AC-067①④) — 로그인 확인 뒤 1회 조회한다. 실패하거나 규약이 0건이면 `counterparts`가
  // 빈 배열로 남고, 그 경우 컨트롤 자체를 렌더하지 않는다(아래 JSX) — 기존 미지정 경로가 그대로
  // 동작해야 한다는 요구를 실패 시에도 깨지 않는다(try/catch 없이 항상 `CounterpartsApiResult`를
  // 반환하는 `fetchKnownCounterparts()` 계약, `shared/api.ts` 참조).
  useEffect(() => {
    if (status !== 'idle') return;
    let cancelled = false;
    fetchKnownCounterparts().then((result) => {
      if (!cancelled && result.ok) setCounterparts(result.counterparts);
    });
    return () => {
      cancelled = true;
    };
  }, [status]);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  // 🔴 (2026-08-12, T81→T83) 마운트/anchorRect 변경 직후(레이아웃 커밋 후) 기준점을 저장하고
  // 즉시 1회 배치한다 — `selection.ts`의 버튼 위치 계산과 같은 이유로 useLayoutEffect를 쓴다
  // (측정은 DOM에 붙은 뒤에만 가능하다). `anchorRect`가 없으면 아무 것도 하지 않고 기본
  // 우상단 고정 위치(`panelStyle`)를 그대로 쓴다.
  useLayoutEffect(() => {
    if (!anchorRect) return;
    anchorRectRef.current = anchorRect;
    // 🔴 (T83 버그 수정) `getBoundingClientRect()`는 호출마다 실제 레이아웃 재계산 비용이 드는
    // 동기 API다 — `.top`/`.left`를 따로 두 번 부르지 않고 한 번만 불러 구조분해한다.
    if (origin && origin.isConnected) {
      const rect = origin.getBoundingClientRect();
      originAtMountRef.current = { top: rect.top, left: rect.left };
    } else {
      originAtMountRef.current = null;
    }
    repositionNearAnchor();
  }, [anchorRect, origin, repositionNearAnchor]);

  // 🔴 (2026-08-12, T82) 패널이 열린 뒤 페이지(또는 중첩 스크롤 컨테이너)가 스크롤되면 위 문서
  // 좌표를 기준으로 다시 배치한다 — `selection.ts`의 버튼 스크롤 재배치(`repositionFloatingButton`,
  // T81)와 같은 이유·같은 옵션(`capture:true, passive:true`, host 페이지 스크롤에 관여하지
  // 않는다).
  useEffect(() => {
    if (!anchorRect) return;
    document.addEventListener('scroll', repositionNearAnchor, { capture: true, passive: true });
    return () => document.removeEventListener('scroll', repositionNearAnchor, { capture: true });
  }, [anchorRect, repositionNearAnchor]);

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
      recipient,
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

  // 🔴 T71/AC-080②/AC-081①③ — "표본에 추가" 클릭 하나만 이 경로를 부른다. 발신자 판별 코드가
  // 없다 — `markCounterpart`는 사용자가 직접 타이핑한 값이며, DOM에서 추론하지 않는다.
  // `computeIndicatorDeltas(text)`가 집계값만 뽑고, 이 함수는 그 뒤로 `text`(원문)를 참조하지
  // 않는다 — `addSample()`에 넘기는 것은 집계값·카운터파트·타임스탬프뿐이다.
  async function handleAddSample() {
    if (markCounterpart.trim() === '') return;
    setMarkStatus('confirming');
    const indicatorDeltas = computeIndicatorDeltas(text);
    const response = await addSample({
      counterpart: markCounterpart.trim(),
      source: 'manual',
      indicatorDeltas,
      collectedAt: new Date().toISOString(),
    });
    if (!response.ok) {
      if (response.reason === 'not-logged-in') {
        setStatus('notLoggedIn');
        return;
      }
      setMarkStatus('error');
      return;
    }
    // 🔴 `docs/UX.md:763` MarkModeSuccess — "패널은 열린 채로 유지된다(같은 세션에서 다른 선택을
    // 또 표시할 수 있도록)". Insert 성공 시(onClose) 닫는 것과 달리 여기서는 닫지 않는다.
    setMarkStatus('success');
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
      style={buildPanelStyle(theme, anchoredPos)}
    >
      <div style={headerStyle}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <span
            aria-hidden="true"
            style={{ display: 'inline-flex' }}
            dangerouslySetInnerHTML={{ __html: shiftMarkSvg(theme, 16, 16) }}
          />
          <span style={{ fontWeight: 800 }}>사이</span>
          <span style={{ fontWeight: 600, fontSize: '12px', color: theme.text + 'aa' }}>중재 패널</span>
        </span>
        <button type="button" onClick={onClose} aria-label="닫기" style={closeButtonStyle}>
          ×
        </button>
      </div>

      {status === 'checkingAuth' && <p role="status">확인 중…</p>}

      {status === 'notLoggedIn' && (
        <div>
          <p role="alert" style={alertTextStyle(theme)}>
            로그인이 필요합니다. 웹앱에서 먼저 확장을 연결해 주세요.
          </p>
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
            aria-describedby={text.length >= LENGTH_COUNTER_SHOW_AT ? 'cbm-panel-text-counter' : undefined}
            style={fieldStyle(theme)}
          />
          {/* AC-061 — 하드 차단 아님(②), 자문 전용. `docs/UX.md` v6.2 고정 문구·접근성(키
              입력마다 announce하지 않고 aria-describedby로만 연결) — 웹앱 SenderPanel과 동일. */}
          {text.length >= LENGTH_COUNTER_SHOW_AT && (
            <p id="cbm-panel-text-counter" style={{ fontSize: '11px', opacity: 0.75 }}>
              {text.length.toLocaleString('ko-KR')} / {SOFT_LENGTH_CAP.toLocaleString('ko-KR')}자
            </p>
          )}
          {/* 🔴 T71/`docs/UX.md:766` Accessibility — "The mode selector (mediate / Interpret /
              Mark-as-counterpart's) is a keyboard-operable choice control, and the active mode
              is exposed as text". 네이티브 radio 2개(키보드 조작 가능) + `aria-current`로 활성
              모드를 텍스트로도 노출한다. Interpret(T59)은 아직 없어 두 값뿐이다.
              v8.0 후속(사용자 지적 — "그냥 비율만 바뀌었을 뿐") — 목업의 세그먼트 필(pill)
              토글처럼 보이도록 레이블을 칩으로 감싼다. 네이티브 radio는 지우지 않는다(숨기면
              키보드 포커스 링도 함께 사라져 접근성이 나빠진다) — 대신 작게 두고 칩 배경/글자
              굵기로 활성 상태를 표시한다. */}
          <fieldset style={{ border: 'none', padding: '3px', margin: '4px 0', background: theme.surface, borderRadius: '11px', display: 'flex', gap: '5px' }}>
            <legend style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>모드</legend>
            {(
              [
                { value: 'mediate' as const, label: '중재' },
                { value: 'mark' as const, label: '상대가 쓴 것으로 표시' },
              ]
            ).map((option) => {
              const active = mode === option.value;
              return (
                <label
                  key={option.value}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    height: '36px',
                    padding: '0 8px',
                    borderRadius: '9px',
                    background: active ? theme.bg : 'transparent',
                    boxShadow: active ? '0 1px 3px rgba(17,24,39,.1)' : 'none',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    color: active ? theme.text : theme.text + '99',
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  <input
                    type="radio"
                    name="cbm-panel-mode"
                    checked={active}
                    onChange={() => setMode(option.value)}
                    aria-current={active ? 'true' : undefined}
                    style={{ width: '13px', height: '13px', flexShrink: 0 }}
                  />
                  {option.label}
                </label>
              );
            })}
          </fieldset>

          {mode === 'mediate' && (
            <>
              {/* v8.0 — 사이 확장 패널.dc.html이 이 영역을 반응형 2열로 그린다(왼쪽: 입력/실행,
                  오른쪽: 결과 — 결과가 없으면 왼쪽만 전체 폭). flex-wrap이라 좁은 창에서는
                  자동으로 세로 스택된다(모바일 브레이크포인트를 별도로 코딩하지 않는다 —
                  `docs/UX.md` Responsive Behavior "확장은 별도 반응형 처리 없음"과 모순되지
                  않는다: 이건 미디어쿼리가 아니라 flex-wrap 자체의 기본 동작이다). */}
              {/* 🔴 (2026-08-12, 사용자 실사용 재현) `alignItems`를 안 정하면 기본값 `stretch`라
                  왼쪽 열이 오른쪽(결과) 열의 큰 높이에 맞춰 강제로 늘어났다 — 왼쪽 열 자신은
                  `display:grid`라 그 안의 auto 행(select, 버튼)이 `align-content:normal`(그리드
                  기준 stretch와 동등)로 남는 공간을 나눠 가지면서, select는 폼 컨트롤이라
                  치수가 안 늘었지만 버튼은 그대로 늘어나 화면 절반을 차지하는 거대한 주황 박스로
                  보였다. `alignItems:'flex-start'`로 두 열이 서로의 높이에 영향받지 않게 한다. */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'flex-start' }}>
                <div style={{ flex: '1 1 240px', minWidth: 0, display: 'grid', gap: '10px' }}>
                  {/* T66(AC-067①, docs/UX.md v6.7 RecipientKnownCounterparts) — 규약이 0건이면
                      아예 렌더하지 않는다(비활성 아님). 페이지 맥락 자동 감지는 스트레치로
                      이월됐으므로 여기서는 목록 선택만 한다. */}
                  {counterparts.length > 0 && (
                    <div>
                      <label htmlFor="cbm-panel-recipient">받는 사람 (선택)</label>
                      <select
                        id="cbm-panel-recipient"
                        value={recipient ?? ''}
                        onChange={(event) => setRecipient(event.target.value === '' ? null : event.target.value)}
                        style={fieldStyle(theme)}
                      >
                        <option value="">미지정</option>
                        {counterparts.map((counterpart) => (
                          <option key={counterpart} value={counterpart}>
                            {counterpart}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => void runMediation()}
                    disabled={text.trim() === '' || status === 'loading'}
                    style={actionButtonStyle(theme, 'primary')}
                  >
                    {status === 'error' ? '다시 시도' : '중재 실행'}
                  </button>

                  {status === 'loading' && <p role="status">분류 중 → 변환 중 → 역번역 중</p>}
                  {status === 'error' && errorMessage && (
                    <p role="alert" style={alertTextStyle(theme)}>
                      {errorMessage}
                    </p>
                  )}
                </div>

                {status === 'success' && result && (
                  <div
                    style={{
                      flex: '1 1 220px',
                      minWidth: 0,
                      display: 'grid',
                      gap: '10px',
                      borderLeft: `1px solid ${theme.border}`,
                      paddingLeft: '14px',
                    }}
                  >
                    <div>
                      <span role="status" style={badgeStyle(theme, 'neutral')}>
                        긴급도: {result.urgency}
                      </span>
                      {result.personalizationApplied === false && (
                        <span role="status" style={badgeStyle(theme, 'warn')}>
                          개인화 미적용 — 기본 변환만 적용되었습니다
                        </span>
                      )}
                      {showFallbackNotice && (
                        <span role="status" style={badgeStyle(theme, 'warn')}>
                          {NON_LIVE_NOTICE}
                        </span>
                      )}
                    </div>

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
                      style={fieldStyle(theme)}
                    />

                    <p>역번역: {result.backTranslation}</p>
                    <p style={{ fontSize: '11px' }}>
                      완전한 검증이 아니라 큰 오역을 걸러내는 1차 안전장치입니다.
                    </p>

                    <div>
                      {/* AC-053①②③④ — Copy는 결과가 있을 때만 활성화된다. Insert는 `adapter`가
                          `null`인 한(현재 사이트에 매칭되는 층 2 모듈이 없음) 아예 렌더되지 않는다
                          — 회색 비활성 버튼을 두지 않는다(`docs/UX.md:929` Absent-not-disabled
                          controls). `adapter`가 있으면 실제로 클릭 가능한 버튼으로 렌더된다. */}
                      <button
                        type="button"
                        onClick={() => void handleCopy()}
                        disabled={finalText.trim() === ''}
                        style={actionButtonStyle(theme, 'secondary')}
                      >
                        클립보드에 복사
                      </button>
                      {adapter && (
                        <button
                          type="button"
                          onClick={handleInsert}
                          disabled={finalText.trim() === ''}
                          style={actionButtonStyle(theme, 'secondary')}
                        >
                          입력창에 삽입
                        </button>
                      )}
                    </div>
                    {copied && <p role="status">복사됨</p>}
                    {copyError && (
                      <p role="alert" style={alertTextStyle(theme)}>
                        {copyError}
                      </p>
                    )}
                    {insertStatus === 'inserted' && <p role="status">삽입됨</p>}
                    {insertStatus === 'failed' && (
                      <p role="alert" style={alertTextStyle(theme)}>
                        입력창에 삽입하지 못했습니다. 대상 사이트의 화면 구조가 바뀌었을 수 있습니다
                        — 클립보드 복사를 이용해 주세요.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* T71 — Mark 모드(`docs/UX.md:763` MarkMode/…Confirming/…Success/…Error). 중재
              파이프라인·LLM 호출 없이 로컬 집계 → 표본 저장만 한다. */}
          {mode === 'mark' && (
            <>
              <label htmlFor="cbm-panel-mark-counterpart">상대 식별자</label>
              <input
                id="cbm-panel-mark-counterpart"
                type="text"
                value={markCounterpart}
                onChange={(event) => {
                  setMarkCounterpart(event.target.value);
                  setMarkStatus('idle');
                }}
                placeholder="상대의 이메일 등 식별자"
                style={fieldStyle(theme)}
              />
              <button
                type="button"
                onClick={() => void handleAddSample()}
                disabled={markCounterpart.trim() === '' || markStatus === 'confirming'}
                style={actionButtonStyle(theme, 'primary')}
              >
                표본에 추가
              </button>
              {markStatus === 'success' && <p role="status">표본에 추가됨</p>}
              {markStatus === 'error' && (
                <p role="alert" style={alertTextStyle(theme)}>
                  저장에 실패했습니다. 다시 시도해 주세요.
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

// 🔴 (2026-08-12, T81) — 하드코딩 리터럴(#fff/#111/#ccc)을 `theme.ts` 토큰으로 교체하고, 위치를
// `anchoredPos`가 있으면 그쪽으로, 없으면 기존 우상단 고정으로 폴백한다(사용자 요청 ①②: 다크모드
// 대응 + 선택 위치 근처 배치). `colorScheme`은 버튼과 같은 이유로 명시한다(`theme.ts` 참조).
function buildPanelStyle(
  theme: Layer1Theme,
  anchoredPos: { top: number; left: number } | null,
): React.CSSProperties {
  return {
    position: 'fixed',
    top: anchoredPos ? `${anchoredPos.top}px` : '16px',
    left: anchoredPos ? `${anchoredPos.left}px` : undefined,
    right: anchoredPos ? undefined : '16px',
    // v8.0 — 결과가 뜨면 2열이 되므로(위 렌더 로직) 기존 360px 고정폭은 너무 좁다. 목업의
    // `min(692px, calc(100vw - 40px))`를 그대로 쓰되, 확장 패널은 항상 이 최대폭까지 필요하진
    // 않아 실측 여유를 두고 560px로 상한을 낮춘다(임의 페이지 위에 뜨는 오버레이라 원본보다
    // 보수적으로 잡는다) — 뷰포트가 좁으면 flex-wrap이 자동으로 세로 스택한다.
    width: 'min(560px, calc(100vw - 32px))',
    maxHeight: '80vh',
    overflowY: 'auto',
    background: theme.bg,
    color: theme.text,
    border: `1px solid ${theme.border}`,
    borderRadius: '20px', // v8.0 — docs/UX.md --radius-lg, 사이 확장 패널.dc.html 패널 카드
    boxShadow: `0 24px 60px ${theme.shadow}`,
    padding: '12px',
    fontSize: '13px',
    fontFamily: 'system-ui, sans-serif',
    zIndex: 2147483647,
    colorScheme: getLayer1ColorScheme(),
  };
}

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

// 🔴 (2026-08-12, T81) 사용자 요청 ② "통일성" — 지금까지 패널 안의 버튼/입력/셀렉트가 브라우저
// 기본 스타일 그대로였다(테두리·배경·크기가 제각각). 이 세 헬퍼로 패널 안 모든 상호작용
// 요소가 같은 토큰을 쓴다. `primary`는 이 세션의 핵심 동작(중재 실행/확정/표본에 추가) 하나에만
// 쓴다 — 여러 버튼이 동시에 accent로 칠해지면 "이게 기본 액션"이라는 신호가 무의미해진다
// (`apps/web/app/globals.css`의 accent 사용 원칙과 같은 이유).
function actionButtonStyle(theme: Layer1Theme, variant: 'primary' | 'secondary' = 'secondary'): React.CSSProperties {
  const isPrimary = variant === 'primary';
  return {
    font: '700 13px system-ui, sans-serif', // v8.0 — 사이 확장 패널.dc.html btn() 헬퍼
    padding: '7px 12px',
    borderRadius: '13px',
    border: `1px solid ${isPrimary ? theme.accent : theme.border}`,
    background: isPrimary ? theme.accent : 'transparent',
    color: isPrimary ? theme.accentText : theme.text,
    cursor: 'pointer',
    minHeight: '32px',
  };
}

function fieldStyle(theme: Layer1Theme): React.CSSProperties {
  return {
    font: 'inherit',
    fontSize: '13px',
    padding: '6px 8px',
    borderRadius: '12px', // v8.0 — docs/UX.md --radius-md
    border: `1px solid ${theme.border}`,
    background: theme.surface,
    color: theme.text,
    width: '100%',
    boxSizing: 'border-box',
  };
}

function alertTextStyle(theme: Layer1Theme): React.CSSProperties {
  return { color: theme.danger, fontWeight: 600 };
}

/**
 * v8.0 — 사이 확장 패널.dc.html이 긴급도/개인화 미적용/폴백 응답을 알약(pill) 배지로 그린다.
 * 기존엔 셋 다 밋밋한 `<p role="status">` 텍스트 줄이었다 — 시각만 바꾸고 `role="status"`(스크린
 * 리더 알림)와 텍스트 내용은 그대로 유지한다(AC-066③/AC-041/urgency 값 자체는 변경 대상이 아님,
 * `docs/UX.md` Decision Log "Full Visual Rebrand" 참조 — 스타일 패스일 뿐 동작 변경이 아니다).
 * `tone`은 목업의 두 배지 색 계열을 재사용한다: neutral(긴급도, 정보성) / warn(개인화 미적용·
 * 폴백 응답, 눈에 띄어야 하는 상태 결손).
 */
function badgeStyle(theme: Layer1Theme, tone: 'neutral' | 'warn'): React.CSSProperties {
  return {
    display: 'inline-block',
    padding: '5px 10px',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: 700,
    background: tone === 'warn' ? theme.danger + '22' : theme.surface,
    color: tone === 'warn' ? theme.danger : theme.text,
    marginRight: '6px',
    marginBottom: '6px',
  };
}
