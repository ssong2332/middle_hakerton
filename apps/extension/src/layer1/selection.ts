// 선택 감지 + 플로팅 버튼(mouseup → getSelection) — T55 (AC-052 ①③④⑤).
// 🔴 대상 사이트를 식별하는 분기를 만들지 않는다(층 1의 정의, Planning Decision #61).
//    이 파일은 현재 페이지 주소를 읽어 분기하지 않는다 — 읽으면 위반(`docs/CodingRules.md`
//    Directory Rules `apps/extension/src/layer1` 행, 검증: `selection.test.ts`).

import { getLayer1ColorScheme, getLayer1Theme, type Layer1Theme } from './theme';

const BUTTON_ID = 'cbm-layer1-selection-button';

/**
 * MEDIATE "SHIFT" 로고 마크 — 사용자가 제공한 Claude Design 프로젝트
 * `MEDIATE 로고 03 SHIFT 전개.dc.html`의 원본 SVG를 그대로 옮긴다(좌표·비율을 임의로 바꾸지
 * 않는다). 원문의 "축소 한계" 섹션이 20×10(viewBox 0 0 188 96 그대로 스케일)을 이미 검증된
 * 최소 크기 중 하나로 명시했다 — 여기서는 그 크기를 기본값으로 쓴다. 다크모드 대응도 원문 그대로:
 * 어긋난 두 바(위 두 개)는 배경 대비에 따라 반전(`theme.text` 재사용), 정렬된 결과 바(아래,
 * 넓은 바)는 원문이 다크 변형에서도 고정해 둔 브랜드 레드 `#ec3013`을 그대로 쓴다(테마 무관).
 */
function shiftMarkSvg(theme: Layer1Theme, width: number, height: number): string {
  return (
    `<svg width="${width}" height="${height}" viewBox="0 0 188 96" role="img" aria-hidden="true" focusable="false">` +
    `<rect x="14" y="20" width="118" height="16" fill="${theme.text}"/>` +
    `<rect x="56" y="44" width="118" height="16" fill="${theme.text}"/>` +
    `<rect x="14" y="68" width="160" height="16" fill="#ec3013"/>` +
    `</svg>`
  );
}

export interface SelectionPayload {
  text: string;
  rect: DOMRect;
  /**
   * ADR-0010/F4-a — the Element the selection came from, captured at selection time
   * (not judged for eligibility here — layer1 does not decide whether it's an input;
   * see docs/Architecture.md F4-a 층 1 쪽 계약 #2). `null` when it could not be
   * captured (e.g. selection collapsed before this ran).
   */
  origin: HTMLElement | null;
}

export interface SelectionOverlayOptions {
  /**
   * 플로팅 버튼 클릭 시 호출된다. T56이 여기에 "선택 텍스트로 채운 중재 패널 열기"를 연결한다.
   * 지정하지 않으면 콘솔에 정보성 placeholder만 남긴다(패널을 만들지 않는다 — T56 소유).
   */
  onSelect?: (payload: SelectionPayload) => void;
}

const POSITION_GAP = 4;

export interface ClampSize {
  width: number;
  height: number;
}

export interface ClampViewport {
  width: number;
  height: number;
}

/**
 * 선택 영역 rect 기준으로 버튼 위치를 계산하되 뷰포트를 벗어나지 않게 clamp한다 —
 * `docs/UX.md:928` "clamped to stay fully within the viewport (flips to the opposite side if it
 * would overflow the top/bottom edge; shifts horizontally to avoid the left/right edge)".
 * 순수 함수로 분리한 이유: jsdom에는 실제 레이아웃 엔진이 없어 버튼 크기 측정이 항상 0으로
 * 나온다 — DOM 통합 테스트만으로는 clamp 산술을 신뢰성 있게 검증할 수 없어 여기서 직접
 * 단위 테스트한다(`selection.test.ts`).
 */
