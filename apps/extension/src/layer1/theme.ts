/**
 * 층 1(선택 오버레이) 다크모드 대응 + 웹앱 디자인 토큰 통일 (신규 2026-08-12, T81).
 *
 * `panel-mount.tsx`가 이미 밝혔듯 패널/버튼은 Shadow DOM(또는 버튼은 host 라이트 DOM 안이지만
 * host 페이지 CSS를 참조하지 않는 인라인 style)이라 host 페이지의 다크모드 여부를 상속받지
 * 않는다 — 대신 `window.matchMedia('(prefers-color-scheme: dark)')`로 사용자의 실제 OS/브라우저
 * 설정을 직접 읽는다. 이 신호는 host 페이지와 무관하다(host가 다크든 라이트든 우리 UI는 사용자의
 * 실제 선호를 따른다).
 *
 * light 팔레트 값은 `apps/web/app/globals.css`의 기존 토큰과 동일하게 맞춘다(웹앱과의 시각적
 * 통일성). dark 팔레트는 이 리포에 선례가 없어(웹앱 자체가 다크모드를 구현하지 않음) 이번에
 * 새로 정했다 — 각 텍스트/배경 쌍은 WCAG 2.1 상대휘도 공식으로 대비를 계산해 AA(텍스트 4.5:1,
 * UI 컴포넌트 3:1)를 만족하는 값만 채택했다(`docs/UX.md` Accessibility "Color Contrast" —
 * 정확한 색상값은 ux-design 범위 밖, implementer가 검증). 계산 결과: text/bg ≈14.7:1,
 * accent/bg(양방향) ≈6.4:1, accentText/accent ≈6.4:1, border/bg ≈3.65:1 — 전부 기준 통과.
 */

export interface Layer1Theme {
  bg: string;
  surface: string;
  text: string;
  border: string;
  accent: string;
  accentHover: string;
  accentText: string;
  danger: string;
  shadow: string;
}

const LIGHT: Layer1Theme = {
  bg: '#f8f4f4', // apps/web globals.css --color-surface
  surface: '#eae9e9', // --color-surface-alt
  text: '#201e1d', // --color-text
  border: '#201e1d', // --border-strong
  accent: '#ae1800', // --color-accent
  accentHover: '#8a1400', // --color-accent-hover
  accentText: '#f8f4f4',
  danger: '#7c1405', // --color-danger-text
  shadow: 'rgba(45, 43, 43, 0.35)',
};

const DARK: Layer1Theme = {
  bg: '#211f1e',
  surface: '#2c2a29',
  text: '#f3f2f2',
  border: '#7a7673',
  accent: '#ff7a5c',
  accentHover: '#ff967c',
  accentText: '#211f1e',
  danger: '#ff9d85',
  shadow: 'rgba(0, 0, 0, 0.55)',
};

function prefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

/** 호출 시점의 OS/브라우저 다크모드 여부를 읽어 그에 맞는 팔레트를 반환한다. */
export function getLayer1Theme(): Layer1Theme {
  return prefersDark() ? DARK : LIGHT;
}

/** 다크모드 여부에 맞는 CSS `color-scheme` 값 — 브라우저의 강제 다크모드 재처리를 막는다
 * (우리가 이미 명시적으로 테마를 적용했음을 렌더링 엔진에 알린다). */
export function getLayer1ColorScheme(): 'light' | 'dark' {
  return prefersDark() ? 'dark' : 'light';
}

/**
 * 다크모드 전환을 실시간으로 반영하고 싶을 때 구독한다. 반환값은 구독 해제 함수.
 * `matchMedia`가 없는 환경(구형 jsdom 등)에서는 조용히 아무 것도 하지 않는 no-op을 반환한다.
 */
export function subscribeLayer1ThemeChange(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const listener = () => onChange();
  mql.addEventListener('change', listener);
  return () => mql.removeEventListener('change', listener);
}
