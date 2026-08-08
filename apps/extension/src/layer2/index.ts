/**
 * 층 2 레지스트리 — `docs/Architecture.md` F4. `Layer2Adapter` 타입은 T57이 `layer1/registry.ts`에
 * 확정했다. 아직 어댑터 구현이 없으므로(T29·slack·gmail 스텁 각각 `github.ts`/`slack.ts`/`gmail.ts`)
 * 빈 배열이다 — **빈 배열 상태에서도 층 1 전체 경로가 동작해야 한다(AC-053③)**. T29·T47·T49가
 * 각자의 어댑터를 이 배열에 추가한다(`[github, slack, gmail]`).
 */
import type { Layer2Adapter } from '../layer1/registry';

export const adapters: Layer2Adapter[] = [];