export function computeClampedPosition(
  rect: Pick<DOMRect, 'top' | 'bottom' | 'left' | 'right'>,
  buttonSize: ClampSize,
  viewport: ClampViewport,
): { top: number; left: number } {
  const below = rect.bottom + POSITION_GAP;
  const overflowsBottom = below + buttonSize.height > viewport.height;
  let top = overflowsBottom ? rect.top - buttonSize.height - POSITION_GAP : below;
  // 안전망: 버튼이 뷰포트보다 커서 flip 이후에도 벗어나면 최소한 뷰포트 안에 남긴다.
  top = Math.min(Math.max(top, 0), Math.max(viewport.height - buttonSize.height, 0));

  let left = rect.left;
  if (left + buttonSize.width > viewport.width) {
    left = viewport.width - buttonSize.width;
  }
  left = Math.max(left, 0);

  return { top, left };
}

function getExistingButton(): HTMLButtonElement | null {
  return document.getElementById(BUTTON_ID) as HTMLButtonElement | null;
}

/** 떠 있는 버튼을 제거한다. 없으면 아무 일도 하지 않는다 — AC-052 ④. */
export function removeFloatingButton(): void {
  getExistingButton()?.remove();
}

/**
 * 🔴 M-7(reviewer, 2026-08-08) — UX-016 Accessibility "focus ... returns to the triggering
 * floating button on close." `panel-mount.tsx`가 패널을 닫을 때 이 헬퍼로 위임한다.
 *
 * 🔴 정정(M-A, reviewer, 2026-08-08) — 이전 라운드 보고는 "패널을 열자마자 아무것도 클릭하지
 * 않고 Escape로 닫는 좁은 경로에서만 이 함수가 실제로 포커스를 되돌린다"고 적었는데, 그 경로도
 * 동작하지 않는다(reviewer가 트레이스, `panel-focus-return.test.tsx`가 실제 배선으로 고정) —
 * **현재 어떤 경로로도 패널을 닫을 때 포커스가 트리거 버튼으로 돌아가지 않는다.** 이유: 패널
 * 안(React 19 dialog)에서 Escape를 누르면 `MediationPanel`의 `onKeyDown`이 먼저 `onClose()` →
 * `closeMediationPanel()` → 이 함수를 실행해 버튼에 포커스를 준다 — 하지만 그 keydown 이벤트는
 * `composed:true`로 shadow 경계를 넘어 계속 `document`까지 버블되고, 거기서 T55가 이미
 * 등록해 둔 `handleKeyDown`(이 파일 아래, AC-052④)이 `removeFloatingButton()`으로 그 버튼
 * 자체를 DOM에서 지운다. 포커스는 설정되자마자 그 대상과 함께 사라진다. 패널 내부 다른 요소를
 * 한 번이라도 클릭한 뒤 닫는 경로에서는 애초에 그 전에 `selectionchange`가 버튼을 지운다(아래
 * 문단 참조) — 두 경로 모두 결과는 같다: 버튼이 없다.
 *
 * 🔴 알려진 한계(원인) — 버튼 자신의 mousedown 핸들러만 `preventDefault`로 selection-collapse를
 * 막는다(위 `createFloatingButton`의 M-1 주석) — 패널 안의 다른 어떤 요소(텍스트영역, 실행/복사
 * 버튼 등)도 그렇게 하지 않으므로, 패널을 열고 그 안의 아무 요소나 한 번이라도 클릭하면 그
 * mousedown의 네이티브 기본 동작이 host 문서의 selection을 그 클릭 위치로 이동시킨다(shadow
 * DOM 안이라도 마찬가지). 그 결과 `selectionchange`가 발동하고, `document.activeElement`가
 * (open shadow root의 retarget 규칙상) 패널 내부 요소가 아니라 shadow host `<div>` 자체로
 * 보고되므로 `getFormControlSelectionPayload()`가 그걸 폼 컨트롤로 인식하지 못해 `null`을
 * 반환한다 — `handleSelectionChange`가 버튼을 지운다. 이건 코드 결함이 아니라 T55(선택
 * 오버레이)가 이미 확정한 selectionchange/keydown 동작과 T56(패널)이 상호작용하는 방식에서
 * 나오는 구조적 한계라 T55 쪽을 건드리지 않고는 "패널이 열려 있는 동안 버튼이 살아있게" 만들
 * 수 없다 — orchestrator/ux-design에 스펙 질문으로 보고한다(구현 완료 보고 참조). 이 함수
 * 자체는 지우지 않는다 — 위 델리게이션 계약을 그대로 구현하고 있고, T55/T56 상호작용이
 * 조정되면(향후 태스크) 그 즉시 의미를 갖게 된다.
 */
