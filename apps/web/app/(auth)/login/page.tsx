/**
 * UX-001 Login — 실제 폼은 `./LoginForm.tsx`(`useSearchParams()`를 쓰므로 Suspense 경계가
 * 필요하다 — `LoginForm.tsx` 헤더 주석 참조).
 */
import { Suspense } from 'react';
import { LoginForm } from './LoginForm';

export default function LoginPage() {
  return (
    <Suspense fallback={<main>불러오는 중…</main>}>
      <LoginForm />
    </Suspense>
  );
}
