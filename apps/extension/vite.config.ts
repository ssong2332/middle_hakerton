import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const dirname = fileURLToPath(new URL('.', import.meta.url));

// `manifest.json`은 `content.js`를 자기 위치 기준 상대경로로 참조하므로 dist/에 함께 있어야
// 언팩 확장으로 로드할 수 있다 — 빌드가 content.js만 내보내면 dist/에 manifest가 없어 로드
// 자체가 불가능해진다(T55 QA가 발견한 패키징 부채). 새 의존성 없이 `closeBundle` 훅에서 복사한다.
function copyManifest(): Plugin {
  return {
    name: 'copy-manifest',
    closeBundle() {
      copyFileSync(resolve(dirname, 'manifest.json'), resolve(dirname, 'dist/manifest.json'));
    },
  };
}

// 라이브러리 모드 — `docs/Architecture.md` Tech Stack "Chrome 확장 | Manifest V3, 번들러 Vite(라이브러리 모드)".
// 진입점은 layer1(`Conventions 5: "주입은 진입점(content.ts)에서 1회"`)이 소유한다.
export default defineConfig({
  plugins: [react(), copyManifest()],
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
