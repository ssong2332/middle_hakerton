/**
 * 프라이버시 고지 로직(AC-054/AC-076/AC-068/AC-081) — 어떤 항목을 보여줄지 결정하는
 * 순수 로직과 `chrome.storage.local` 읽기/쓰기. UI 렌더링은 `PrivacyNotice.tsx`가 맡는다.
 *
 * 🔴 이 빌드의 버전 — T66(수신자 후보 감지)·T71(Mark 모드)이 아직 `docs/Tasks.md`에서
 * `todo`라 이 빌드에 없다. AC-068②③/AC-081⑤는 **실제 출시 빌드에 해당하는 쪽만** 고지에
 * 넣으라고 요구하므로, 두 조건부 항목 모두 아직 넣지 않는다 — 하지 않는 일을 고지하면
 * AC-054③ 위반이다. T66 또는 T71이 `done`으로 빌드에 들어가는 시점에 `NOTICE_ITEMS`에
 * 해당 항목을 추가하고 **같은 시점에** `NOTICE_VERSION`을 올려야 한다(AC-076④).
 *
 * 🔴 AC-054② manifest 권한 범위 검토 기록(implementer measured, 2026-08-09) — `docs/Architecture.md`
 * Security "Attack surface" 행이 예고한 "T58에서 1회 검토". `apps/extension/manifest.json`을
 * 코드 검색으로 대조했다: 선언된 `permissions`는 원래 `["activeTab", "storage"]`였다.
 * `storage`는 `shared/token-storage.ts`(session)와 이 파일(local) 둘 다 실사용한다 — 유지.
 * `activeTab`은 리포 전체에서 `chrome.tabs.*`/`chrome.action.*`/`chrome.scripting.*` 호출이
 * 0건이다(grep, 2026-08-09) — 이 확장은 클릭-주입형이 아니라 `content_scripts.matches:
 * ["<all_urls>"]` 정적 선언으로 모든 사이트에 자동 주입되므로 `activeTab`이 부여하는 "사용자가
 * 클릭한 탭에 한해 임시로 접근" 권한을 애초에 쓸 방법이 없다 — **불필요한 권한이라 제거했다**
 * (`manifest.json`에서 삭제). `host_permissions`(빌드 시 `VITE_APP_ORIGIN` 1개로 채워짐)와
 * `externally_connectable`(우리 앱 origin 1개 제한)은 이미 최소 범위였다(`vite.background.config.ts`
 * 헤더 주석 참조) — 그대로 둔다. 결론: 최종 권한 = `storage` + 빌드 시 주입되는 API origin
 * `host_permissions` 1개 + 콘텐츠 스크립트 `<all_urls>`(층 1의 정의상 필수 — Planning Decision #61).
 */

export const NOTICE_VERSION = 1;

export const NOTICE_STORAGE_KEY = 'cbmPrivacyNoticeVersion';

export const NOTICE_ITEMS: readonly string[] = [
  '사용자가 선택한 텍스트만 전송되며, 페이지 전체를 읽거나 저장하지 않습니다.',
  '전송 대상은 우리 백엔드를 경유하는 OpenAI API입니다.',
  '이 확장은 모든 사이트에서 동작할 수 있는 권한을 갖습니다.',
];

/** AC-076③ — 현재 버전이 기록된 버전보다 높을 때만(기록이 없을 때 포함) 재표시한다. */
export function shouldShowNotice(storedVersion: number | null): boolean {
  return storedVersion === null || NOTICE_VERSION > storedVersion;
}

export async function getStoredNoticeVersion(): Promise<number | null> {
  const stored = await chrome.storage.local.get(NOTICE_STORAGE_KEY);
  const value = stored[NOTICE_STORAGE_KEY];
  return typeof value === 'number' ? value : null;
}

export async function setStoredNoticeVersion(version: number): Promise<void> {
  await chrome.storage.local.set({ [NOTICE_STORAGE_KEY]: version });
}
