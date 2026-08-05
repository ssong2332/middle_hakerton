'use client';

/**
 * 로그아웃 — T45/T46 "적절한 위치(레이아웃의 로그아웃 버튼)" 요구를 채운다. 상시 내비게이션이
 * 있는 인증된 화면들의 레이아웃(`apps/web/app/(app)/(with-nav)/layout.tsx`)에 배치한다 —
 * 루트 레이아웃(모든 화면, 미인증 포함)도 `(app)` 그룹 전체(onboarding 포함)도 아니다(Major 1/5,
 * `docs/UX.md:893`). ADR-0002에 따라 커스텀 `/api/logout` 라우트 없이 브라우저에서
 * `@supabase/supabase-js`의 `signOut()`을 직접 호출한다.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabase/browser';

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <button type="button" onClick={() => void handleClick()} disabled={loading}>
      로그아웃
    </button>
  );
}
