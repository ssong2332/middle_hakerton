// T57 — F4 층 2 어댑터 계약(`Layer2Adapter`) + 레지스트리 lookup. `docs/Architecture.md`
// "F4 — 층 2 어댑터 계약" 절이 인터페이스 형태의 단일 출처다(동결 지점, 필드 추가/변경 금지).
import { describe, expect, it } from 'vitest';
import { findAdapterForUrl, type Layer2Adapter } from './registry';

function makeAdapter(id: Layer2Adapter['id'], matches: (url: URL) => boolean): Layer2Adapter {
  return { id, matches, findInput: () => null, insert: () => true };
}

describe('findAdapterForUrl', () => {
  it('returns the adapter whose matches() is true for the given url', () => {
    const github = makeAdapter('github', (url) => url.hostname === 'github.com');
    const slack = makeAdapter('slack', (url) => url.hostname === 'app.slack.com');
    const url = new URL('https://github.com/foo/bar');

    expect(findAdapterForUrl([slack, github], url)).toBe(github);
  });

  // AC-053② — 현재 사이트에 매칭되는 층 2 모듈이 없으면 null을 반환한다(층 1은 이 값으로
  // "입력창에 삽입" 버튼을 렌더하지 않는다 — 비활성 버튼이 아니라 부재).
  it('returns null when no registered adapter matches the url', () => {
    const github = makeAdapter('github', () => false);
    expect(findAdapterForUrl([github], new URL('https://example.com'))).toBeNull();
  });

  // AC-053③ — 층 2 모듈을 전부 제거(빈 배열)해도 조회 자체는 에러 없이 null을 반환하고,
  // 층 1 전체 경로가 그대로 동작할 수 있어야 한다.
  it('returns null for an empty adapters array', () => {
    expect(findAdapterForUrl([], new URL('https://example.com'))).toBeNull();
  });

  // T57 QA 이월 — matches()가 throw하면 층 1 패널 열기 자체가 죽는다(Insert 실패보다 심각).
  // 어댑터의 matches()는 신뢰할 수 없는 구현일 수 있으므로 조회 자체가 방어적이어야 한다.
  it('skips an adapter whose matches() throws and still finds a later match', () => {
    const broken = makeAdapter('slack', () => {
      throw new Error('boom');
    });
    const github = makeAdapter('github', (url) => url.hostname === 'github.com');
    const url = new URL('https://github.com/foo/bar');

    expect(findAdapterForUrl([broken, github], url)).toBe(github);
  });

  it('returns null (not throw) when the only adapter matching would throw', () => {
    const broken = makeAdapter('slack', () => {
      throw new Error('boom');
    });
    expect(() => findAdapterForUrl([broken], new URL('https://example.com'))).not.toThrow();
    expect(findAdapterForUrl([broken], new URL('https://example.com'))).toBeNull();
  });
});
