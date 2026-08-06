/**
 * T11 — C2 회귀 검증셋 53건의 **실제 LLMClient 라이브 실행 진입점**. reviewer 후속 Major 4
 * (`docs/Tasks.md` T11): "러너에 실행 진입점이 없다"의 구현이다.
 *
 * 🔴 이 파일은 `tests/regression-c2.ts`의 `C2Invoker`에 실제 `createOpenAiLLMClient`(T4,
 * `apps/web/lib/llm/openai.ts`)를 물려 진짜 OpenAI 호출로 53건을 돌린다 — 모킹된 러너 정확성
 * 검증(`regression-c2.test.ts`)과는 목적이 다르다(그 파일 헤더 주석 참조).
 *
 * 🔴 **필요한 환경 변수가 없으면 skip된다.** `docs/Architecture.md` Tech Stack "테스트" 행 ·
 * `docs/DECISIONS.md` #13(웹앱·확장·코어가 한 러너를 쓴다)에 따라 별도 실행 메커니즘(별도 node
 * 스크립트 등)을 만들지 않고 같은 vitest 러너 위에 얹되, 필요한 환경 변수(`.env`)가 전부 없으면
 * `describe.skipIf`로 건너뛴다 — 일반 `npm test`가 매번 실제 비용이 드는 외부 호출을 시도하지
 * 않게 한다.
 *
 * 🔴 reviewer 후속 Major B(`docs/Tasks.md` T11) — 이전에는 이 헤더가 안내하는 절차("`.env`에
 * 채운 뒤 `npm run test:regression-c2`")를 그대로 따라도 **항상 조용히 skip됐다**: Vitest 4는
 * `.env`를 자동으로 `process.env`에 로드하지 않는다(measured — `node_modules/vitest/dist`에
 * `loadEnv` 0건, `package-lock.json`에 `dotenv` 없음). `vitest.config.ts`가 이제 Vite 내장
 * `loadEnv`로 `.env`를 명시적으로 `process.env`에 채운다(그 파일 해당 주석 참조, 새 의존성
 * 추가 없음) — 이 헤더의 절차가 실제로 동작한다. 그래도 필요한 변수가 하나라도 없으면 **어떤
 * 변수가 빠졌는지가 테스트 제목에 그대로 나타난다**(아래 `it(...)` 제목 참조, `regression-c2.live-env.ts`
 * `getMissingLiveEnvKeys`/`describeLiveEnvSkipReason`) — skip 사유가 vitest 실행 요약에서 보인다.
 *
 * 실행: `.env`에 아래 환경 변수를 채운 뒤 `npm run test:regression-c2`(또는 셸에서 직접
 * `OPENAI_API_KEY=... npm run test:regression-c2`처럼 export해도 동일하게 동작한다 — 이미 설정된
 * `process.env` 값은 `.env` 값으로 덮어쓰지 않는다).
 */
import { describe, expect, it } from 'vitest';
import {
  runToneTransform,
  type LanguageDirection,
  type MisreadRisk,
  type PreservedItem,
} from '@cross-border/core';
import { createOpenAiLLMClient } from '../apps/web/lib/llm/openai';
import { formatReport, runC2Regression, type C2Invoker } from './regression-c2';
import {
  describeLiveEnvSkipReason,
  getMissingLiveEnvKeys,
} from './regression-c2.live-env';

const missingLiveEnvKeys = getMissingLiveEnvKeys(process.env);
const hasLiveEnv = missingLiveEnvKeys.length === 0;

function buildLiveInvoker(): C2Invoker {
  const llm = createOpenAiLLMClient();
  return {
    async transform(input: {
      text: string;
      languageDirection: LanguageDirection;
      honorificLevel: 'hapsyo' | 'haeyo' | null;
    }): Promise<{ transformed: string; preserved: PreservedItem[]; misreadRisks: MisreadRisk[] }> {
      // 🔴 QA 정적 분석 후속(2026-08-05) — 서버(라이브 실행 환경) 현재 시각 기준. route.ts와
      // 동일한 계산(`packages/core/src/prompts/c2.ts` C2Payload.referenceYear 주석 참조).
      const referenceDate = new Date().toISOString().slice(0, 10);
      const result = await runToneTransform({ ...input, referenceDate }, llm);
      return {
        transformed: result.transformed,
        preserved: result.preserved,
        misreadRisks: result.misreadRisks,
      };
    },
  };
}

// 🔴 reviewer 후속 Major B — 스킵될 때도 어떤 환경 변수가 빠졌는지 제목에 그대로 남긴다(빈
// 문자열이면 라이브 실행 조건을 충족한 것이라 제목이 그대로 유지된다).
const testTitle =
  `53건을 실제 OpenAI 호출로 실행하고 하나의 실행 출력으로 보고한다` +
  (hasLiveEnv ? '' : ` — ${describeLiveEnvSkipReason(missingLiveEnvKeys)}`);

describe.skipIf(!hasLiveEnv)('C2 회귀 검증셋 53건 — 실제 LLMClient 라이브 실행(T11)', () => {
  it(testTitle, async () => {
    const invoker = buildLiveInvoker();
    const report = await runC2Regression(invoker);
    // docs/TestCases.md "실행 기록" 표에 붙여넣을 출력.
    console.log(formatReport(report));
    expect(report.totalCases).toBe(53);
  }, 120_000); // 53건 × 실호출 — 넉넉한 타임아웃
});
