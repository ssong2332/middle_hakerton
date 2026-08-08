/**
 * Gmail 역삽입 어댑터 — T49(AC-051, AC-040). T57(F4)이 동결한 `Layer2Adapter` 계약을 구현한다.
 * 중재 호출·패널 표시는 층 1(T55~T56) 소유 — 여기 남는 것은 DOM 선택자 + 삽입 함수뿐이다.
 * 구조는 T29(`github.ts`)를 그대로 따른다.
 */
import type { InsertionOrigin, Layer2Adapter } from '../layer1/registry';

function matches(url: URL): boolean {
  try {
    return url.hostname === 'mail.google.com';
  } catch {
    return false;
  }
}

/**
 * 🔴 추정 — 라이브 미검증. 이 환경에는 로그인된 Gmail 세션이 없어(작성 창은 인증된 사용자에게만
 * 렌더된다) 실제 DOM을 확인할 수 없었다. 아래 선택자는 Gmail 작성 창의 일반 지식 기반
 * best-effort이며, 배포 전 실제 mail.google.com 페이지에서 라이브 확인이 필요하다(이 프로젝트의
 * 다른 라이브 검증 이월 항목과 같은 부류 — 여기서 별도로 해소하지 않는다). 삽입 메커니즘
 * (아래 `insert()`의 execCommand 기반 접근) 역시 라이브 미검증이다 — 같은 추정 기준을 그대로
 * 적용한다.
 */
const CANDIDATE_SELECTORS = [
  'div[aria-label="Message Body"]',
  'div.Am.Al.editable',
  'div[g_editable="true"]',
] as const;

function isEligibleField(el: Element | null): boolean {
  return el instanceof HTMLElement && el.isContentEditable;
}

/**
 * ADR-0010/F4-a — Gmail은 동시에 여러 작성 창이 열려 있을 수 있다(메인 작성 창 + 여러 개의
 * 축소된 답장 창). 문서 전체를 대상으로 한 첫 매치 선택자는 사용자가 실제로 선택한 필드와
 * 다른 필드를 조용히 골라버릴 수 있다 — `docs/UX.md:187`(UF-011 step 6)·`docs/UX.md:760`
 * (UX-016 Exit) 모두 "선택이 시작된 필드"로의 삽입을 요구한다. T29 리뷰어는 Gmail의 멀티
 * 작성창 위험이 GitHub보다 더 심각하다고 지적했다.
 *
 * 🔴 F4-a 층 2 규칙 3 — 포커스/선택 상태를 여기서 직접 읽지 않는다. 층 1이 선택 시점에
 * 캡처해 넘긴 `origin`만 검증(`isConnected`)·해석(`closest`)한다.
 */
function resolveFromOrigin(origin: InsertionOrigin): HTMLElement | null {
  const element = origin.element;
  if (!element || !element.isConnected) return null;
  if (isEligibleField(element)) return element;

  const closest = element.closest<HTMLElement>(
    [...CANDIDATE_SELECTORS, '[contenteditable="true"]'].join(', '),
  );
  return isEligibleField(closest) ? closest : null;
}

function findInput(origin: InsertionOrigin): HTMLElement | null {
  try {
    const resolved = resolveFromOrigin(origin);
    if (resolved) return resolved;

    // 마지막 폴백 — origin이 없거나·끊겼거나·해석 불가일 때만(F4-a 층 2 규칙 4).
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
 *
 * Gmail의 작성 창은 React로 제어되는 리치 contenteditable 에디터라 T29(MJ-4)에서 배운 대로
 * 단순 `textContent` 대입만으로는 프레임워크가 변경을 인식하지 못할 수 있다. 먼저
 * `document.execCommand('insertText', ...)`를 시도해 브라우저 네이티브 편집 파이프라인을
 * 거치게 하고(대부분의 리치 에디터가 이 경로를 관찰한다), 실패·미지원 시에만 수동
 * textContent 대입 + `input` 이벤트 디스패치로 폴백한다.
 */
function insert(el: HTMLElement, text: string): boolean {
  if (!(el instanceof HTMLElement) || !el.isContentEditable) return false;

  try {
    el.focus();
  } catch {
    return false;
  }

  try {
    let execCommandSucceeded = false;
    try {
      document.execCommand('selectAll', false);
      execCommandSucceeded = document.execCommand('insertText', false, text);
    } catch {
      execCommandSucceeded = false;
    }

    if (!execCommandSucceeded) {
      el.textContent = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    return true;
  } catch {
    return false;
  }
}

export const gmail: Layer2Adapter = {
  id: 'gmail',
  matches,
  findInput,
  insert,
};
