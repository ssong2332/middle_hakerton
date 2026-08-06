/**
 * T11 — C2 회귀 검증셋 53건의 **실제 LLMClient 라이브 실행 진입점**. reviewer 후속 Major 4
 * (`docs/Tasks.md` T11): "러너에 실행 진입점이 없다"의 구현이다.
 *
 * 🔴 이 파일은 `tests/regression-c2.ts`의 `C2Invoker`에 실제 `LLMClient`를 물려 53건을 돌린다 —
 * 모킹된 러너 정확성 검증(`regression-c2.test.ts`)과는 목적이 다르다(그 파일 헤더 주석 참조).
 *
 * 🔴 T11 후속 fix(2026-08-07) — 이전에는 `createOpenAiLLMClient`(`apps/web/lib/llm/openai.ts`)를
 * 직접 호출해 항상 OpenAI로만 실행됐다. 이제 provider-switching 팩토리
 * `createLLMClient()`(`apps/web/lib/llm/create-client.ts`)를 통해 `LLMClient`를 얻는다 —
 * `LLM_PROVIDER=gemini`일 때는 Gemini(`apps/web/lib/llm/gemini.ts`)로, 그 외/미설정(기본값)일
 * 때는 여전히 OpenAI로 실행된다. OpenAI가 프로덕션 기본 경로라는 사실은 바뀌지 않는다 — 이 변경은
 * 로컬 테스트 편의일 뿐 아키텍처 결정이 아니다(`create-client.ts` 파일 헤더 주석과 같은 성격).
 * `createLLMClient()`는 async다(Gemini 분기에서만 `gemini.ts`를 동적 import — 프로덕션 번들 크기
 * 최적화 근거는 `create-client.ts` M-1 주석 참조) — 그래서 `buildLiveInvoker()`도 async로 바뀌었다.
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
 *
 * 🔴 T49 후속(2026-08-07) — 이 파일 하단 `TEST_TIMEOUT_MS` 주석 참조. 같은 날의 재시도 백오프
 * 도입(`gemini.ts` `RETRY_OPTIONS`)의 직접적 결과로, 이전 고정값(120_000ms)이 사용자의 실제
 * `LLM_PROVIDER=gemini` 라이브 실행에서 측정된 타임아웃(`Error: Test timed out in 120000ms`,
 * 120013ms 시점)을 냈다 — 근거 없이 값만 올리지 않고 아래에서 산수를 보인다.
 */
import { describe, expect, it } from 'vitest';
import {
  runToneTransform,
  type LanguageDirection,
  type MisreadRisk,
  type PreservedItem,
} from '@cross-border/core';
import { createLLMClient } from '../apps/web/lib/llm/create-client';
import { REQUEST_TIMEOUT_MS } from '../apps/web/lib/llm/gemini';
import { formatReport, runC2Regression, type C2Invoker } from './regression-c2';
import {
  describeLiveEnvSkipReason,
  getMissingLiveEnvKeys,
} from './regression-c2.live-env';

const missingLiveEnvKeys = getMissingLiveEnvKeys(process.env);
const hasLiveEnv = missingLiveEnvKeys.length === 0;

