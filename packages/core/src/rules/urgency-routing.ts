// CRITICAL 즉시 발송 경로 판정 — AC-004(override 반영) · AC-005(CRITICAL은 예약·지연 경로를
// 건너뛰고 즉시 발송 경로로 진행) 담당: [BE-A] T9.
// `docs/Architecture.md` Data Flow "① 웹앱 중재" ①②: "C1 분류 → CRITICAL이면 예약·지연
// 경로를 건너뛰고 톤 정제만".
import type { UrgencyLevel } from '../contract';

/**
 * 메시지가 밟을 발송 경로(AC-005).
 * - `'immediate'` — CRITICAL. 예약·지연 관련 단계를 건너뛰고 톤 정제만 적용해 즉시 발송한다.
 * - `'standard'` — NORMAL/LOW. 예약 발송(UX-006)·기한 협상(UX-005)이 선택적으로 열릴 수 있다.
 */
export type DeliveryPath = 'immediate' | 'standard';

/**
 * 🔴 **이 함수가 반환하는 판정을 실제로 소비해 무언가를 건너뛰는 코드는 이 저장소에 아직
 * 없다.** `docs/Architecture.md` Data Flow ②가 가리키는 "예약·지연 경로"(UX-005 Response
 * Deadline Negotiation, UX-006 Scheduled Send)는 아직 구현되어 있지 않다(`docs/Tasks.md`
 * 해당 태스크 — 예약은 T32, 지연은 T39·T40 — 는 이 커밋 시점에 `todo`다). 이 함수는 그 코드가 추가될 때 지켜야
 * 할 분기 지점을 지금 타입으로 고정해 두는 것이 목적이다(`docs/Architecture.md` 설계 제1원칙
 * R2 "경계는 먼저 고정하고 내용은 나중에 채운다") — **억지로 스킵 로직을 만들어 넣지 않는다.**
 * 향후 그 단계들은 이 함수가 `'immediate'`를 반환할 때 자기 자신을 건너뛰어야 한다.
 */
export function resolveDeliveryPath(urgency: UrgencyLevel): DeliveryPath {
  return urgency === 'CRITICAL' ? 'immediate' : 'standard';
}

/**
 * 사용자 override가 있으면 override 값을, 없으면 C1 판정을 그대로 쓴다(AC-004).
 * `RequestContext.urgencyOverride`(`contract.ts`)의 판정 로직 단일 출처 — 호출부(Route
 * Handler)가 이 로직을 다시 구현하지 않는다.
 */
export function resolveEffectiveUrgency(
  classified: UrgencyLevel,
  override: UrgencyLevel | null,
): UrgencyLevel {
  return override ?? classified;
}
