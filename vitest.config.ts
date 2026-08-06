/**
 * 리포 루트 단일 Vitest 설정 — 웹앱·확장·코어가 **한 러너**를 쓴다.
 * 근거: `docs/Architecture.md` Tech Stack "테스트" 행 · `docs/DECISIONS.md` #13 —
 * T11(회귀 검증셋 26건)이 "하나의 실행 출력"을 요구하므로 러너가 갈리면 안 된다.
 */
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// Vitest 4에서 `environmentMatchGlobs`가 제거되었다(마이그레이션 가이드 대체제: `projects`).
// 컴포넌트 테스트(`apps/web/**/*.test.tsx`)만 jsdom이 필요하다. 나머지는 순수 로직이라 node로 충분하고 더 빠르다.
const sharedExclude = ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/build/**'];

// 🔴 reviewer 후속 Major B(`docs/Tasks.md` T11) — Vitest 4는 `.env`를 자동으로 `process.env`에
// 로드하지 않는다(measured: `node_modules/vitest/dist`에 `loadEnv` 0건, `package-lock.json`에
// `dotenv` 없음). `tests/regression-c2.live.test.ts` 헤더가 안내하는 절차("`.env`에 채운 뒤
// `npm run test:regression-c2`")가 실제로 동작하려면 이 설정 파일이 직접 `.env`를 읽어야 한다.
// 새 의존성을 추가하지 않고 `vitest`가 이미 의존하는 `vite`의 내장 `loadEnv`를 쓴다 — 세 번째
// 인자를 `''`(빈 prefix)로 주면 기본값인 `VITE_` 접두사 필터링 없이 전체 키를 로드한다. 이미
// `process.env`에 설정된 값(CI 환경변수, 셸 export 등)은 덮어쓰지 않는다 — `.env`는 로컬 기본값
// 역할만 한다. `.env`가 없는 워크트리에서는 `loadEnv`가 빈 객체를 반환해 부작용이 없다.
const dotEnv = loadEnv('test', process.cwd(), '');
for (const [key, value] of Object.entries(dotEnv)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

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
          // 🔴 T11(`tests/regression-c2.ts`)이 이 목록에 `tests/`를 추가했다 — 그 전에는 `tests/`가
          // 빈 스캐폴드(`tests/README.md`만)라 대상이 없었다. `docs/Architecture.md` Tech Stack
          // "테스트" 행 "웹앱·확장·코어가 한 러너로 돈다"가 `tests/`도 예외 없이 포함한다 —
          // 별도 러너를 만들면 T11이 요구하는 "하나의 실행 출력"이 갈라진다.
          include: ['{apps,packages,tests}/**/*.test.{ts,tsx}'],
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
