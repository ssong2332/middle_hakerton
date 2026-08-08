/**
 * 층 2 어댑터 계약 — 🔒 Freeze Point 4(F4), `docs/Architecture.md` "동결 지점" 표.
 * T57(이 파일)이 소유자다. `Layer2Adapter`의 필드는 여기서 확정된 그대로다 — 추가/삭제/이름
 * 변경 금지(T29/T47/T49가 이 형태에 의존한다).
 */

// F4
// 🔴 F4-a(2026-08-08 · DECISIONS #51 · ADR-0010) — `findInput()`이 `InsertionOrigin`을
// 받는다. docs/Architecture.md "F4 — 층 2 어댑터 계약" 절이 이 코드 블록의 단일 출처다.

/**
 * 선택이 시작된 위치. 층 1이 **선택 시점에** 캡처해 층 2로 넘긴다(F4-a).
 * 객체로 감싼 이유는 docs/Architecture.md F4-a "검토한 대안" 참조.
 */
export interface InsertionOrigin {
  /** 선택이 시작된 host 페이지 요소. 캡처할 수 없었으면 `null`. */
  element: HTMLElement | null;
}

export interface Layer2Adapter {
  id: 'github' | 'slack' | 'gmail';
  matches(url: URL): boolean; // origin/path 판정만
  findInput(origin: InsertionOrigin): HTMLElement | null; // 삽입 대상 DOM 노드
  insert(el: HTMLElement, text: string): boolean; // 삽입만. 🔴 전송 버튼 클릭 코드 없음 (AC-040)
}

/**
 * 현재 URL에 매칭되는(첫 번째) 등록된 어댑터를 찾는다. 없으면 `null` — 층 1은 이 결과가 있을
 * 때만 "입력창에 삽입" 버튼을 렌더한다(AC-053②, 비활성 버튼이 아니라 부재). `adapters`가 빈
 * 배열이어도(층 2 전면 컷) 이 함수는 정상적으로 `null`을 반환하고 예외를 던지지 않는다
 * (AC-053③).
 *
 * 🔴 T57 QA 이월 — `matches()`는 어댑터 구현이며 신뢰할 수 없다. throw하면 이 함수 밖으로
 * 전파되지 않고 해당 어댑터만 건너뛴다(Insert 실패보다 심각한 "패널 자체가 안 열림"을 막는다).
 */
export function findAdapterForUrl(adapters: Layer2Adapter[], url: URL): Layer2Adapter | null {
  return (
    adapters.find((adapter) => {
      try {
        return adapter.matches(url);
      } catch {
        return false;
      }
    }) ?? null
  );
}
