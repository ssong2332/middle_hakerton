/**
 * 콘텐츠 스크립트 진입점 — `docs/Architecture.md` Conventions 5:
 * "층 1은 층 2를 모른다. 주입은 진입점(`content.ts`)에서 1회."
 *
 * T55가 층 1 선택 감지를 배선했다. T56이 `onSelect`를 중재 패널 열기에 연결했다(AC-052②).
 * T57 — 여기서 현재 페이지 URL로 층 2 레지스트리(`layer2/index.ts`의 `adapters`)를 조회해
 * 매칭되는 어댑터(또는 없으면 `null`)를 `openMediationPanel`에 넘긴다. `layer1/`은
 * `layer2/**`를 import할 수 없으므로(`docs/CodingRules.md` Directory Rules), 이 조합은 layer1도
 * layer2도 아닌 이 진입점 파일만 할 수 있다 — `host === 'github.com'` 같은 사이트 식별 분기가
 * 아니라 제네릭 레지스트리 조회다(층 1의 정의, Planning Decision #61과 충돌하지 않는다).
 *
 * T58 — `ensureNoticeAcknowledged()`가 끝난 뒤에만 선택 오버레이를 켠다(UX-017 Entry:
 * "shown before any floating-button/panel interaction is reachable"). 이미 최신 버전이
 * 확인된 상태(AC-076③)라면 이 await는 사실상 즉시 통과한다.
 */
import { initSelectionOverlay } from './layer1/selection';
import { openMediationPanel } from './layer1/panel-mount';
import { findAdapterForUrl } from './layer1/registry';
import { ensureNoticeAcknowledged } from './layer1/notice-mount';
import { adapters } from './layer2';

void ensureNoticeAcknowledged().then(() => {
  initSelectionOverlay({
    onSelect: (payload) => {
      const adapter = findAdapterForUrl(adapters, new URL(window.location.href));
      openMediationPanel(payload, adapter);
    },
  });
});
