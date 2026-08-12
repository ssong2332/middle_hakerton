/**
 * 층 1(선택 오버레이) 테마 + 웹앱 디자인 토큰 통일 (신규 2026-08-12, T81; 팔레트 값 v8.0 브랜드
 * 리디자인으로 교체, docs/UX.md Design Tokens 참조).
 *
 * 🔴 (2026-08-12, 사용자 실사용 재현 — 후속) T81 원안은 `window.matchMedia('(prefers-color-scheme:
 * dark)')`로 OS/브라우저 다크모드 신호를 자동으로 따라갔다. 사용자가 실제 다크 테마 페이지에서
 * 확장을 켜 보고 "기본적으로 흰색으로 하고, 다크모드는 따로 설정을 통해서" 하자고 요청했다 —
 * 즉 OS 신호 자동 추종을 그만두고, **기본값은 항상 라이트**이며 사용자가 패널 안 토글을 직접
 * 눌러야만(그리고 그 선택이 `chrome.storage.local`에 저장돼 다음 방문에도 유지돼야) 다크로
 * 바뀐다. `notice.ts`(AC-076 고지 버전 저장)가 이미 쓰는 "chrome.storage.local 비동기 읽기/쓰기
 * + 순수 로직 분리" 패턴을 그대로 재사용한다 — 이 리포에 이미 있는 선례를 새로 발명하지 않는다.
 *
 * light 팔레트 값은 `apps/web/app/globals.css`의 v8.0 토큰과 동일하게 맞춘다(웹앱과의 시각적
 * 통일성). dark 팔레트는 이 리포에 선례가 없어 이번에도 새로 정했다 — WCAG 2.1 상대휘도 공식으로
 * 재계산한 결과: text/bg ≈14.7:1, accent/bg(양방향) ≈7.05:1, accentText/accent ≈7.05:1,
 * border/bg ≈4.49:1, danger/bg ≈8.94:1 — 전부 AA 기준 통과.
 * 🔴 **알려진 예외(측정값, 숨기지 않음)**: light 팔레트의 accentText(#fff)/accent(#ff6100)는
 * ≈3.02:1로 일반 텍스트 AA(4.5:1) 미달, UI 컴포넌트 기준(3:1)만 충족한다 — 사용자가 제공한
 * Claude Design 목업(`사이 확장 패널.dc.html`)이 이 정확한 조합(흰 텍스트 + 주황 버튼 배경)을
 * 명시했고, 버튼 라벨은 볼드지만 large-text 임계값(18.66px)보다 작아 엄밀히는 AA 미달이다.
 * 채도 높은 주황 계열의 흔한 트레이드오프이며(예: 다수의 실서비스가 같은 조합을 쓴다) 사용자
 * 승인을 받은 브랜드 색상을 임의로 어둡게 바꾸지 않았다 — 값을 바꾸려면 별도 논의가 필요하다.
 */

export interface Layer1Theme {
  bg: string;
  surface: string;
  /** 입력/select/모드 토글 트랙처럼 "채운" 필(pill) 배경 — `apps/web` --color-surface-alt와
   * 같은 역할. `surface`(패널 카드 배경, 흰색)와는 다른 톤이어야 목업의 필드 대비가 산다.
   * (2026-08-12 후속 — 사용자가 목업 대조를 요청해 발견: 이전엔 이 토큰이 없어 입력 필드가
   * `surface`를 그대로 써서 패널과 같은 흰색으로 렌더됐다, 목업은 #F2F4F6.) */
  surfaceAlt: string;
  text: string;
  border: string;
  /** 패널 바깥 테두리 전용 — `border`보다 옅다(목업 `#EEF1F4` vs 입력 테두리류 `#E5E8EB`). */
  borderThin: string;
  accent: string;
  accentHover: string;
  accentText: string;
  danger: string;
  shadow: string;
  /** 패널의 2단 그림자 중 얇은 쪽(`0 2px 8px`) — `shadow`는 굵은 쪽(`0 24px 60px`)에 쓴다. */
  shadowFine: string;
}

export type ThemeMode = 'light' | 'dark';

