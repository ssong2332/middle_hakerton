/**
 * 층 1(선택 오버레이) 다크모드 대응 + 웹앱 디자인 토큰 통일 (신규 2026-08-12, T81; 팔레트 값
 * v8.0 브랜드 리디자인으로 교체, docs/UX.md Design Tokens 참조).
 *
 * `panel-mount.tsx`가 이미 밝혔듯 패널/버튼은 Shadow DOM(또는 버튼은 host 라이트 DOM 안이지만
 * host 페이지 CSS를 참조하지 않는 인라인 style)이라 host 페이지의 다크모드 여부를 상속받지
 * 않는다 — 대신 `window.matchMedia('(prefers-color-scheme: dark)')`로 사용자의 실제 OS/브라우저
 * 설정을 직접 읽는다. 이 신호는 host 페이지와 무관하다(host가 다크든 라이트든 우리 UI는 사용자의
 * 실제 선호를 따른다).
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
  text: string;
  border: string;
  accent: string;
  accentHover: string;
  accentText: string;
  danger: string;
  shadow: string;
}

const LIGHT: Layer1Theme = {
  bg: '#F9FAFB', // apps/web globals.css --color-bg
  surface: '#FFFFFF', // --color-surface
  text: '#191F28', // --color-text
  border: '#E5E8EB', // --border-thin-alt
  accent: '#FF6100', // --color-accent
  accentHover: '#E85700', // --color-accent-hover
  accentText: '#FFFFFF',
  danger: '#C40029', // --color-danger-text
  shadow: 'rgba(17, 24, 39, 0.24)', // --shadow-elevated
};

const DARK: Layer1Theme = {
  bg: '#211f1e',
  surface: '#2c2a29',
  text: '#f3f2f2',
  border: '#8a857f',
  accent: '#ff8a54',
  accentHover: '#ffa374',
  accentText: '#211f1e',
  danger: '#ffab8a',
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