export function focusFloatingButtonIfPresent(): void {
  getExistingButton()?.focus();
}

function defaultOnSelect(payload: SelectionPayload): void {
  // 🔴 T56 마운트 지점 — 선택 텍스트로 채운 중재 패널을 여기서 연다(AC-052 ②, 이 태스크(T55) 범위 밖).
  console.info(
    '[cross-border-mediator] selection captured, panel opening is T56 scope',
    payload.text.length,
  );
}

/**
 * 선택 영역 옆에 플로팅 버튼을 (다시) 그린다. 항상 기존 버튼을 먼저 제거해 **동시에 하나만**
 * 존재하도록 보장한다 — 연속 `mouseup`으로 중복 버튼이 생기지 않는다.
 */
function createFloatingButton(
  payload: SelectionPayload,
  onSelect: (p: SelectionPayload) => void,
): void {
  removeFloatingButton();

  // XML/SVG 등 <all_urls> 콘텐츠 스크립트가 매칭될 수 있는 비-HTML 문서는 document.body가
  // 없을 수 있다 — 그런 문서에서는 버튼을 그릴 곳이 없으므로 조용히 아무 것도 하지 않는다.
  if (!document.body) return;

  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.type = 'button';

  // 🔴 (2026-08-12, T81) "중재하기" 텍스트를 처음엔 아이콘 단독으로 바꾸지 않았다 — `docs/UX.md`
  // Accessibility "Error Messaging"·T77 Decision Log의 아이콘 단독 금지 원칙 때문에 "M" 모노그램
  // 배지 + 텍스트를 함께 뒀다. 🔴 (2026-08-12, T82) 사용자가 실제 로고(SHIFT 마크, Claude Design
  // 프로젝트 `MEDIATE 로고 03 SHIFT 전개.dc.html`)를 제공하며 **아이콘 단독**을 명시적으로
  // 요청했다 — 이 컨트롤(선택 시 잠깐 뜨는 액션 트리거)에 한해 그 지시를 따르되, 시각적으로
  // 텍스트가 없어도 스크린리더 사용자가 배제되지 않도록 `aria-label`로 접근 가능한 이름은
  // 유지한다(아이콘 단독 버튼에 `aria-label`을 다는 것은 WCAG 4.1.2 충족의 표준 패턴이며,
  // 기존 원칙이 막던 것은 "텍스트 대안이 어디에도 없는" 상태다 — T77의 내비 토글처럼 상시
  // 노출되는 신호와 달리 이건 사용자가 만든 일회성 트리거라는 점도 다르다).
  // 마크 자체는 디자인 원문의 "축소 한계" 표(30/20/14px)에서 이미 검증된 20px 폭 버전을
  // 그대로 쓴다(임의로 재스케일하지 않는다) — 두 어긋난 바는 배경 대비에 맞춰 반전되고(라이트:
  // 짙은색 / 다크: 밝은색, `theme.text` 재사용), 세 번째(합쳐진 결과) 바는 디자인 원문이 다크
  // 변형에서도 고정해 둔 브랜드 레드 `#ec3013`을 테마와 무관하게 그대로 쓴다.
  const theme = getLayer1Theme();
  button.innerHTML = shiftMarkSvg(theme, 20, 10);
  button.setAttribute('aria-label', '중재하기');
  button.title = '중재하기';

  // position: fixed — getBoundingClientRect()가 이미 뷰포트 기준 좌표라 스크롤 오프셋 보정이
  // 필요 없다. top/left는 DOM에 붙인 뒤 실제 버튼 크기를 측정해서 계산한다(clamp 근거는
  // computeClampedPosition 주석 참조) — 초기값은 measure 전까지만 존재하는 placeholder다.
  // 🔴 (2026-08-12, T81) 다크모드: host 페이지가 아니라 OS/브라우저 신호(`theme.ts`)를 읽는다.
  // `colorScheme`을 명시해 브라우저의 강제 다크모드 재처리가 이미 테마 처리된 이 버튼을 다시
  // 건드리지 않게 한다(`docs/UX.md` "Selection-triggered floating button" 패턴, 다크모드 절 참조).
  Object.assign(button.style, {
    position: 'fixed',
    top: '0px',
    left: '0px',
    zIndex: '2147483647',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    // 🔴 (2026-08-12, T82) 아이콘 단독으로 바뀌며 좌우 여백을 동일하게 맞춘다(이전엔 텍스트
    // 옆의 비대칭 여백 4px/10px였다).
    padding: '6px',
    borderRadius: '4px',
    border: `1px solid ${theme.border}`,
    background: theme.bg,
    boxShadow: `0 1px 4px ${theme.shadow}`,
    cursor: 'pointer',
    colorScheme: getLayer1ColorScheme(),
  });

  // M-1(reviewer): 실브라우저에서 host 페이지 어디든 mousedown하면 document selection이
  // collapse되어 selectionchange가 발동, click이 도달하기 전에 버튼이 사라진다. 이 버튼
  // 자신의 mousedown에서만 preventDefault해 브라우저의 네이티브 selection-collapse를 막는다
  // — AC-052⑤가 금지하는 "host 페이지 이벤트 가로채기"가 아니다(host 페이지의 다른 어떤
  // 요소·이벤트에도 관여하지 않고, 우리가 만든 이 버튼 자체에만 적용된다).
  button.addEventListener('mousedown', (event) => {
    event.preventDefault();
  });

  // 버튼 자체의 클릭 핸들러는 AC-052 ⑤가 금지하는 "대상 사이트 이벤트 가로채기"가 아니다 —
  // 우리가 만든 이 버튼 위에서만 동작하며 페이지의 다른 클릭·스크롤·단축키에는 관여하지 않는다.
  button.addEventListener('click', () => {
    onSelect(payload);
  });

  document.body.appendChild(button);

  // C-1(reviewer): DOM에 붙인 뒤에야 실제 크기를 측정할 수 있다(붙기 전엔 항상 0×0).
  const size = button.getBoundingClientRect();
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const { top, left } = computeClampedPosition(
    payload.rect,
    { width: size.width, height: size.height },
    viewport,
  );
  button.style.top = `${top}px`;
  button.style.left = `${left}px`;
}

