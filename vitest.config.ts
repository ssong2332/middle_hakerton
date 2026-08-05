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
  // 🔴 T5/T6이 처음 추가한다 — `apps/web/**/*.test.tsx`(컴포넌트 테스트, jsdom 프로젝트)가
  // 이 리포의 첫 `.tsx` 테스트다. 이 Vite(8.x)는 기본 변환기로 esbuild가 아니라 **oxc**를
  // 쓴다("Both esbuild and oxc options were set. oxc options will be used" 경고로 확인,
  // measured) — `esbuild.jsx`를 켜는 시도는 무시되고 JSX가 변환되지 않은 채 SSR 변환 단계로
  // 넘어가 파싱에 실패했다(RolldownError "Unexpected JSX expression"). `oxc.jsx`는
  // `'preserve' | JsxOptions` 타입이라 문자열 `'react-jsx'`는 런타임엔 통과해도 typecheck에서
  // 거부된다(measured, `node_modules/rolldown/dist/shared/binding-CVtkJvyl.d.mts:1550`
  // `BindingEnhancedTransformOptions.jsx`) — `JsxOptions` 객체 형태(`runtime:'automatic'`,
  // 그 파일:879)로 써야 한다. 새 패키지 없이 설정만으로 해결된다.
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'react' },
  },
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
          // 렌더 결과를 테스트마다 청소한다 — `apps/web/vitest.setup.ts` 참조.
          setupFiles: ['./apps/web/vitest.setup.ts'],
        },
      },
    ],
  },
});
