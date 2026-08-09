/**
 * 프라이버시 고지 마운트/재표시 오케스트레이션 — T58(AC-054, AC-076③).
 *
 * `panel-mount.tsx`와 같은 이유로 Shadow DOM에 격리한다(임의의 3rd-party 페이지에 주입되는
 * 콘텐츠 스크립트라 host 페이지 CSS로부터 보호해야 한다).
 *
 * 이 파일은 kebab-case다 — 컴포넌트를 export하지 않고(함수 하나만 export) `PrivacyNotice.tsx`를
 * 마운트하는 인프라 코드이기 때문에 `docs/CodingRules.md` Naming 규칙 대상이 아니다
 * (`panel-mount.tsx`와 같은 판단 근거).
 */
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { PrivacyNotice } from './PrivacyNotice';
import { getStoredNoticeVersion, NOTICE_VERSION, setStoredNoticeVersion, shouldShowNotice } from './notice';

const HOST_ID = 'cbm-layer1-privacy-notice-host';

/** 고지를 마운트하고, 사용자가 확인(닫기 또는 Escape)할 때까지 기다린다. */
function showPrivacyNotice(): Promise<void> {
  return new Promise((resolve) => {
    if (!document.body) {
      resolve();
      return;
    }

    const host = document.createElement('div');
    host.id = HOST_ID;
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });
    const mountPoint = document.createElement('div');
    shadow.appendChild(mountPoint);

    const root: Root = createRoot(mountPoint);

    function acknowledge(): void {
      root.unmount();
      host.remove();
      resolve();
    }

    // panel-mount.tsx와 같은 이유(동기 커밋 필요) — flushSync.
    flushSync(() => {
      root.render(<PrivacyNotice onAcknowledge={acknowledge} />);
    });
  });
}

/**
 * 콘텐츠 스크립트 진입점(`content.ts`)에서 선택 오버레이를 켜기 **전에** 호출한다 —
 * UX-017 Entry: "shown before any floating-button/panel interaction is reachable".
 * 재표시가 필요 없으면(AC-076③, 동일 버전 기록) 즉시 resolve해 아무것도 마운트하지 않는다.
 */
export async function ensureNoticeAcknowledged(): Promise<void> {
  const stored = await getStoredNoticeVersion();
  if (!shouldShowNotice(stored)) return;

  await showPrivacyNotice();
  await setStoredNoticeVersion(NOTICE_VERSION);
}
