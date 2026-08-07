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
 * 🔴 Major-1(QA GO, follow-up → 수정) — 애초 설계는 키 하나(`TICKET_DRAFT_SESSION_KEY`)로
 * "티켓 변환 API에 보낼 원문"과 "돌아왔을 때 작성창에 채울 값"을 겸했다. 그런데 전자는 항상
 * **승인 스냅샷**(mediation 실행 시점의 원문 — `ticketOption.offered`가 실제로 이 텍스트를
 * 판정했으므로 라이브 편집을 반영하면 안 된다)이어야 하고, 후자는 **"Convert to Task Ticket"을
 * 누른 순간 작성창에 실제로 있던 라이브 텍스트**여야 한다(스냅샷 이후 사용자가 원문을 더
 * 편집했다면, "Back to message"는 그 편집을 버리지 않고 되돌려줘야 한다 — `docs/UX.md` Exit
 * 문구 "discard the ticket, return to what I was writing"). 두 의미가 다른데 키 하나로
 * 겸하면, 편집 후 "Back to message"를 누를 때 편집분이 조용히 사라진다. 역할을 분리한다:
 *
 * - `TICKET_DRAFT_SESSION_KEY` — **API 소스 전용**. `MediationWorkspace`의 "Convert to Task
 *   Ticket" 클릭 시 승인 스냅샷 원문을 쓰고 `/ticket`으로 이동한다. `TicketWorkspace` 마운트
 *   시 이 키를 읽어 변환 API에 넘길 원문으로만 쓴다(값이 없으면 "원본 메시지 없음" 상태).
 *   `TicketWorkspace`의 "Back to message"/"Use this ticket" 두 exit 모두 이 키를 건드리지
 *   않는다 — 대신 `MediationWorkspace`가 마운트 시(같은 이펙트가 `TICKET_RESTORE_SESSION_KEY`를
 *   읽고 지우는 지점) 이 키도 함께 무조건 지운다(M-A, reviewer 발견 → 수정). `/ticket`으로
 *   이동하면 반드시 `MediationWorkspace`가 먼저 언마운트되므로, 다음에 이 값이 다시 유효해지려면
 *   반드시 그 사이 `MediationWorkspace`가 마운트되어(이 값을 지우고) "Convert to Task Ticket"이
 *   다시 클릭돼야 한다 — 그 클릭 없이 남아 있는 값은 언제나 이전 방문의 잔재이므로, 마운트
 *   시점에 무조건 지워도 진행 중인 티켓 전환 흐름을 방해하지 않는다. 이렇게 해야 AC-058 게이트를
 *   거치지 않은 이후의 `/ticket` 재진입(브라우저 Back/Forward, 북마크, 직접 URL)이 스테일 원문으로
 *   `POST /api/ticket`을 다시 호출하지 않고 "원본 메시지 없음" 상태로 정상 귀결된다.
 * - `TICKET_RESTORE_SESSION_KEY` — **작성창 복원 전용**. "Convert to Task Ticket" 클릭 시점의
 *   **라이브** 작성창 텍스트를 쓴다. `TicketWorkspace`의 "Use this ticket"은 티켓에서 조립한
 *   텍스트로 이 키를 **덮어쓴다**(두 쓰기는 같은 방문 안에서 상호 배타적으로 일어난다 — 방문당
 *   최대 한 번만 `/mediate`로 돌아가므로 "Back to message" 이후 값과 "Use this ticket" 이후
 *   값이 동시에 유효할 일이 없다). `MediationWorkspace` 마운트 시 이 키를 읽어 작성창(`text`)을
 *   복원하고, **읽은 즉시 키를 지운다** — 한 번 소비된 값이 관계없는 이후 방문에서 다시
 *   나타나지 않게 한다(스테일 재노출 방지, T21/T23 리뷰에서 반복된 교훈).
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
export const TICKET_RESTORE_SESSION_KEY = 'mediation:ticket:restoreText';
export const TICKET_DRAFT_RECIPIENT_SESSION_KEY = 'mediation:ticket:draftRecipient';
