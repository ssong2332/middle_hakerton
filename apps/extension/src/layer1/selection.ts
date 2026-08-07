// 선택 감지 + 플로팅 버튼(mouseup → getSelection) — T55 (AC-052 ①③④⑤).
// 🔴 대상 사이트를 식별하는 분기를 만들지 않는다(층 1의 정의, Planning Decision #61).
//    이 파일은 현재 페이지 주소를 읽어 분기하지 않는다 — 읽으면 위반(`docs/CodingRules.md`
//    Directory Rules `apps/extension/src/layer1` 행, 검증: `selection.test.ts`).

const BUTTON_ID = 'cbm-layer1-selection-button';

export interface SelectionPayload {
  text: string;
  rect: DOMRect;
}

export interface SelectionOverlayOptions {
  /**
   * 플로팅 버튼 클릭 시 호출된다. T56이 여기에 "선택 텍스트로 채운 중재 패널 열기"를 연결한다.
   * 지정하지 않으면 콘솔에 정보성 placeholder만 남긴다(패널을 만들지 않는다 — T56 소유).
   */
  onSelect?: (payload: SelectionPayload) => void;
}

function getExistingButton(): HTMLButtonElement | null {
  return document.getElementById(BUTTON_ID) as HTMLButtonElement | null;
}

/** 떠 있는 버튼을 제거한다. 없으면 아무 일도 하지 않는다 — AC-052 ④. */
export function removeFloatingButton(): void {
  getExistingButton()?.remove();
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

  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.type = 'button';
  button.textContent = '중재하기';

  // position: fixed — getBoundingClientRect()가 이미 뷰포트 기준 좌표라 스크롤 오프셋 보정이
  // 필요 없다. 스크롤 발생 시에는 재배치 대신 **제거**를 선택했다(아래 handleScroll) — 선택
  // 영역이 뷰포트 밖으로 나갔는지 매번 재계산하는 것보다 단순하고, 사용자는 다시 선택하면 된다.
  Object.assign(button.style, {
    position: 'fixed',
    top: `${payload.rect.bottom + 4}px`,
    left: `${payload.rect.left}px`,
    zIndex: '2147483647',
    padding: '4px 10px',
    fontSize: '12px',
    lineHeight: '1.4',
    borderRadius: '4px',
    border: '1px solid #ccc',
    background: '#fff',
    boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
    cursor: 'pointer',
  });

  // 버튼 자체의 클릭 핸들러는 AC-052 ⑤가 금지하는 "대상 사이트 이벤트 가로채기"가 아니다 —
  // 우리가 만든 이 버튼 위에서만 동작하며 페이지의 다른 클릭·스크롤·단축키에는 관여하지 않는다.
  button.addEventListener('click', () => {
    onSelect(payload);
  });

  document.body.appendChild(button);
}

function getSelectionPayload(): SelectionPayload | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const text = selection.toString().trim();
  if (text === '') return null;
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  return { text, rect };
}

/**
 * 콘텐츠 스크립트 진입점에서 1회 호출한다(`docs/Architecture.md` Conventions 5).
 * 반환값은 테스트/재초기화용 정리 함수다 — 프로덕션 진입점(`content.ts`)은 호출할 필요 없다.
 */
export function initSelectionOverlay(options: SelectionOverlayOptions = {}): () => void {
  const onSelect = options.onSelect ?? defaultOnSelect;

  // AC-052 ⑤ 간섭 금지: 아래 리스너 중 어떤 것도 `preventDefault`/`stopPropagation`을 호출하지
  // 않는다 — 대상 사이트의 클릭·스크롤·단축키 동작은 이 코드가 없는 것처럼 그대로 흘러간다.
  const handleMouseUp = (): void => {
    const payload = getSelectionPayload();
    if (!payload) {
      removeFloatingButton();
      return;
    }
    createFloatingButton(payload, onSelect);
  };

  const handleSelectionChange = (): void => {
    // 선택이 비었거나 접혔으면(클릭으로 다른 곳을 눌러 collapse된 경우 포함) 버튼을 치운다.
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? '';
    if (text === '') removeFloatingButton();
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') removeFloatingButton();
  };

  const handleScroll = (): void => {
    removeFloatingButton();
  };

  document.addEventListener('mouseup', handleMouseUp);
  document.addEventListener('selectionchange', handleSelectionChange);
  document.addEventListener('keydown', handleKeyDown);
  window.addEventListener('scroll', handleScroll, { passive: true, capture: true });

  return () => {
    document.removeEventListener('mouseup', handleMouseUp);
    document.removeEventListener('selectionchange', handleSelectionChange);
    document.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('scroll', handleScroll, { capture: true });
    removeFloatingButton();
  };
}
