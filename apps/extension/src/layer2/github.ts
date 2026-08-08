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
 */
const CANDIDATE_SELECTORS = [
  '#new_comment_field',
  'textarea[name="comment[body]"]',
  'textarea[aria-label="Comment body"]',
] as const;

function findInput(): HTMLElement | null {
  try {
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
      el.value = text;
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
