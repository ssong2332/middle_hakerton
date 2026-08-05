/**
 * 층 2 레지스트리 — ← 컷 지점(`docs/Architecture.md`). 최종 형태는
 * `export const adapters: Layer2Adapter[] = [github, slack, gmail]`이며, `Layer2Adapter` 타입은
 * T57이 `layer1/registry.ts`에 확정한다(F4).
 *
 * 🔴 T2 스캐폴드 스텁 — F4가 동결되지 않은 시점이라 빈 배열조차 타입을 지어낼 수 없다.
 * T57 이후 T29·T47·T49가 각 어댑터를 이 배열에 등록한다. 빈 배열 상태에서도 층 1 전체 경로가
 * 동작해야 한다(AC-053③).
 */
export {};
