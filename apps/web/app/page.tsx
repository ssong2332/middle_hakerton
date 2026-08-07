/**
 * 루트 `/` — T73②(`docs/Tasks.md` T73 row). `docs/UX.md:892` "Routes" — "Authenticated: `/` 또는
 * `/mediate`(UX-004, 기본 랜딩)"를 만족시키려면 `/`가 실제 라우트로 존재해야 한다. 이전에는
 * `apps/web/app/page.tsx` 자체가 없어 `/`가 404였다(T75 AC-085 버그 리포트).
 *
 * UX-004 화면은 `/mediate`에만 둔다(같은 화면을 두 경로에 중복시키지 않는다 — T73② 지시).
 * 이 파일은 순수 리다이렉트만 한다.
 */
import { redirect } from 'next/navigation';

export default function RootPage(): never {
  redirect('/mediate');
}
