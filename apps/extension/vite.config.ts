import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const dirname = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(dirname, '../..');

// 🔴 T56 — 이 리포의 `.env`는 루트 1개뿐이다. Vite 기본 envDir(=이 config 파일이 있는 디렉터리)이
// 아니라 루트를 읽도록 명시한다 — `shared/api.ts`/`layer1/MediationPanel.tsx`의
// `import.meta.env.VITE_APP_ORIGIN`이 이 값으로 채워진다.
//
// 🔴 이 파일은 콘텐츠 스크립트(`content.js`)만 빌드한다 — 백그라운드 서비스 워커(`background.js`)는
// `vite.background.config.ts`가 별도로 빌드한다(`package.json`의 `build` 스크립트가 순서대로
// 둘 다 실행하고, 매니페스트 주입은 마지막에 실행되는 그 설정의 몫이다). 이유: Vite(Rolldown 엔진,
// 8.x)는 다중 진입점 + `iife`/`umd` 출력을 지원하지 않는다(measured — `output.codeSplitting`을
// true/false 어느 쪽으로 둬도 "UMD and IIFE are not supported for code-splitting builds" /
// "multiple inputs are not supported when codeSplitting is false" 둘 중 하나로 빌드가 실패한다).
// 콘텐츠 스크립트는 `<script>` 태그로 로드되는 classic 전역 스크립트여야 하고, MV3 서비스
// 워커도 `"type":"module"`을 manifest에 선언하지 않는 한 classic이라 둘 다 'iife'가 필요하다 —
// 그래서 진입점을 완전히 분리된 두 번의 빌드로 나눈다.
export default defineConfig({
  envDir: repoRoot,
  plugins: [react()],
  // 🔴 T35 리허설 Scene 7 발 발견(2026-08-09, 실브라우저 실측) — `content.ts`가 React(패널·고지
  // UI, T56/T58)를 번들하는데, React 내부 곳곳이 `process.env.NODE_ENV`를 참조한다. Next.js
  // 빌드(`apps/web`)는 이 치환을 프레임워크가 자동으로 해 주지만, 이 파일은 순수 `vite build`라
  // 아무도 치환해 주지 않는다 — 콘텐츠 스크립트가 실행되는 브라우저 페이지 전역에는 Node의
  // `process` 객체가 아예 없으므로, `define` 없이 빌드한 `dist/content.js`는 로드되는 **모든
  // 페이지에서** `Uncaught ReferenceError: process is not defined`로 즉시 죽는다(youtube.com
  // 등에서 실측·`edge://extensions`의 확장 오류 로그로 확인, content.js:13:1). jsdom 기반
  // vitest 테스트는 Node 환경이라 `process`가 항상 존재해 이 결함을 잡지 못했다 — T55~T58이
  // `done`으로 QA GO를 받는 동안 실브라우저 로드가 한 번도 검증되지 않았기 때문에 발현하지
  // 않고 남아 있었다. `production`으로 고정하는 이유: 이 확장은 개발자 모드 로드 전용이라
  // 별도 dev/prod 모드 분기가 없고(Planning Decision #4), React의 프로덕션 경로(전체 개발자
  // 경고 코드 제거)가 배포판에도 맞다.
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: resolve(dirname, 'src/content.ts'),
      formats: ['iife'],
      name: 'CrossBorderMediatorContent',
      fileName: () => 'content.js',
    },
  },
});
