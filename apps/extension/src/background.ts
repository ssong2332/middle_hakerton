/**
 * 백그라운드 서비스 워커 — `docs/Architecture.md` "확장 인증" 절.
 *
 * 🔴 역할을 정확히 2가지로 좁힌다(T56 구현 완료 보고 "판단 1" 참조):
 * ① `chrome.storage.session`의 access level을 콘텐츠 스크립트에도 연다 — 기본값은 확장
 *    페이지(백그라운드 등) 전용이라, 이걸 하지 않으면 패널(콘텐츠 스크립트, `layer1/panel-mount.tsx`
 *    가 붙이는 shadow DOM 안의 React 트리)이 저장된 토큰을 전혀 읽을 수 없다(`shared/token-storage.ts`
 *    헤더 주석 참조).
 * ② 웹앱의 `/extension/connect` 페이지가 `chrome.runtime.sendMessage(EXTENSION_ID, ...)`로 보내는
 *    access token을 받아 저장한다. `manifest.json`의 `externally_connectable.matches`가 우리 앱
 *    origin 1개로 제한되어 있어(빌드 시 `vite.config.ts`가 `VITE_APP_ORIGIN`으로 채운다), 다른
 *    사이트는 이 리스너에 메시지를 보낼 수 없다.
 *
 * 🔴 실제 `/api/mediate` fetch는 여기서 하지 않는다 — `shared/api.ts`가 콘텐츠 스크립트(패널)
 * 컨텍스트 안에서 직접 fetch한다. 근거: Chrome은 페이지의 CSP `connect-src`를 콘텐츠 스크립트가
 * 시작한 fetch에 적용하지 않는다(콘텐츠 스크립트의 네트워크 요청은 확장 고유 principal로 실행되며,
 * 크로스 오리진 여부는 `host_permissions`가 결정한다 — 2026-08 WebSearch로 확인한 Chrome의 문서화된
 * 동작). `docs/Architecture.md` "확장 인증"이 기각한 iframe 대안의 `frame-src` CSP 문제와는 다른
 * 종류의 제약이라, 여기서는 "모든 fetch를 대신 해주는 프록시" 역할을 만들지 않는다 — 필요한
 * 역할(①②)만 최소로 둔다.
 */
import { setStoredToken } from './shared/token-storage';

chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });
});

interface ConnectTokenMessage {
  type: 'cbm:set-token';
  token: string;
}

function isConnectTokenMessage(message: unknown): message is ConnectTokenMessage {
  if (typeof message !== 'object' || message === null) return false;
  const candidate = message as { type?: unknown; token?: unknown };
  return candidate.type === 'cbm:set-token' && typeof candidate.token === 'string' && candidate.token.length > 0;
}

chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (!isConnectTokenMessage(message)) {
    sendResponse({ ok: false, error: 'invalid message' });
    return false;
  }
  setStoredToken(message.token)
    .then(() => sendResponse({ ok: true }))
    .catch((error: unknown) => {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    });
  return true; // sendResponse는 비동기로 호출된다 — 리스너가 살아있게 true를 반환한다.
});
