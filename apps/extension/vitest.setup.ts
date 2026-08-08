/**
 * T56 — 확장 워크스페이스 컴포넌트 테스트 공용 셋업. `apps/web/vitest.setup.ts`와 같은 이유로
 * `@testing-library/react`의 렌더 결과를 테스트 간에 청소한다(자동 청소가 없다, 그 파일 헤더
 * 주석 참조) — 웹앱 전용 셋업(`next/font/google` 목킹 등)과 결합시키지 않으려고 별도 파일로 둔다
 * (`vitest.config.ts` 루트의 `extension` 프로젝트 주석과 같은 이유).
 */
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
