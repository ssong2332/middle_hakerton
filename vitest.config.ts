/**
 * 리포 루트 단일 Vitest 설정 — 웹앱·확장·코어가 **한 러너**를 쓴다.
 * 근거: `docs/Architecture.md` Tech Stack "테스트" 행 · `docs/DECISIONS.md` #13 —
 * T11(회귀 검증셋 26건)이 "하나의 실행 출력"을 요구하므로 러너가 갈리면 안 된다.
 */
import { defineConfig } from 'vitest/config';

// Vitest 4에서 `environmentMatchGlobs`가 제거되었다(마이그레이션 가이드 대체제: `projects`).
// 컴포넌트 테스트(`apps/web/**/*.test.tsx`)만 jsdom이 필요하다. 나머지는 순수 로직이라 node로 충분하고 더 빠르다.
const sharedExclude = ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/build/**'];

export default defineConfig({
  test: {
    // 🔴 T2(스캐폴드)는 테스트 대상 로직이 없다 — 각 스텁이 `throw new Error('Not implemented')`뿐이고,
    // 유일한 AC(AC-028)는 vitest가 아니라 ESLint no-restricted-imports로 검증된다(CodingRules 판정 열).
    // T5부터 실제 테스트가 쌓이면 이 옵션 유무와 무관하게 정상 실행된다 — CI가 "테스트 0건"으로
    // 영구히 막히지 않게 하는 임시 설정이며, 첫 테스트가 추가되면 그대로 두어도 무해하다.
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          include: ['{apps,packages}/**/*.test.{ts,tsx}'],
          exclude: [...sharedExclude, 'apps/web/**/*.test.tsx'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'jsdom',
          include: ['apps/web/**/*.test.tsx'],
          exclude: sharedExclude,
          environment: 'jsdom',
        },
      },
    ],
  },
});