/**
 * 🔴 (2026-08-12, T81) 스크롤 시 버튼을 선택 위치에 맞춰 다시 그린다 — 지운다(M-3, 아래
 * `initSelectionOverlay` 주석)와는 다른 동작이다. 이전에는 scroll 이벤트 자체를 아예 다루지
 * 않아 버튼이 화면 좌표에 고정된 채 남았다(사용자 실측 발견 — 선택 후 페이지를 스크롤하면
 * 버튼이 원래 선택 위치를 벗어나 엉뚱한 곳에 떠 있었다). `getSelectionPayload()`를 다시 호출해
 * 최신 rect를 구한다 — Range/폼 컨트롤 selection은 스크롤로 사라지지 않으므로 이 값은 항상
 * 갱신된 뷰포트 기준 좌표다. `docs/UX.md` "Selection-triggered floating button" 패턴에 이
 * 동작을 새로 명시했다(스크롤은 여전히 해제 트리거가 아니다 — M-3의 "지우지 않는다" 결정은
 * 그대로 유지, 위치만 갱신한다).
 */
function repositionFloatingButton(): void {
  const button = getExistingButton();
  if (!button) return;
  const payload = getSelectionPayload();
  if (!payload) return;
  const size = button.getBoundingClientRect();
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const { top, left } = computeClampedPosition(
    payload.rect,
    { width: size.width, height: size.height },
    viewport,
  );
  button.style.top = `${top}px`;
  button.style.left = `${left}px`;
}

