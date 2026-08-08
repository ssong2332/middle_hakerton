// T29 MJ-3 — layer2/index.ts registration had zero test coverage. This asserts the
// exported `adapters` array is actually wired so `findAdapterForUrl` resolves the
// github adapter for a github.com URL and null for anything else.
import { describe, expect, it } from 'vitest';
import { findAdapterForUrl } from '../layer1/registry';
import { adapters } from './index';
import { github } from './github';

describe('layer2/index — adapters registration', () => {
  it('resolves the github adapter for a github.com PR URL', () => {
    const result = findAdapterForUrl(adapters, new URL('https://github.com/o/r/pull/1'));

    expect(result).toBe(github);
  });

  it('returns null for a site with no registered layer 2 module', () => {
    const result = findAdapterForUrl(adapters, new URL('https://example.com'));

    expect(result).toBeNull();
  });
});
