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
