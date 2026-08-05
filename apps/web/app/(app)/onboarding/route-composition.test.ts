/**
 * Major 1(reviewer 5차 REJECTED → 수정) — `docs/UX.md:893`: 상시 내비게이션(로그아웃 포함)은
 * "UX-003(onboarding) 제외 전 인증 화면"에서만 보인다. Next.js App Router는 파일 위치(가장
 * 가까운 조상 `layout.tsx`)로 레이아웃을 자동 합성하므로(`node_modules/next/dist/docs/01-app/
 * 03-api-reference/03-file-conventions/route-groups.md` — "Opting specific route segments into
 * sharing a layout, while keeping others out"), "온보딩에 로그아웃 버튼이 없다"는 사실은
 * 컴포넌트를 직접 렌더해서는 검증할 수 없다(온보딩 페이지 자체는 애초에 LogoutButton을 import한
 * 적이 없다 — 버그는 온보딩 코드가 아니라 온보딩이 속한 라우트 그룹의 위치였다). 이 스택에는
 * Playwright 등 실제 라우트 트리를 렌더하는 e2e 도구가 없으므로, 파일 시스템 구조 자체를
 * 단언하는 것이 이 버그 클래스에 대한 가장 직접적인 회귀 테스트다.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const appGroupDir = join(here, '..'); // apps/web/app/(app)

describe('(app)/onboarding 라우트 합성 — 로그아웃 버튼을 끌어들이지 않는다 (Major 1)', () => {
  it('`(app)` 그룹 자체에는 layout.tsx가 없다 — 있으면 onboarding도 그 레이아웃을 상속한다', () => {
    expect(existsSync(join(appGroupDir, 'layout.tsx'))).toBe(false);
  });

  it('onboarding은 로그아웃 버튼을 렌더하는 그룹(`(with-nav)`) 밖의 형제 라우트다', () => {
    expect(existsSync(join(appGroupDir, '(with-nav)', 'onboarding'))).toBe(false);
    expect(existsSync(join(here, 'page.tsx'))).toBe(true);
  });

  it('LogoutButton을 렌더하는 레이아웃은 `(with-nav)` 안에만 존재한다', () => {
    const navLayout = join(appGroupDir, '(with-nav)', 'layout.tsx');
    expect(existsSync(navLayout)).toBe(true);
    expect(readFileSync(navLayout, 'utf-8')).toMatch(/LogoutButton/);
  });
});