const LIGHT: Layer1Theme = {
  bg: '#F9FAFB', // apps/web globals.css --color-bg
  surface: '#FFFFFF', // --color-surface
  surfaceAlt: '#F2F4F6', // --color-surface-alt
  text: '#191F28', // --color-text
  border: '#E5E8EB', // --border-thin-alt
  borderThin: '#EEF1F4', // --border-thin
  accent: '#FF6100', // --color-accent
  accentHover: '#E85700', // --color-accent-hover
  accentText: '#FFFFFF',
  danger: '#C40029', // --color-danger-text
  shadow: 'rgba(17, 24, 39, 0.24)', // --shadow-elevated
  shadowFine: 'rgba(17, 24, 39, 0.08)',
};

const DARK: Layer1Theme = {
  bg: '#211f1e',
  surface: '#2c2a29',
  surfaceAlt: '#171615', // bg보다 더 짙게 — 라이트가 bg보다 더 옅은 surfaceAlt를 쓰는 것과
  // 대칭인 관계(surface는 bg에서 밝은 쪽으로, surfaceAlt는 어두운 쪽으로 한 단계). WCAG:
  // text(#f3f2f2)/surfaceAlt ≈16.17:1 — AA 여유 통과(2026-08-12 측정).
  text: '#f3f2f2',
  border: '#8a857f',
  borderThin: '#4a4744',
  accent: '#ff8a54',
  accentHover: '#ffa374',
  accentText: '#211f1e',
  danger: '#ffab8a',
  shadow: 'rgba(0, 0, 0, 0.55)',
  shadowFine: 'rgba(0, 0, 0, 0.3)',
};

export const THEME_MODE_STORAGE_KEY = 'cbmLayer1ThemeMode';

// 기본값은 항상 'light' — OS/브라우저 신호를 더는 참고하지 않는다(위 헤더 주석).
let currentMode: ThemeMode = 'light';
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** 현재 적용 중인 모드('light'|'dark')를 동기적으로 읽는다. */
export function getThemeMode(): ThemeMode {
  return currentMode;
}

/** 호출 시점의 모드에 맞는 팔레트를 반환한다. */
export function getLayer1Theme(): Layer1Theme {
  return currentMode === 'dark' ? DARK : LIGHT;
}

/** 현재 모드에 맞는 CSS `color-scheme` 값 — 브라우저의 강제 다크모드 재처리를 막는다
 * (우리가 이미 명시적으로 테마를 적용했음을 렌더링 엔진에 알린다). */
export function getLayer1ColorScheme(): ThemeMode {
  return currentMode;
}

/**
 * 모드를 바꾸고 구독자에게 알린 뒤, `chrome.storage.local`에 저장한다(다음 방문에도 유지).
 * `chrome.storage`가 없는 환경(테스트 등)에서는 저장을 건너뛰고 메모리 상태만 바꾼다.
 */
export function setThemeMode(mode: ThemeMode): void {
  if (currentMode === mode) return;
  currentMode = mode;
  notify();
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    void chrome.storage.local.set({ [THEME_MODE_STORAGE_KEY]: mode });
  }
}

export function toggleThemeMode(): void {
  setThemeMode(currentMode === 'dark' ? 'light' : 'dark');
}

/**
 * 콘텐츠 스크립트 진입점에서 1회 호출한다(`initSelectionOverlay()`가 호출) — 저장된 선택을
 * 비동기로 읽어 메모리 상태에 반영한다. 저장된 값이 없으면(첫 실행) 기본값 'light'를 그대로
 * 유지한다 — 이 함수 자체가 'light'로 되돌리지 않는다(이미 'light'가 기본이므로 아무 것도
 * 안 해도 같다). `chrome.storage`가 없는 환경에서는 조용히 아무 것도 하지 않는다.
 */
export async function loadStoredThemeMode(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  try {
    const stored = (await chrome.storage.local.get(THEME_MODE_STORAGE_KEY)) as Record<
      string,
      unknown
    >;
    const value = stored[THEME_MODE_STORAGE_KEY];
    if (value === 'light' || value === 'dark') {
      currentMode = value;
      notify();
    }
  } catch {
    // 저장소 접근 실패 — 기본값(light) 유지, 조용히 무시한다(고지·설정 저장 실패가 UI를
    // 막아서는 안 된다).
  }
}

/**
 * 모드 전환을 실시간으로 반영하고 싶을 때 구독한다. 반환값은 구독 해제 함수.
 */
export function subscribeLayer1ThemeChange(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}
