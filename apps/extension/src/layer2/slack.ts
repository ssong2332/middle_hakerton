/**
 * Slack 역삽입 어댑터 — T47(AC-042, AC-040). T57(F4)이 동결하고 ADR-0010(F4-a)이 개정한
 * `Layer2Adapter` 계약을 구현한다. 구조는 T29(`github.ts`)를 그대로 따른다 — 중재 호출·패널
 * 표시는 층 1(T55~T56) 소유, 여기 남는 것은 DOM 선택자 + 삽입 함수뿐이다.
 */
import type { InsertionOrigin, Layer2Adapter } from '../layer1/registry';

function matches(url: URL): boolean {
  try {
    return url.hostname === 'app.slack.com';
  } catch {
    return false;
  }
}

/**
 * 🔴 추정 — 라이브 미검증. 이 환경에는 로그인된 Slack 세션이 없어(메시지 입력창은 인증된
 * 워크스페이스 멤버에게만 렌더된다) 실제 DOM을 확인할 수 없었다. **T47 착수 첫 1시간 스파이크
 * 결과: 실행 불가** — 라이브 Slack 워크스페이스 접근 자체가 이 환경에 없어 ⓐ선택자 특정
 * ⓑ값 인식을 직접 실측할 수 없었다(T29 GitHub 어댑터와 같은 사전 승인된 제약, 여기서 재논의하지
 * 않는다). 아래 선택자는 Slack의 Quill 기반 메시지 컴포저(`app.slack.com`)에 대한 공개 정보
 * 기반 best-effort이며, 배포 전 실제 Slack 페이지에서 라이브 확인이 필요하다(이 프로젝트의 다른
 * 라이브 검증 이월 항목과 같은 부류 — 여기서 별도로 해소하지 않는다).
 *
 * 삽입 메커니즘(`insert()`의 `document.execCommand('insertText', ...)` 사용) 역시 라이브
 * 미검증이다 — 같은 추정 기준을 그대로 적용한다. T29 리뷰 MJ-4가 지적한 대로, Slack의 메시지
 * 입력창은 일반 `<textarea>`가 아니라 Quill 기반 리치 contenteditable 에디터이므로 GitHub
 * 어댑터가 쓰는 raw `textContent` 쓰기는 에디터 내부 모델에 반영되지 않을 수 있어(무음
 * false-success) 채택하지 않았다 — 대신 브라우저 네이티브 편집 명령 파이프라인을 타는
 * `execCommand('insertText', ...)`을 1차 경로로, 그마저 실패하면 `textContent` +
 * `InputEvent` 디스패치를 최후 폴백으로 둔다.
 */
const CANDIDATE_SELECTORS = [
  'div[data-qa="message_input"] div[contenteditable="true"]',
  '.ql-editor[contenteditable="true"]',
  'div[aria-label="Message"][contenteditable="true"]',
] as const;

function isEligibleField(el: Element | null): boolean {
  if (!el) return false;
  return el instanceof HTMLElement && el.isContentEditable === true;
}

/**
 * ADR-0010/F4-a — Slack 워크스페이스 화면에는 메인 컴포저 외에 스레드 답글 컴포저 등 여러
 * contenteditable 입력창이 동시에 존재할 수 있다. 문서 전체를 대상으로 한 첫 매치 선택자는
 * 사용자가 실제로 선택한 필드와 다른 필드를 조용히 골라버릴 수 있다.
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

/** 에디터 전체 내용을 선택 상태로 만든다 — `execCommand('insertText', ...)`가 선택 영역을
 *  덮어쓰는 표준 편집 명령이라, 선택 없이 호출하면 커서 위치에 텍스트가 삽입만 되고 기존 초안이
 *  남는다.
 */
function selectAllContents(el: HTMLElement): void {
  const selection = window.getSelection();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(el);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  document.execCommand('selectAll', false);
}

/** 최후 폴백 — raw `textContent` 쓰기 + 프레임워크가 듣는 `input` 이벤트 수동 디스패치. */
function replaceViaTextContent(el: HTMLElement, text: string): boolean {
  el.textContent = text;
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  return true;
}

/**
 * 값만 채운다 — 전송/제출 버튼 클릭·`.submit()`·`.requestSubmit()` 호출 코드 경로 없음
 * (AC-040). 실제 전송은 사용자가 직접 수행한다.
 *
 * `focus()` 자체가 실패하면(예: 이미 언마운트된 에디터) 그 실패는 execCommand 실패와 성격이
 * 달라 폴백 대상이 아니다 — 바로 `false`로 종결한다. `selectAll`/`insertText` execCommand
 * 호출의 실패(반환값 `false` 또는 throw, 어느 쪽이든)만 `textContent` 폴백으로 이어진다.
 */
function insert(el: HTMLElement, text: string): boolean {
  if (!isEligibleField(el)) return false;

  try {
    el.focus();
  } catch {
    return false;
  }

  let execCommandSucceeded: boolean;
  try {
    selectAllContents(el);
    execCommandSucceeded = document.execCommand('insertText', false, text);
  } catch {
    execCommandSucceeded = false;
  }
  if (execCommandSucceeded) return true;

  try {
    return replaceViaTextContent(el, text);
  } catch {
    return false;
  }
}

export const slack: Layer2Adapter = {
  id: 'slack',
  matches,
  findInput,
  insert,
};
