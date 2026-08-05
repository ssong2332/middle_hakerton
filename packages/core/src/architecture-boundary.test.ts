/**
 * T15(AC-028) — "코어 엔진이 특정 어댑터에 의존하지 않는다"의 **단방향 절반**을 코드로 고정한다.
 * `docs/Tasks.md` T15 원문: "코어가 어댑터 코드에 의존하지 않음을 import 경로로 확인." (양방향
 * "동일 인터페이스로 두 어댑터에서 호출된다"의 나머지 절반은 이 파일이 증명하지 않는다 — 아래
 * "AC-028 범위" 절 참조.)
 *
 * 🔴 이 불변식은 이미 `eslint.config.js`의 `no-restricted-imports`(packages/core/**)가
 * 빌드 단계에서 강제한다(`docs/CodingRules.md` Directory Rules "판정" 열 — "ESLint
 * no-restricted-imports가 빌드를 실패시킨다"). 이 테스트는 그것을 **대체하지 않는다** — 목적은
 * "lint 설정이 실수로 완화돼도(파일 패턴이 좁아지거나 규칙이 삭제돼도) 별도 테스트 러너가 같은
 * 위반을 잡는다"는 이중 방어다(`docs/Tasks.md` T15 지시 "lint 설정이 실수로 완화돼도 잡히게").
 *
 * ## AC-028 범위 (2026-08-05, implementer 판단 — orchestrator 지시에 따라 기록)
 * PRD 원문(AC-028): "코어 엔진이 특정 어댑터(웹/확장)에 의존하지 않으며, 동일 인터페이스로 두
 * 어댑터에서 호출된다." 이 문장은 두 절로 나뉜다.
 *
 * - **절 1(단방향 — 이 파일이 증명)**: "코어가 어댑터에 의존하지 않는다." 아래 테스트가
 *   `packages/core/src/**\/*.ts` 전체를 스캔해 `next`/`react`/`react-dom`/`@supabase/*`/`openai`
 *   import와 `apps/*` 상대경로 import가 0건임을 실행 시점에 확인한다.
 * - **절 2(양방향 — "두 어댑터에서 호출") 중 웹 어댑터 쪽**: `apps/web`이 `@cross-border/core`를
 *   동일 인터페이스(`LLMClient`, 각 step 함수)로 호출하는지는 이 파일이 아니라 코드 인용으로
 *   확인했다(테스트로 새로 고정하지 않은 이유는 아래) — `apps/web/app/api/mediate/route.ts`가
 *   `runUrgencyClassification`/`runToneTransform`/`runBackTranslation` 세 스텝 모두에 **같은
 *   `createOpenAiLLMClient()` 인스턴스**(`llm`, route.ts:91)를 주입한다(route.ts:96,114,127).
 *   이 사실은 `apps/web/app/api/mediate/route.test.ts`가 이미 `/api/mediate` 통합 테스트로
 *   간접 커버하고 있어(각 스텝 mock이 호출됨을 검증) 여기서 중복 테스트를 추가하지 않았다.
 * - **절 2 중 확장 어댑터 쪽 — 물리적으로 검증 불가**: `apps/extension/src/`(layer1
 *   selection.ts/panel.tsx/registry.ts/notice.ts)는 T55~T58(M3) 소관의 스텁이며, 2026-08-05
 *   measured로 `apps/extension/src/**` 전체에 `@cross-border/core` import가 **0건**이다(아래
 *   "확장 어댑터 미호출 measured" 테스트가 이 수치를 실행마다 재확인한다 — `apps/extension/package.json`의
 *   의존성 선언 1건은 있으나 실제 import는 없다). 확장이 core를 실제로 호출하는 코드가 아직 없으므로
 *   "두 어댑터에서 호출된다"의 확장 쪽 절반은 **지금 시점에 증명할 대상 자체가 없다** — T55~T58이
 *   그 소비 코드를 만들 때 검증 대상이 생긴다. 이 파일에서 억지로 확장 쪽에 core를 호출하는 최소
 *   스텁을 추가하지 않았다(T55~T58이 소유할 실제 구현을 침범하지 않기 위함 — orchestrator 지시).
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CORE_SRC_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(CORE_SRC_DIR, '..', '..', '..');
const EXTENSION_SRC_DIR = resolve(REPO_ROOT, 'apps', 'extension', 'src');

/** `packages/core/src` 아래 모든 `.ts` 파일 경로(재귀). */
function listTsFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listTsFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

/**
 * `import ... from '...'` / `import '...'` / `import('...')` / `require('...')` 의 모듈
 * specifier만 뽑는다 — 주석·JSDoc 안의 "apps/web/..." 같은 경로 언급(이 리포에 매우 흔하다,
 * 예: 이 파일 자신의 헤더 주석)까지 위반으로 오탐하지 않기 위해 실제 import 구문만 매칭한다.
 */
