/**
 * GitHub 역삽입 어댑터 — T29(AC-021, AC-040). T57(F4)이 동결한 `Layer2Adapter` 계약을 구현한다.
 * 중재 호출·패널 표시는 층 1(T55~T56) 소유 — 여기 남는 것은 DOM 선택자 + 삽입 함수뿐이다.
 */
import type { Layer2Adapter } from '../layer1/registry';

function matches(url: URL): boolean {
  try {
    return url.hostname === 'github.com';
  } catch {
    return false;
  }
}

/**
 * 🔴 추정 — 라이브 미검증. 이 환경에는 로그인된 GitHub 세션이 없어(코멘트 입력창은 인증된
 * 사용자에게만 렌더된다) 실제 DOM을 확인할 수 없었다. 아래 선택자는 GitHub PR/이슈 코멘트
 * 폼의 일반 지식 기반 best-effort이며, 배포 전 실제 github.com 페이지에서 라이브 확인이
 * 필요하다(이 프로젝트의 다른 라이브 검증 이월 항목과 같은 부류 — 여기서 별도로 해소하지 않는다).
 * 삽입 메커니즘(아래 `insert()`의 네이티브 setter 사용) 역시 React로 제어되는 입력창과
 * 리치 contenteditable 에디터 모두에 대해 라이브 미검증이다 — 같은 추정 기준을 그대로 적용한다.
 */
const CANDIDATE_SELECTORS = [
  '#new_comment_field',
  'textarea[name="comment[body]"]',
  'textarea[aria-label="Comment body"]',
] as const;

function isEligibleField(el: Element | null): el is HTMLElement {
  if (!el) return false;
  return el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable);
}

/**
 * PR 페이지에는 코멘트 입력창이 여러 개 있을 수 있다(메인 "leave a comment" 박스 +
 * 인라인 리뷰 스레드 답글 박스들). 문서 전체를 대상으로 한 첫 매치 선택자는 사용자가
 * 실제로 선택한 필드와 다른 필드를 조용히 골라버릴 수 있다 — `docs/UX.md:187`(UF-011
 * step 6)·`docs/UX.md:760`(UX-016 Exit) 모두 "선택이 시작된 필드"로의 삽입을 요구한다.
 * 후보 선택자 목록보다 먼저, 실제 포커스·선택 위치를 우선 확인한다.
 */
function findOriginatingInput(): HTMLElement | null {
  const active = document.activeElement;
  if (isEligibleField(active)) return active;

  const selection = window.getSelection?.();
  let node: Node | null = selection?.anchorNode ?? null;
  while (node) {
    if (isEligibleField(node as Element)) return node as HTMLElement;
    node = node.parentNode;
  }
  return null;
}

function findInput(): HTMLElement | null {
  try {
    const originating = findOriginatingInput();
    if (originating) return originating;

    for (const selector of CANDIDATE_SELECTORS) {
      const el = document.querySelector<HTMLElement>(selector);
      if (el) return el;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 값만 채운다 — 전송/제출 버튼 클릭·`.submit()`·`.requestSubmit()` 호출 코드 경로 없음
 * (AC-040). 실제 전송은 사용자가 직접 수행한다.
 */
function insert(el: HTMLElement, text: string): boolean {
  try {
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      // React-controlled inputs (GitHub's Primer/React comment composer) shadow the
      // prototype's native `value` accessor with an own-property tracker. Plain
      // `el.value = text` hits that shadow, not the native setter, so React never sees
      // the change and the later `input` event is treated as a no-op. Invoke the
      // prototype's native setter directly to bypass any such instance-level shadow.
      const proto =
        el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(el, text);
      } else {
        el.value = text;
      }
    } else if (el.isContentEditable) {
      el.textContent = text;
    } else {
      return false;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  } catch {
    return false;
  }
}

export const github: Layer2Adapter = {
  id: 'github',
  matches,
  findInput,
  insert,
};