/**
 * M-2(reviewer): 실브라우저에서 `<textarea>`/`<input>` 안의 선택은 `window.getSelection()`이
 * 빈 문자열을 반환한다(`docs/UX.md:187` UF-005 1단계 — GitHub 댓글창 등). `document.activeElement`가
 * 텍스트 폼 컨트롤이고 selectionStart/selectionEnd가 non-collapsed면 `.value.slice(...)`로 읽는다.
 * `HTMLTextAreaElement`/`HTMLInputElement`는 모든 사이트에 있는 범용 DOM 인터페이스이며 호스트명·
 * 셀렉터를 읽지 않으므로 AC-052③(대상 사이트 식별 금지) 위반이 아니다.
 * 위치 근사: Range처럼 문자 단위 rect를 낼 수 없어 컨트롤 자신의 getBoundingClientRect()를 쓴다
 * (버튼은 기존 로직대로 이 rect의 아래쪽에 배치된다) — 문서화된 구현 선택.
 */
function getFormControlSelectionPayload(): SelectionPayload | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement)) return null;

  try {
    const { selectionStart, selectionEnd, value } = active;
    if (selectionStart === null || selectionEnd === null || selectionStart === selectionEnd) {
      return null;
    }
    const text = value.slice(selectionStart, selectionEnd).trim();
    if (text === '') return null;
    // ADR-0010/F4-a — origin is the control itself for a form-control selection.
    return { text, rect: active.getBoundingClientRect(), origin: active };
  } catch {
    // 일부 <input type="number"|"email"|...>은 selectionStart 접근 시 예외를 던진다
    // (그 타입은 텍스트 선택을 지원하지 않는다는 뜻) — 버튼을 띄우지 않는다.
    return null;
  }
}

/**
 * ADR-0010/F4-a — the nearest Element ancestor of a Range's commonAncestorContainer
 * (itself if it's already an Element, its parentElement if it's a text/other node).
 */
function nearestElementAncestor(node: Node): HTMLElement | null {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return el instanceof HTMLElement ? el : null;
}

function getSelectionPayload(): SelectionPayload | null {
  const selection = window.getSelection();
  const text = selection?.toString().trim() ?? '';
  if (selection && selection.rangeCount > 0 && text !== '') {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const origin = nearestElementAncestor(range.commonAncestorContainer);
    return { text, rect, origin };
  }
  return getFormControlSelectionPayload();
}

/**
 * 콘텐츠 스크립트 진입점에서 1회 호출한다(`docs/Architecture.md` Conventions 5).
 * 반환값은 테스트/재초기화용 정리 함수다 — 프로덕션 진입점(`content.ts`)은 호출할 필요 없다.
 */
