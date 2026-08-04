/**
 * 세션 해석(쿠키 | Bearer) — `docs/Architecture.md:103` 폴더 구조 · `docs/API.md` Conventions "인증":
 * "쿠키 세션(웹앱) 또는 Authorization: Bearer(확장). 한 곳에서 분기하며 라우트마다 다른 방식을
 * 만들지 않는다."
 *
 * 🔴 T2 스캐폴드 스텁 — 실 구현은 T45(로그인) 이후 채운다.
 */

export interface Session {
  userId: string;
}

/** 쿠키 세션 또는 `Authorization: Bearer <token>` 에서 세션을 해석한다. 없으면 `null`. */
export async function resolveSession(_request: Request): Promise<Session | null> {
  throw new Error('Not implemented — T45에서 채운다');
}
