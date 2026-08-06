import type { ReactNode } from 'react';
import { Archivo, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

export const metadata = {
  title: '크로스보더 협업 중재 서비스',
};

/**
 * 리뷰 M-6: `globals.css`의 Google Fonts `@import`(외부 런타임 요청)를 `next/font/google`(빌드타임
 * self-host, 신규 npm 의존성 없음 — `next` 패키지에 포함)로 교체했다. `variable`로 노출한 CSS
 * 커스텀 프로퍼티(`--font-archivo`/`--font-plex-mono`)를 `globals.css`의 `--font-sans`/`--font-mono`가
 * 참조한다.
 */
const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '600', '800'],
  variable: '--font-archivo',
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
});

/**
 * 🔴 Major 5(reviewer REJECTED → 수정) — `LogoutButton`을 여기(모든 화면에 걸리는 루트 레이아웃,
 * 미인증 UX-001/UX-002 포함)에서 뺐다. `docs/UX.md` Information Architecture "Navigation"은
 * 상시 내비게이션(Log out 포함)을 "present on every **authenticated** screen"으로 한정한다 —
 * `LogoutButton`은 인증된 화면 레이아웃(`apps/web/app/(app)/layout.tsx`, 신규)이 소유한다.
 * `docs/UX.md` Information Architecture "Navigation"이 요구하는 전체 상시 내비게이션
 * (Mediate|Profile|Terminology|...)은 여전히 이 태스크(T45/T46)의 범위가 아니다 — 그 항목들이
 * 가리키는 화면 대부분이 아직 스캐폴드 단계다.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className={`${archivo.variable} ${ibmPlexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
