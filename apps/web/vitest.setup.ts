/**
 * jsdom 컴포넌트 테스트 공용 셋업 — `@testing-library/react`는 렌더 결과를 테스트 간에
 * 자동으로 청소하지 않는다(`@testing-library/react/vitest` 서브패스가 이 버전에는 없다,
 * measured: `node_modules/@testing-library/react/package.json`에 `exports` 필드 없음).
 * 이 파일이 없으면 같은 파일 안의 여러 테스트가 렌더한 DOM이 누적돼 `getByText`가
 * "여러 개 찾음" 오류를 낸다(measured). 🔴 `@testing-library/jest-dom`은 설치돼 있지 않다 —
 * 새 의존성을 추가하지 않고 vitest 기본 매처(`toBeTruthy`/`toBeNull` 등)만 쓴다.
 */
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * 리뷰 M-6 후속 — `next/font/google`은 Next.js 빌드 컴파일러(SWC/babel) 전용 매크로라 Vitest의
 * Vite/oxc 변환 경로에서는 실제 함수가 아니다(`apps/web/app/layout.tsx`가 호출하는 `Archivo`/
 * `IBM_Plex_Mono`). Next.js 공식 가이드가 권장하는 대로 테스트 전역에서 목(mock)으로 대체한다 —
 * `variable`만 실제 사용처(`globals.css`의 `var(--font-archivo)` 등)와 일치시키면 충분하다.
 */
vi.mock('next/font/google', () => ({
  Archivo: () => ({ className: 'font-archivo-mock', variable: '--font-archivo' }),
  IBM_Plex_Mono: () => ({ className: 'font-plex-mono-mock', variable: '--font-plex-mono' }),
}));

afterEach(() => {
  cleanup();
});
