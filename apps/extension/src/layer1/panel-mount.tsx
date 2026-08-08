/**
 * 패널 마운트/언마운트 — T56. `selection.ts`의 `onSelect` 콜백이 여기를 호출한다(AC-052②).
 *
 * 🔴 Shadow DOM으로 격리한다 — 이 패널은 임의의 3rd-party 페이지 안에 콘텐츠 스크립트로
 * 주입되므로, host 페이지의 CSS가 패널 레이아웃을 깰 위험이 있다(T55 리뷰의 M-4 후속을
 * `panel.tsx`가 훨씬 넓은 UI 표면에서 그대로 지고 가지 않기 위한 선택 — T56 구현 완료 보고
 * "판단 3" 참조). `MediationPanel.tsx`는 인라인 `style` 객체만 쓰므로(CSS Modules 링크나
 * 외부 스타일시트가 필요 없다), shadow root 안에서 별도 애셋 로딩 없이 그대로 동작한다.
 *
 * 이 파일은 kebab-case다 — 컴포넌트를 export하지 않고(함수 2개만 export) `MediationPanel.tsx`를
 * 마운트하는 인프라 코드이기 때문에 `docs/CodingRules.md` Naming의 "컴포넌트 export .tsx는
 * PascalCase" 규칙 대상이 아니다(그 규칙의 판정 기준은 "컴포넌트를 export하는" 파일이다).
 */
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { MediationPanel } from './MediationPanel';
import { focusFloatingButtonIfPresent, type SelectionPayload } from './selection';

const HOST_ID = 'cbm-layer1-panel-host';

let activeRoot: Root | null = null;

function removeExistingHost(): void {
  activeRoot = null;
  document.getElementById(HOST_ID)?.remove();
}

/** 패널을 (다시) 연다. 이미 열려 있으면 먼저 정리해 동시에 하나만 존재하게 한다. */
export function openMediationPanel(payload: SelectionPayload): void {
  closeMediationPanel();
  if (!document.body) return;

  const host = document.createElement('div');
  host.id = HOST_ID;
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const mountPoint = document.createElement('div');
  shadow.appendChild(mountPoint);

  activeRoot = createRoot(mountPoint);
  // flushSync — 콘텐츠 스크립트 컨텍스트에는 React DevTools/브라우저 렌더 스케줄러의 일반적인
  // idle-time 배칭 이점이 없고(단발성 오버레이, 프레임 경합 대상이 아님), 동기적으로 커밋해야
  // `openMediationPanel()` 호출 직후 DOM/shadow root 상태를 즉시 관찰할 수 있다(테스트도 이를
  // 전제한다 — `panel-mount.test.tsx`).
  flushSync(() => {
    activeRoot!.render(<MediationPanel initialText={payload.text} onClose={closeMediationPanel} />);
  });
}

/**
 * 패널을 닫는다. 열려 있지 않으면 아무 일도 하지 않는다.
 *
 * 🔴 M-7(reviewer) — UX-016 Accessibility "focus ... returns to the triggering floating button
 * on close." 언마운트/호스트 제거 뒤 `selection.ts`의 `focusFloatingButtonIfPresent()`로
 * 위임한다 — 버튼이 여전히 DOM에 있을 때만 실제로 포커스를 옮긴다(그 함수 헤더 주석에 기록된
 * "실사용 흐름 대부분에서는 이미 사라져 있다"는 알려진 한계 참조).
 */
export function closeMediationPanel(): void {
  activeRoot?.unmount();
  removeExistingHost();
  focusFloatingButtonIfPresent();
}