export function initSelectionOverlay(options: SelectionOverlayOptions = {}): () => void {
  const onSelect = options.onSelect ?? defaultOnSelect;

  // AC-052 ⑤ 간섭 금지: 아래 문서/윈도우 레벨 리스너 중 어떤 것도 `preventDefault`/
  // `stopPropagation`을 호출하지 않는다 — 대상 사이트의 클릭·스크롤·단축키 동작은 이 코드가
  // 없는 것처럼 그대로 흘러간다. (유일한 예외는 우리가 만든 버튼 **자신의** mousedown
  // 리스너다 — `createFloatingButton`의 M-1 주석 참조. 그건 host 페이지 이벤트가 아니다.)
  //
  // 🔴 M-8(2026-08-10, 라이브 재현 후 수정) 사용자가 플로팅 버튼 자신을 클릭하면 그 mouseup도
  // 이 document 리스너까지 버블된다 — 버튼의 mousedown이 preventDefault로 selection을
  // 유지시켜 두었으므로 `getSelectionPayload()`가 여전히 값을 반환하고, 이 핸들러가
  // `createFloatingButton()`을 다시 호출해 **방금 클릭된 그 버튼 노드를 지우고 새 버튼으로
  // 교체**했다. Chrome은 mousedown~click 사이에 대상 노드가 DOM에서 제거되면 뒤이은 `click`
  // 이벤트를 아예 내보내지 않는다 — 그 결과 `onSelect()`가 절대 호출되지 않고 패널이 열리지
  // 않았다(실사용자 재현: 네이버 뉴스 페이지, unpacked 확장). mouseup의 target이 기존 버튼
  // 자신(또는 그 자손)이면 재생성을 건너뛴다 — 그 버튼 자신의 click 리스너가 `onSelect`를
  // 이미 처리한다(`createFloatingButton`의 `button.addEventListener('click', ...)`).
  const handleMouseUp = (event: MouseEvent): void => {
    const existing = getExistingButton();
    if (existing && event.target instanceof Node && existing.contains(event.target)) {
      return;
    }
    const payload = getSelectionPayload();
    if (!payload) {
      removeFloatingButton();
      return;
    }
    createFloatingButton(payload, onSelect);
  };

  const handleSelectionChange = (): void => {
    // M-A(QA): 생성 조건(getSelectionPayload — 문서 selection 또는 폼 컨트롤 selection)과
    // 대칭이어야 한다. 폼 컨트롤 selection이 떠 있으면 window.getSelection()은 설계상 항상
    // 빈 문자열을 반환하므로(M-2), 그것만 보면 폼 컨트롤 selection이 여전히 non-collapsed인데도
    // "비었다"고 오판해 버튼을 지운다(예: textarea selection을 Shift+Arrow로 확장 — 그
    // selectionchange는 document까지 버블된다). 문서 selection도 폼 컨트롤 selection도 둘 다
    // 없을 때만(getSelectionPayload()가 null일 때만) 지운다.
    if (getSelectionPayload() === null) removeFloatingButton();
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') removeFloatingButton();
  };

  // M-3(reviewer): `docs/UX.md:928`가 명시하는 해제 트리거는 정확히 3개(다른 곳 클릭 / Escape /
  // 새 빈 선택)뿐이고 scroll은 없다 — 이전 구현은 scroll 리스너를 `capture:true`로 window에
  // 걸어 중첩 스크롤 컨테이너(예: 자동 스크롤되는 채팅 목록)에서 버블링된 scroll에도 버튼을
  // 지웠다. 문서에 없는 동작을 임의로 추가하지 않고 제거했다(이 판단 자체는 유지).
  //
  // 🔴 (2026-08-12, T81) 지우는 대신 위치를 갱신하는 scroll 리스너를 다시 추가한다 — M-3이
  // 지운 것은 "지운다"는 동작이었지, "스크롤을 완전히 무시한다"는 결정이 아니었다(위 M-3 원문도
  // "해제 트리거가 아니다"라고만 말한다). 스크롤 후에도 버튼이 화면에 그대로 있지만 원래
  // 선택했던 위치와 어긋나 있던 것은 실사용에서 발견된 별도의 버그다(`repositionFloatingButton`
  // 헤더 주석) — `docs/UX.md`에 이 재배치 동작을 새로 명시했다. `capture:true`로 중첩 스크롤
  // 컨테이너의 스크롤도 잡고, `passive:true`로 host 페이지의 스크롤 성능에 관여하지 않는다
  // (AC-052⑤ — preventDefault/stopPropagation을 호출하지 않는다).
  const handleScroll = (): void => {
    repositionFloatingButton();
  };

  document.addEventListener('mouseup', handleMouseUp);
  document.addEventListener('selectionchange', handleSelectionChange);
  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('scroll', handleScroll, { capture: true, passive: true });

  return () => {
    document.removeEventListener('mouseup', handleMouseUp);
    document.removeEventListener('selectionchange', handleSelectionChange);
    document.removeEventListener('keydown', handleKeyDown);
    document.removeEventListener('scroll', handleScroll, { capture: true });
    removeFloatingButton();
  };
}
