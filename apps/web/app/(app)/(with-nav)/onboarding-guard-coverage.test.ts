/**
 * M-2(reviewer, T73 handoff) — `apps/web/lib/onboarding-guard.test.ts`의 예전 "ⓐ-1 /mediate"·
 * "ⓐ-2 /profile" 테스트는 `enforceOnboardingRedirect()`가 URL/path 인자를 받지 않기 때문에 실제로는
 * 동일한 함수 호출을 이름만 다르게 두 번 반복했을 뿐, "2개 이상의 서로 다른 URL에서 리다이렉트가
 * 걸린다"(`docs/Tasks.md` T73 판정 조건 ⓐ)는 것을 증명하지 못했다.
 *
 * 이 함수가 URL 인자를 받지 않는 것은 버그가 아니라 설계다 — 호출부가 `(with-nav)/layout.tsx`
 * 하나뿐이고, Next.js App Router는 파일 위치(가장 가까운 조상 layout)로 레이아웃을 자동
 * 합성하므로(`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
 * route-groups.md`), 이 그룹 안의 어떤 라우트도 이 레이아웃을 건너뛸 방법이 없다. 즉 "모든 URL에
 * 실제로 걸린다"는 주장은 함수 단위 테스트가 아니라 **파일 구조 단언**으로 증명하는 게 정직하다
 * (`apps/web/app/(app)/onboarding/route-composition.test.ts`·`apps/web/app/(app)/(with-nav)/
 * route-names.test.ts`와 같은 이 리포의 기존 관례 — 이 스택에 실제 라우트 트리를 렌더하는 e2e
 * 도구가 없다).
 *
 * 이 테스트가 증명하는 것 (판정 조건 ⓐ의 구조적 근거):
 * 1. `(with-nav)` 아래 실제 라우트 디렉터리가 2개보다 많다(= 판정 조건 ⓐ가 요구하는 "2+ 서로
 *    다른 URL"이 실존한다).
 * 2. 그 디렉터리들 중 어느 것도 자기 자신의 `layout.tsx`를 갖지 않는다 — 있었다면 그 라우트가
 *    독자 로직으로 상위 `(with-nav)/layout.tsx`(따라서 `enforceOnboardingRedirect()` 호출)를
 *    우회할 잠재적 경로가 될 수 있었다.
 * 3. `(with-nav)/layout.tsx` 자신은 `enforceOnboardingRedirect()`를 호출한다(레이아웃 단위 동작은
 *    `apps/web/app/(app)/(with-nav)/layout.test.tsx`가 별도로 검증한다 — 여기서는 커버리지
 *    범위만 다룬다).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url)); // apps/web/app/(app)/(with-nav)

/** `(with-nav)` 직계 자식 중 라우트 디렉터리만 고른다 — 파일(layout.tsx 등)과 테스트 파일 제외. */
function routeDirs(): string[] {
  return readdirSync(here).filter((name) => {
    const full = join(here, name);
    return statSync(full).isDirectory();
  });
}

describe('(with-nav) 온보딩 가드 커버리지 — M-2', () => {
  it('ⓐ — (with-nav) 아래 라우트 디렉터리가 2개보다 많다(판정 조건 ⓐ의 "2+ URL" 전제가 실존한다)', () => {
    const dirs = routeDirs();
    expect(dirs.length).toBeGreaterThan(2);
    // `docs/UX.md:890` Information Architecture "Routes"의 인증 화면 목록과 대조 — onboarding은
    // 이 그룹 밖(형제)이므로 여기 없다.
    expect(dirs.sort()).toEqual(
      [
        'decisions',
        'enrichment',
        'feedback',
        'mediate',
        'meeting-times',
        'observation-samples',
        'pair-protocols',
        'profile',
        'sent-messages',
        'terminology',
        'ticket',
      ].sort(),
    );
  });

  it('ⓐ — 그 라우트 디렉터리 중 어느 것도 자기 layout.tsx로 (with-nav)/layout.tsx를 건너뛰지 않는다(0건)', () => {
    for (const dir of routeDirs()) {
      expect(existsSync(join(here, dir, 'layout.tsx'))).toBe(false);
    }
  });

  it('ⓐ — (with-nav)/layout.tsx가 enforceOnboardingRedirect()를 호출한다(이 그룹의 유일한 진입점)', () => {
    const layoutSource = readFileSync(join(here, 'layout.tsx'), 'utf-8');
    expect(layoutSource).toMatch(/enforceOnboardingRedirect/);
  });
});
