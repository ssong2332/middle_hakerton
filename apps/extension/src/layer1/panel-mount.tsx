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
import type { Layer2Adapter } from './registry';
import { focusFloatingButtonIfPresent, removeFloatingButton, type SelectionPayload } from './selection';

const HOST_ID = 'cbm-layer1-panel-host';

let activeRoot: Root | null = null;

function removeExistingHost(): void {
  activeRoot = null;
  document.getElementById(HOST_ID)?.remove();
}

/**
 * 패널을 (다시) 연다. 이미 열려 있으면 먼저 정리해 동시에 하나만 존재하게 한다.
 *
 * 🔴 T57 — `adapter`는 이 함수의 호출자(`content.ts`, 진입점)가 레지스트리 조회
 * (`registry.ts`의 `findAdapterForUrl`)로 미리 판정해 넘긴다. 이 파일(`layer1/`)은
 * `layer2/**`를 import하지 않는다(`docs/CodingRules.md` Directory Rules) — 조회 로직 자체를
 * 여기 두지 않고 주입만 받는 이유가 그것이다.
 */
export function openMediationPanel(
  payload: SelectionPayload,
  adapter: Layer2Adapter | null = null,
): void {
  closeMediationPanel();
  if (!document.body) return;

  // 🔴 (2026-08-12, T82) 사용자 신고 — 패널이 열려도 트리거 버튼("중재하기")이 화면에 계속
  // 남아 있어 둘이 동시에 떠 있는 것처럼 보였다. 패널이 곧 그 버튼이 하던 역할(선택 텍스트로
  // 무엇을 할지 고르는 UI)을 이어받으므로 버튼은 숨긴다. ⚠️ 이 호출로 인해 M-7이 원래 의도한
  // "닫을 때 트리거 버튼으로 포커스 복귀"는 열기 시점에 버튼이 사라지므로 실질적으로 항상
  // no-op이 된다 — 다만 그 접근성 요구는 이미 다른 두 경로(패널 안 요소 클릭이 selection을
  // collapse시킴, Escape의 document 버블 순서)로 인해 사실상 항상 깨져 있었다(아래
  // `closeMediationPanel` 헤더 주석, `panel-focus-return.test.tsx` 참조) — 이 변경이 새로
  // 깨뜨리는 경로는 없고, 이미 문서화된 한계를 한 지점으로 통합할 뿐이다.
  removeFloatingButton();

  // 🔴 (2026-08-12, 사용자 실사용 재현) 패널이 열려도 host 페이지의 네이티브 텍스트 선택
  // (`window.getSelection()`)이 지워지지 않고 하이라이트째로 남아 있었다 — 패널 안 아무 요소를
  // 클릭해도(모드 라디오, select 등) 그 mouseup이 `document`까지 버블돼(Shadow DOM 안이라도
  // composed 이벤트는 버블된다) `handleMouseUp`이 여전히 그 selection을 유효한 payload로 읽고
  // **버튼을 다시 그렸다** — 패널이 열려 있는데 버튼도 함께 뜬 것처럼 보인 원인이다. 위 T82
  // 주석은 "패널 안 클릭이 selection을 collapse시킨다"고 가정했지만 실측 결과 거짓이었다(Duty
  // to Refute) — 패널 컨텐츠는 host 페이지 DOM 밖(Shadow DOM)에 있어 브라우저가 그 클릭을
  // "다른 곳 클릭"으로 취급해 자동으로 collapse해 주지 않는다. payload는 이미 캡처했으므로
  // (`payload.text` 인자로 받음) 선택 자체를 지워도 데이터 손실이 없다 — 명시적으로 지운다.
  window.getSelection()?.removeAllRanges();

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
    activeRoot!.render(
      <MediationPanel
        initialText={payload.text}
        onClose={closeMediationPanel}
        adapter={adapter}
        origin={payload.origin}
        anchorRect={payload.rect}
      />,
    );
  });
}

/**
 * 패널을 닫는다. 열려 있지 않으면 아무 일도 하지 않는다.
 *
 * 🔴 M-7(reviewer) — UX-016 Accessibility "focus ... returns to the triggering floating button
 * on close." 언마운트/호스트 제거 뒤 `selection.ts`의 `focusFloatingButtonIfPresent()`로
 * 위임한다 — 버튼이 여전히 DOM에 있을 때만 실제로 포커스를 옮긴다. 🔴 정정(M-A, reviewer,
 * 2026-08-08) — 실제 배선(`initSelectionOverlay()`의 document-레벨 keydown 리스너)에서는
 * 이 시점에 버튼이 이미 없거나(다른 요소 클릭 경로) 이 호출 직후 같은 keydown 이벤트가
 * document까지 버블돼 곧바로 지워진다(즉시 Escape 경로도 포함) — 현재 어떤 경로로도 포커스가
 * 실제로 되돌아가지 않는다. 자세한 근거는 `selection.ts`의 `focusFloatingButtonIfPresent()`
 * 헤더 주석과 `panel-focus-return.test.tsx` 참조.
 *
 * 🔴 (2026-08-12, T82) 위 두 경로에 세 번째가 더해졌다 — `openMediationPanel()`이 이제 열릴 때
 * 버튼을 바로 지운다(사용자 요청, 위 주석 참조). 이 함수 자신은 여전히 `focusFloatingButtonIfPresent()`를
 * 호출한다 — 만약 패널이 열려 있는 동안 사용자가 페이지의 다른 곳을 다시 선택해 버튼이 새로
 * 생겼다면(드문 경우, `handleMouseUp`이 이전 버튼을 대체) 그 버튼으로 포커스를 옮기는 것이
 * 여전히 올바른 동작이기 때문이다 — 무조건 no-op은 아니다(`panel-mount.test.tsx` "returns focus
 * to a floating button if one exists at close time" 참조).
 */
export function closeMediationPanel(): void {
  activeRoot?.unmount();
  removeExistingHost();
  focusFloatingButtonIfPresent();
}
