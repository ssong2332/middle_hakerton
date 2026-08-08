/**
 * 콘텐츠 스크립트 진입점 — `docs/Architecture.md` Conventions 5:
 * "층 1은 층 2를 모른다. 주입은 진입점(`content.ts`)에서 1회."
 *
 * T55가 층 1 선택 감지를 배선했다. T56이 `onSelect`를 중재 패널 열기에 연결한다(AC-052②).
 * 층 2 레지스트리 주입은 T57 범위다 — 여기서는 아직 하지 않는다.
 */
import { initSelectionOverlay } from './layer1/selection';
import { openMediationPanel } from './layer1/panel-mount';

initSelectionOverlay({ onSelect: openMediationPanel });
