import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const dirname = fileURLToPath(new URL('.', import.meta.url));

// 라이브러리 모드 — `docs/Architecture.md` Tech Stack "Chrome 확장 | Manifest V3, 번들러 Vite(라이브러리 모드)".
// 진입점은 layer1(`Conventions 5: "주입은 진입점(content.ts)에서 1회"`)이 소유한다.
export default defineConfig({
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
