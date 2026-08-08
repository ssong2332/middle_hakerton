import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const dirname = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(dirname, '../..');

const env = loadEnv('production', repoRoot, '');
const APP_ORIGIN = env.VITE_APP_ORIGIN || '';

/**
 * `manifest.json`을 그대로 복사하지 않고 `externally_connectable.matches`/`host_permissions`를
 * 빌드 시점에 `VITE_APP_ORIGIN`으로 채워 넣는다 — `docs/Architecture.md` "확장 인증":
 * "manifest externally_connectable을 우리 앱 origin 1개로만 제한". 정적 JSON 파일 하나로는
 * dev(`http://localhost:3000`)/배포(`https://*.vercel.app`) 환경마다 origin이 달라지는 것을
 * 표현할 수 없어 빌드 스텝에서 주입한다(하드코딩하면 한 환경에서만 동작한다).
 *
 * 🔴 이 플러그인을 `content.js`를 빌드하는 `vite.config.ts`가 아니라 여기(두 번째로 실행되는
 * 빌드)에 둔다 — `content.js`의 `emptyOutDir:true`가 `dist/`를 비운 *뒤에* 두 파일이 모두
 * 나온 상태에서 매니페스트를 써야 하기 때문이다(`package.json` `build` 스크립트가 순서를
 * 보장한다: `vite build && vite build --config vite.background.config.ts`).
 */
function copyManifest(): Plugin {
  return {
    name: 'copy-manifest',
    closeBundle() {
      // 🔴 M-5(reviewer, 2026-08-08) — 이전에는 여기서 `console.warn`만 하고 빈
      // `externally_connectable.matches`/`host_permissions`로 빌드를 **성공**시켰다. 그 결과로
      // 나온 확장은 인증 핸드오프 전체와(C-1 반영 이후) background의 `/api/mediate` fetch까지
      // 조용히 동작하지 않는다 — 런타임에서야 혼란스러운 실패로 드러난다. T55의 이 패키징 계열
      // 결함이 T55 QA 라운드 전체를 한 번 더 돌게 만든 전례가 있다 — 빌드가 조용히 깨지는 대신
      // 시끄럽게 실패해야 한다.
      if (!APP_ORIGIN) {
        throw new Error(
          '[apps/extension build] VITE_APP_ORIGIN이 설정되지 않았습니다 — ' +
            '리포 루트 .env에 VITE_APP_ORIGIN을 채운 뒤 다시 빌드하세요.',
        );
      }
      const manifest = JSON.parse(readFileSync(resolve(dirname, 'manifest.json'), 'utf-8'));
      const pattern = `${APP_ORIGIN}/*`;
      manifest.externally_connectable = { matches: [pattern] };
      manifest.host_permissions = [pattern];
      writeFileSync(resolve(dirname, 'dist/manifest.json'), JSON.stringify(manifest, null, 2));
    },
  };
}

// `vite.config.ts` 헤더 주석 참조 — 다중 진입점 + iife 제약 때문에 배경 스크립트를 별도 빌드로
// 분리했다. `emptyOutDir:false` — 이 빌드가 먼저 나온 `content.js`를 지우면 안 된다.
export default defineConfig({
  envDir: repoRoot,
  plugins: [copyManifest()],
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(dirname, 'src/background.ts'),
      formats: ['iife'],
      name: 'CrossBorderMediatorBackground',
      fileName: () => 'background.js',
    },
  },
});
