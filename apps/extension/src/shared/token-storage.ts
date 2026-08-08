/**
 * 확장 토큰 저장/조회 — `docs/Architecture.md` "확장 인증" 절.
 * 🔴 `chrome.storage.session`(디스크가 아님)에 보관한다 — 브라우저 종료 시 사라지는 것이 의도다.
 *
 * 🔴 기본적으로 콘텐츠 스크립트는 `chrome.storage.session`을 읽을 수 없다(Chrome 기본
 * access level = 확장 페이지 전용, `TRUSTED_CONTEXTS`) — `background.ts`가 `onInstalled`에서
 * `setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })`를 1회 호출해야 패널(콘텐츠
 * 스크립트)에서도 이 값을 읽을 수 있다. 근거: MDN/Chrome for Developers `storage.session`
 * 문서(2026-08 WebSearch 확인) — "By default, storage.session is not exposed to content
 * scripts... call setAccessLevel from the extension service worker."
 *
 * 키 이름을 이 파일 한 곳에서만 선언해 `background.ts`(쓰기)와 `shared/api.ts`(읽기)가 같은
 * 문자열 리터럴을 쓰게 한다(`docs/CodingRules.md` 상수 격리 정신과 같은 이유).
 */
export const TOKEN_STORAGE_KEY = 'cbmAccessToken';

export async function getStoredToken(): Promise<string | null> {
  const stored = await chrome.storage.session.get(TOKEN_STORAGE_KEY);
  const value = stored[TOKEN_STORAGE_KEY];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export async function setStoredToken(token: string): Promise<void> {
  await chrome.storage.session.set({ [TOKEN_STORAGE_KEY]: token });
}

/**
 * 🔴 M-6(reviewer, 2026-08-08) — background가 `/api/mediate` 401 `AUTH_REQUIRED` 응답을 받으면
 * 이걸로 만료 토큰을 지운다. 지우지 않으면 브라우저 세션이 끝날 때까지(chrome.storage.session의
 * 생명주기) 같은 만료 토큰을 계속 보내 매번 401을 받게 된다.
 */
export async function clearStoredToken(): Promise<void> {
  await chrome.storage.session.set({ [TOKEN_STORAGE_KEY]: '' });
}
