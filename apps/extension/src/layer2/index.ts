/**
 * 층 2 레지스트리 — `docs/Architecture.md` F4. `Layer2Adapter` 타입은 T57이 `layer1/registry.ts`에
 * 확정했다. T29가 GitHub, T47이 Slack, T49가 Gmail 어댑터를 등록했다(`github.ts`/`slack.ts`/`gmail.ts`) —
 * 등록 대상 층 2 모듈은 이로써 전부 채워졌다. **빈 배열 상태에서도 층 1 전체 경로가 동작해야
 * 한다(AC-053③)** — `layer1/registry.test.ts`가 이를 별도로 고정한다.
 */
import type { Layer2Adapter } from '../layer1/registry';
import { github } from './github';
import { slack } from './slack';
import { gmail } from './gmail';

export const adapters: Layer2Adapter[] = [github, slack, gmail];
