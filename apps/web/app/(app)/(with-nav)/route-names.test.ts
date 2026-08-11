/**
 * T73① — 라우트 이름 정정 6건, `docs/UX.md:890`의 이름을 채택한다(AC-084①②③).
 * 파일 시스템 구조 자체를 단언한다 — `apps/web/app/(app)/onboarding/route-composition.test.ts`와
 * 같은 근거(이 스택에 실제 라우트 트리를 렌더하는 e2e 도구가 없으므로, 폴더 구조 단언이 이
 * 버그 클래스에 대한 가장 직접적인 회귀 테스트다).
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url)); // apps/web/app/(app)/(with-nav)
const apiDir = join(here, '..', '..', 'api'); // apps/web/app/api

describe('T73① 라우트 이름 정정 — AC-084①②③', () => {
  it.each([
    ['dictionary', 'terminology'],
    ['protocol', 'pair-protocols'],
    ['meeting', 'meeting-times'],
    ['summary', 'decisions'],
    ['sent', 'sent-messages'],
    ['samples', 'observation-samples'],
  ])('AC-084① — /%s는 새 이름 /%s로 존재한다', (_oldName, newName) => {
    expect(existsSync(join(here, newName, 'page.tsx'))).toBe(true);
  });

  it.each([
    ['pair-protocols', 'UX-011'],
    ['observation-samples', 'UX-019'],
  ])('AC-084① — /%s/:counterpart 하위 경로가 존재한다(%s)', (routeName) => {
    expect(existsSync(join(here, routeName, '[counterpart]', 'page.tsx'))).toBe(true);
  });

  it.each(['dictionary', 'protocol', 'meeting', 'summary', 'sent', 'samples'])(
    'AC-084② — 이전 이름 /%s 폴더는 남아 있지 않다(0건)',
    (oldName) => {
      expect(existsSync(join(here, oldName))).toBe(false);
    },
  );

  it('AC-084③ — /api/* 디렉터리는 T73① 시점과 동일하다(mediate·messages·profile·ticket, diff 0건)', () => {
    expect(existsSync(join(apiDir, 'mediate'))).toBe(true);
    expect(existsSync(join(apiDir, 'messages'))).toBe(true);
    expect(existsSync(join(apiDir, 'profile'))).toBe(true);
    expect(existsSync(join(apiDir, 'ticket'))).toBe(true);
    // T73①이 새로 만들거나 지운 /api 하위 디렉터리가 없어야 한다 — 당시 이름 4개 그대로.
    // 🔴 T23 — `/api/dictionary`는 `docs/API.md` "GET / POST /api/dictionary · PUT / DELETE
    // /api/dictionary/{id}"가 처음부터 명시한 계약이라 T73① 이후 T23이 정당하게 새로 만든다
    // (페이지 경로는 UX-010 이름 정정에 따라 `/terminology`이지만 API 경로는 그대로 `dictionary`
    // — `docs/UX.md:890` 이름 정정은 페이지 라우트에만 적용되고 API 계약은 별개다). 이 줄만
    // T23이 갱신하고 나머지(협업 규약 등 아직 안 만든 라우트)는 T73①의 원래 단언을 유지한다.
    expect(existsSync(join(apiDir, 'dictionary'))).toBe(true);
    expect(existsSync(join(apiDir, 'terminology'))).toBe(false);
    // 🔴 T66 — `GET /api/pair-protocols`는 `docs/API.md` "GET /api/pair-protocols"가 처음부터
    // 명시한 신규 계약이다(AC-067①, T23의 `/api/dictionary` 선례와 같은 처리 — 정당하게 새로
    // 만드는 라우트는 이 줄만 갱신하고 나머지 단언은 그대로 둔다).
    expect(existsSync(join(apiDir, 'pair-protocols'))).toBe(true);
    // 🔴 T41/T42 — `GET / PUT /api/protocol`은 `docs/API.md` "GET / PUT /api/protocol"이 처음부터
    // 명시한 신규 계약이다(AC-037/AC-075, 같은 T23 선례). `/api/pair-protocols`(T66, 목록 조회)와
    // 겹치지 않는다 — 이 라우트는 개별 규약 4항목의 조회·저장만 한다.
    expect(existsSync(join(apiDir, 'protocol'))).toBe(true);
  });
});
