/**
 * 백엔드 호출(Bearer) — `docs/Architecture.md:121` 폴더 구조. 웹앱과 **완전히 같은 엔드포인트**를
 * 쓴다(T56 · AC-028).
 *
 * 🔴 T2 스캐폴드 스텁 — 실 구현(토큰 조회 `chrome.storage.session`, fetch 래핑)은 T56이 채운다.
 */
export async function callMediationApi(_body: unknown): Promise<unknown> {
  throw new Error('Not implemented — T56에서 채운다');
}
