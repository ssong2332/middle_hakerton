/**
 * 층 2 레지스트리 — `docs/Architecture.md` F4. `Layer2Adapter` 타입은 T57이 `layer1/registry.ts`에
 * 확정했다. T29가 GitHub 어댑터를, T47이 Slack 어댑터를 등록했다(`github.ts`/`slack.ts`) —
 * gmail은 아직 스텁이라(`gmail.ts`) 배열에 없다. **빈 배열 상태에서도 층 1 전체 경로가 동작해야
 * 한다(AC-053③)**. T49가 자신의 어댑터를 이 배열에 추가한다.
 */
import type { Layer2Adapter } from '../layer1/registry';
import { github } from './github';
import { slack } from './slack';

export const adapters: Layer2Adapter[] = [github, slack];
