// T29 MJ-3 — layer2/index.ts registration had zero test coverage. This asserts the
// exported `adapters` array is actually wired so `findAdapterForUrl` resolves the
// github adapter for a github.com URL and null for anything else.
//
// 🔴 QA NO-GO fix (2026-08-08) — these 2 tests were green from the commit that added
// them because `adapters` already contained `[github]` in the same commit, so no red
// run existed (docs/DefinitionOfDone.md Gate item 13). Genuine red captured by
// temporarily setting `adapters` to `[]` in index.ts and running
// `npx vitest run apps/extension/src/layer2/index.test.ts --pool=threads`:
//   × resolves the github adapter for a github.com PR URL
//     AssertionError: expected null to be { id: 'github', ... }
// The second test ("returns null for a site with no registered layer 2 module")
// legitimately passes in both states — example.com never matches, registered or not —
// so it is not vacuous, it just isn't the test that proves registration. `adapters`
// was then restored to `[github]` and both tests passed again (2 passed).
import { describe, expect, it } from 'vitest';
import { findAdapterForUrl } from '../layer1/registry';
import { adapters } from './index';
import { github } from './github';
import { slack } from './slack';

describe('layer2/index — adapters registration', () => {
  it('resolves the github adapter for a github.com PR URL', () => {
    const result = findAdapterForUrl(adapters, new URL('https://github.com/o/r/pull/1'));

    expect(result).toBe(github);
  });

  it('returns null for a site with no registered layer 2 module', () => {
    const result = findAdapterForUrl(adapters, new URL('https://example.com'));

    expect(result).toBeNull();
  });

  // T47 — slack adapter must be registered alongside github so the mediation panel
  // renders an "Insert" affordance on app.slack.com (AC-042). (gmail/T49 is not yet
  // merged into this worktree's dev line.)
  it('resolves the slack adapter for an app.slack.com URL', () => {
    const result = findAdapterForUrl(adapters, new URL('https://app.slack.com/client/T000/C000'));

    expect(result).toBe(slack);
  });

  it('still resolves the github adapter for a github.com URL (not shadowed by slack)', () => {
    const result = findAdapterForUrl(adapters, new URL('https://github.com/o/r/pull/1'));

    expect(result).toBe(github);
  });
});