async function buildLiveInvoker(): Promise<C2Invoker> {
  const llm = await createLLMClient();
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
// 🔴 T11 후속 fix(2026-08-07) — provider가 고정 OpenAI가 아니게 되어, 실제로 어떤 provider로
// 실행되는지도 제목에 반영한다(`create-client.ts`와 동일한 판정 기준).
const providerLabel = process.env.LLM_PROVIDER === 'gemini' ? 'Gemini' : 'OpenAI';
const testTitle =
  `53건을 실제 ${providerLabel} 호출로 실행하고 하나의 실행 출력으로 보고한다` +
  (hasLiveEnv ? '' : ` — ${describeLiveEnvSkipReason(missingLiveEnvKeys)}`);

/**
 * 🔴 T49 후속(2026-08-07) — 이전 고정값 120_000ms는 오늘 아침의 재시도 백오프 도입(오늘 앞선
 * fix, `apps/web/lib/llm/gemini.ts` `RETRY_OPTIONS`) 전에는 "넉넉"했다(재시도 0회 + 즉시
 * 폴백뿐이던 실행이 ~114초). 그 fix 이후 사용자가 `LLM_PROVIDER=gemini`로 실제 라이브 회귀를
 * 돌리자 `Error: Test timed out in 120000ms`(120013ms 시점)가 났다 — 재시도가 붙은 개별 호출이
 * 이제 최악의 경우 훨씬 오래 걸릴 수 있기 때문이다. 아래는 그 근거를 산수로 보인 것이다(매직넘버
 * 금지).
 *
 * **1) 호출 1건의 최악 지연시간**
 * `gemini.ts` `RETRY_OPTIONS`(`attempts:4, initialDelay:3, maxDelay:20, expBase:2` — SDK
 * 기본 `jitter`는 각 지연을 1x~2x로 무작위화한다, 오늘 앞선 fix의 reviewer/QA 독립 검증 산수):
 *   - 1차 시도 실패(균일 관측 지연 ~420-470ms, `gemini.ts` RETRY_OPTIONS 주석) → 대기 최대
 *     3s×2(jitter)=6s
 *   - 2차 시도 실패 → 대기 최대 6s×2=12s
 *   - 3차 시도 실패 → 대기 최대 12s×2=24s → `maxDelay:20`에 의해 20s로 캡됨
 *   - 백오프 합계 최대 ≈ 6+12+20 = 38s. 1차 시도 자체의 지연(~0.5s)을 더하면 ≈38.5s → 여유를
 *     두어 반올림한 **39,000ms**를 "재시도 소진 호출 1건의 최악값"으로 쓴다
 *     (`WORST_CASE_RETRY_EXHAUSTED_CALL_MS`).
 *   - 재시도 없이 끝나는 정상 호출은 `REQUEST_TIMEOUT_MS`(10,000ms, `gemini.ts` 서버측 하한
 *     근거 주석 참조)를 상한으로 쓴다(`NORMAL_CALL_CEILING_MS`) — 같은 상수를 재사용해 새 매직
 *     넘버를 만들지 않는다.
 *
 * **2) 53건이 실제로 만드는 호출 수는 53이 아니라 73건(측정값)**
 * `runC2Regression`(`tests/regression-c2.ts`)은 `for...of` + `await`로 케이스를 **순차** 실행한다
 * (병렬 아님 — `runC2Regression` 본문 확인) — 그래서 총 지연은 "호출 1건 지연의 합"이 된다.
 * 그런데 케이스 1건이 곧 호출 1건은 아니다: `judgeHonorificCase`(AC-046, `regression-c2.ts`)는
 * 케이스 1건마다 `invoker.transform()`을 hapsyo/haeyo/null 세 번 호출한다. 실제 라이브 실행에서
 * 측정된 총 호출 수는 **73건**이다(`apps/web/lib/llm/gemini.test.ts` "73번의 `llm.complete`"
 * 주석, `gemini.ts` RETRY_OPTIONS 주석과 동일 출처) — 53이 아니라 이 73을 곱해야 한다
 * (`ACTUAL_INVOKER_CALLS_PER_FULL_RUN`).
 *
 * **3) 절대 최악 vs 현실적 최악**
 * 73건 전부가 재시도를 소진하는 절대 최악은 73×39,000ms ≈ 2,847,000ms(≈47.5분)다 — 매 케이스가
 * 매번 상한에 걸리는 시나리오로, 앞선 fix에서 실측된 패턴(초반 ~8건은 라이브 성공, 이후
 * 상한에 걸림)과도 맞지 않는 과도한 상한이다. 이 워크트리에는 라이브 Gemini 자격증명이 없어
 * (`docs/TestCases.md` "실행 기록" 미실행) 사용자의 다음 실행 전까지 실측 재현이 불가능하므로,
 * 절대 최악 대신 **현실적으로 더 나쁠 수 있는 시나리오**를 가정한다: 앞선 fix가 실측한 "초반
 * ~8건 라이브 성공, 이후 즉시 폴백"보다 두 배 넘게 나쁜 **73건 중 20건이 재시도를 소진**하고
 * 나머지 53건은 `NORMAL_CALL_CEILING_MS` 이내로 끝난다고 가정한다
 * (`REALISTIC_WORST_CASE_RETRIED_CALL_COUNT`) — 근거: 재시도가 이제 실제로 붙었으니 상한에
 * 걸리는 호출이 예전처럼 "즉시 폴백"이 아니라 "재시도 소진 후 폴백"으로 바뀔 수 있고, 앱 자체
 * 상한(`checkRequestLimit`)에 걸려 Gemini를 아예 호출하지 않는 case도 섞여 있어 73건 전부가
 * 똑같이 나쁘지는 않을 것이기 때문이다(추정 — 사용자의 다음 실행으로 확인 필요).
 *   `MIN_JUSTIFIED_TEST_TIMEOUT_MS` = 20×39,000 + (73−20)×10,000 = 780,000 + 530,000
 *   = **1,310,000ms(≈21.83분)**.
 *
 * **4) 최종 값**
 * 이 환경에서 실측 검증이 불가능하므로(라이브 Gemini 자격증명 없음) `MIN_JUSTIFIED_TEST_TIMEOUT_MS`
 * 위에 안전 여유를 둔다 — **1,800,000ms(30분, 위 최소값 대비 약 37% 여유)**. 절대 최악
 * (≈47.5분)까지는 가지 않되, 옛 값(120,000ms)이 처음 "넉넉"해 보였다가 재시도 도입만으로
 * 부족해진 전철을 밟지 않기 위해 최소 정당화값보다 상당한 여유를 남긴다.
 *
 * 아래 가드 테스트(`TEST_TIMEOUT_MS 가드`)가 이 값이 `MIN_JUSTIFIED_TEST_TIMEOUT_MS` 밑으로
 * 조용히 줄어드는 것을 막는다 — 가드 테스트는 아래 상수들로 직접 계산해 비교한다(리터럴
 * 중복 없음, `TEST_TIMEOUT_MS`만 따로 바꿔도 계산이 그대로 따라간다).
 */
/** 재시도를 모두 소진한 호출 1건의 최악 지연시간 — 산수는 위 "1)" 참조. */
export const WORST_CASE_RETRY_EXHAUSTED_CALL_MS = 39_000;
/** 재시도 없이 끝나는 정상 호출의 상한 — 새 매직넘버를 만들지 않고 `gemini.ts`의 서버측
 * 하한 상수를 그대로 재사용한다(위 "1)" 참조). */
export const NORMAL_CALL_CEILING_MS = REQUEST_TIMEOUT_MS;
/** 53건이 실제로 만드는 `invoker.transform()` 호출 총수(측정값) — 산수는 위 "2)" 참조. */
export const ACTUAL_INVOKER_CALLS_PER_FULL_RUN = 73;
/** 현실적 최악 시나리오에서 재시도를 소진한다고 가정하는 호출 수(추정, 다음 라이브 실행으로
 * 확인 필요) — 산수는 위 "3)" 참조. */
export const REALISTIC_WORST_CASE_RETRIED_CALL_COUNT = 20;
/** 위 상수들로 계산한, 정당화 가능한 최소 타임아웃 — 산수는 위 "3)" 참조. */
export const MIN_JUSTIFIED_TEST_TIMEOUT_MS =
  REALISTIC_WORST_CASE_RETRIED_CALL_COUNT * WORST_CASE_RETRY_EXHAUSTED_CALL_MS +
  (ACTUAL_INVOKER_CALLS_PER_FULL_RUN - REALISTIC_WORST_CASE_RETRIED_CALL_COUNT) *
    NORMAL_CALL_CEILING_MS;
/** 실제 `it(...)`에 쓰는 값 — `MIN_JUSTIFIED_TEST_TIMEOUT_MS` 위에 안전 여유(약 37%)를 둔다.
 * 산수는 위 "4)" 참조. 라이브 자격증명이 없는 이 환경에서는 실측 검증이 불가능하다. */
export const TEST_TIMEOUT_MS = 1_800_000;

describe.skipIf(!hasLiveEnv)('C2 회귀 검증셋 53건 — 실제 LLMClient 라이브 실행(T11)', () => {
  it(
    testTitle,
    async () => {
      const invoker = await buildLiveInvoker();
      const report = await runC2Regression(invoker);
      // docs/TestCases.md "실행 기록" 표에 붙여넣을 출력.
      console.log(formatReport(report));
      expect(report.totalCases).toBe(53);
    },
    TEST_TIMEOUT_MS, // 산수는 위 TEST_TIMEOUT_MS 주석 참조(T49 후속) — 120_000 고정값이 사용자의
    // 실제 라이브 실행에서 측정된 타임아웃(120013ms)을 낸 것에 대한 근거 있는 대체값.
  );
});

// 🔴 T49 후속 — REQUEST_TIMEOUT_MS 가드 테스트(`gemini.test.ts:334-342`)와 같은 패턴: 이 값이
// 산수로 정당화된 최소치 밑으로 조용히 줄어들면 이 테스트가 즉시 실패해 재발(오늘 실제로 겪은
// "재시도 도입 → 기존 타임아웃 부족" 회귀)을 막는다.
//
// `MIN_JUSTIFIED_TEST_TIMEOUT_MS`와 비교하는 대신 그 값을 만드는 **개별 상수들**
// (`WORST_CASE_RETRY_EXHAUSTED_CALL_MS`·`ACTUAL_INVOKER_CALLS_PER_FULL_RUN`·
// `REALISTIC_WORST_CASE_RETRIED_CALL_COUNT`)이 각각 최소한의 방어선을 지키는지 따로 확인한다 —
// `TEST_TIMEOUT_MS >= MIN_JUSTIFIED_TEST_TIMEOUT_MS`만 확인하면 두 상수를 동시에 줄여도
// 항상 통과하는(둘 다 같은 계산식에서 나오므로) 무의미한 가드가 된다. 대신 각 입력 상수가
// 옛 회귀(120_000ms 타임아웃)를 낸 조건보다 뒤로 물러나지 않는지를 개별적으로 고정한다.
describe('TEST_TIMEOUT_MS — 라이브 회귀 스위트 타임아웃 가드(T49)', () => {
  it('재시도 소진 호출 1건의 최악값(WORST_CASE_RETRY_EXHAUSTED_CALL_MS)이 38,000ms(3+6+12초 백오프의 지수 백오프+jitter 산수, 위 TEST_TIMEOUT_MS 주석 "1)" 참조) 미만이면 안 된다', () => {
    expect(WORST_CASE_RETRY_EXHAUSTED_CALL_MS).toBeGreaterThanOrEqual(38_000);
  });

  it('실제 호출 수(ACTUAL_INVOKER_CALLS_PER_FULL_RUN)가 측정값 73 미만으로 낮춰지면 안 된다(53건이 아니라 73건 호출임을 잊으면 안 된다 — 위 TEST_TIMEOUT_MS 주석 "2)" 참조)', () => {
    expect(ACTUAL_INVOKER_CALLS_PER_FULL_RUN).toBeGreaterThanOrEqual(73);
  });

  it('현실적 최악 재시도 소진 건수(REALISTIC_WORST_CASE_RETRIED_CALL_COUNT)가 20건 미만으로 낮춰지면 안 된다(위 TEST_TIMEOUT_MS 주석 "3)" 참조)', () => {
    expect(REALISTIC_WORST_CASE_RETRIED_CALL_COUNT).toBeGreaterThanOrEqual(20);
  });

  it('최종 타임아웃(TEST_TIMEOUT_MS)이 산수로 정당화된 최소치(MIN_JUSTIFIED_TEST_TIMEOUT_MS, 위 상수들로 계산) 밑으로 줄어들면 안 된다 — 옛 값(120_000ms)이 사용자의 실제 라이브 실행에서 낸 타임아웃(120013ms)의 재발을 막는다', () => {
    expect(TEST_TIMEOUT_MS).toBeGreaterThanOrEqual(MIN_JUSTIFIED_TEST_TIMEOUT_MS);
  });
});
