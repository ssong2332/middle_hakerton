/**
 * T25 — UX-004 ↔ UX-007 사이의 원문/티켓 텍스트 교환 채널.
 *
 * `/mediate`와 `/ticket`은 서로 다른 Next.js 라우트(별개 페이지)라 컴포넌트 트리가 공유되지
 * 않는다 — `MediationWorkspace`(`/mediate`)가 클라이언트 라우팅으로 `/ticket`으로 이동하면
 * 언마운트되고, `TicketWorkspace`(`/ticket`)가 새로 마운트된다. 두 화면 사이에서 최대 5,000자
 * (소프트 캡, AC-061) 분량일 수 있는 메시지 원문을 들고 다녀야 하므로, URL 쿼리스트링(길이 제한·
 * 인코딩 위험)이나 이 리포에 아직 없는 새 상태 관리 라이브러리 대신, 브라우저 표준
 * `sessionStorage`를 쓴다 — 탭을 벗어나면 자동 소멸하고, 새 의존성이 없다.
 *
 * 키 하나로 양방향을 다 표현한다("돌아갔을 때 작성창에 채울 값"이라는 단일 의미):
 * - `MediationWorkspace`의 "Convert to Task Ticket" 클릭 → 이 키에 **원문**을 쓰고 `/ticket`으로
 *   이동한다.
 * - `TicketWorkspace` 마운트 시 이 키를 읽어 변환 API에 넘길 원문으로 쓴다. 값이 없으면(직접 URL
 *   접근 등) "원본 메시지 없음" 상태를 보여준다 — 키를 아직 지우지 않는다.
 * - `TicketWorkspace`의 "Back to message" → 키를 **건드리지 않고** `/mediate`로 돌아간다(원문이
 *   그대로 남아 있어야 `MediationWorkspace`가 복원할 수 있다).
 * - `TicketWorkspace`의 "Use this ticket" → 키를 **티켓에서 조립한 텍스트로 덮어쓰고** `/mediate`로
 *   이동한다.
 * - `MediationWorkspace` 마운트 시 이 키를 읽어 작성창(`text`)을 복원하고, **읽은 즉시 키를
 *   지운다** — 한 번 소비된 값이 관계없는 이후 방문에서 다시 나타나지 않게 한다(스테일 재노출
 *   방지, T21/T23 리뷰에서 반복된 교훈).
 *
 * MAJ-3(reviewer follow-up) — `/ticket`을 다녀오면 `MediationWorkspace`가 통째로 재마운트되므로
 * `recipient` state도 함께 초기화된다. 원문 재입력은 없지만(위 키가 이미 복원한다) 받는 사람만
 * 다시 입력해야 하는 것은 순수한 마찰이라, 별도 키 하나로 받는 사람 값만 같은 원리로 들고 다닌다
 * (전체 `MediationResult`/`approvalSnapshot`은 들고 다니지 않는다 — 티켓 우회 후 C1→C2→C4를
 * 다시 돌리는 것은 이 플로우의 설계상 허용된 동작이고, 재입력 마찰이 있는 필드는 받는 사람뿐이다).
 * `TicketWorkspace`는 이 키를 전혀 건드리지 않는다 — "Back to message"/"Use this ticket" 두 exit
 * 모두 그대로 통과시킨다.
 */
export const TICKET_DRAFT_SESSION_KEY = 'mediation:ticket:draftText';
export const TICKET_DRAFT_RECIPIENT_SESSION_KEY = 'mediation:ticket:draftRecipient';