function extractImportSpecifiers(content: string): string[] {
  const pattern = /(?:\bfrom\s+|\brequire\(\s*|\bimport\(\s*|\bimport\s+)['"]([^'"]+)['"]/g;
  const specifiers: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

interface ForbiddenRule {
  name: string;
  test: (specifier: string) => boolean;
}

/** `docs/CodingRules.md` Directory Rules `packages/core/src` 행의 금지 목록과 1:1. */
const FORBIDDEN_RULES: ForbiddenRule[] = [
  { name: 'next', test: (s) => s === 'next' || s.startsWith('next/') },
  { name: 'react/react-dom', test: (s) => s === 'react' || s === 'react-dom' },
  { name: '@supabase/*', test: (s) => s.startsWith('@supabase/') },
  { name: 'openai', test: (s) => s === 'openai' },
  { name: 'apps/*', test: (s) => s === 'apps' || s.startsWith('apps/') || /(^|\/)apps\//.test(s) },
];

describe('T15/AC-028(절 1) — packages/core는 어댑터·프레임워크를 import하지 않는다', () => {
  const files = listTsFiles(CORE_SRC_DIR);

  it('스캔 대상 파일이 존재한다(빈 디렉터리면 아래 검사가 공허하게 통과하므로 회귀 방지용으로 먼저 확인)', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  for (const rule of FORBIDDEN_RULES) {
    it(`${rule.name} import가 0건이다(docs/CodingRules.md Directory Rules)`, () => {
      const offenders = files.filter((file) => {
        const specifiers = extractImportSpecifiers(readFileSync(file, 'utf8'));
        return specifiers.some(rule.test);
      });
      expect(offenders).toEqual([]);
    });
  }
});

/** `apps/extension/src`가 없으면(리포 구조 변경) 검증 대상이 없다는 뜻 — 실패시키지 않는다. */
function safeListExtensionFiles(): string[] {
  try {
    return listExtensionFiles(EXTENSION_SRC_DIR);
  } catch {
    return [];
  }
}

// 🔴 M-3(2026-08-05, reviewer REJECTED → 수정) — `⚠️ 역설 주의`: 아래 두 테스트는 AC-028의
// **목표 상태**(확장이 core를 실제로 호출)가 되면 오히려 **실패**하는 구조다. T55~T58 착수 후
// 확장이 `@cross-border/core`를 실제로 import하기 시작하면, 아래 "0건" assert를 뒤집어야 한다
// (예: "허용된 진입점 파일에서만 import되는지" 같은 형태로) — 지금은 "아직 호출 코드가 없다"는
// 사실을 고정할 뿐, "호출하면 안 된다"는 규칙이 아니다.
describe('T15/AC-028(절 2, 확장 쪽) — apps/extension/src의 @cross-border/core 호출 측정', () => {
  // 🔴 M-3 — core 쪽 스캔(84~89행)과 달리 이 스캔은 `safeListExtensionFiles()`가 에러를 삼키고
  // 빈 배열을 반환한다(87행 주석 참조). "파일 0개면 안 됨" 가드가 없으면, `apps/extension/src`가
  // 사라지거나 이름이 바뀌어도(디렉터리 자체가 없어져 스캔이 공허하게 통과) 아래 "import 0건"
  // assert가 조용히 green이 된다 — 디렉터리는 있지만 그 안의 import만 0건인 정상 상태와,
  // 디렉터리 자체가 없어 스캔 대상이 없는 회귀를 구분해야 한다. 2026-08-05 measured 값은 10개
  // (`apps/extension/src/**/*.{ts,tsx}` 전수) — 그 절반 미만이면 대부분 삭제·이름변경된 것으로
  // 보고 실패시킨다.
  it('스캔 대상 파일이 존재한다(디렉터리가 사라지거나 이름이 바뀌면 위 검사가 공허하게 통과하므로 회귀 방지용으로 먼저 확인)', () => {
    const files = safeListExtensionFiles();
    expect(files.length).toBeGreaterThanOrEqual(5);
  });

  it('확장 어댑터 소스에 @cross-border/core import가 0건이다(measured, 2026-08-05 — T55~T58 소관 스텁이라 아직 없음. 이 값이 0이 아니게 되면 위 헤더 주석의 "검증 대상 없음" 판단을 다시 확인해야 한다)', () => {
    const files = safeListExtensionFiles();
    const offenders = files.filter((file) =>
      extractImportSpecifiers(readFileSync(file, 'utf8')).some((s) => s === '@cross-border/core'),
    );
    expect(offenders).toEqual([]);
  });
});

function listExtensionFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = join(dir, entry.name);
    if (statSync(full).isDirectory()) return listExtensionFiles(full);
    return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') ? [full] : [];
  });
}
