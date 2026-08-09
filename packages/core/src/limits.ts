// AC-061 — 입력 길이 소프트 캡. ①의 "표시 시작 지점은 구현 판단, 단 5,000자 도달 전"과
// ②의 "5,000자를 넘어도 입력·변환을 막지 않는다"를 위한 상수 2개. `docs/UX.md` Interaction
// Patterns "Soft length cap counter"(v6.2) — 두 값 모두 여기 1곳에만 존재한다(AC-077/082와
// 같은 리터럴 중복 금지 원칙).
export const SOFT_LENGTH_CAP = 5000;
export const LENGTH_COUNTER_SHOW_AT = 4500;
