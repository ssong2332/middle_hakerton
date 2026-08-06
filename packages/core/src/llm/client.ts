/**
 * LLM 실행 수단의 **인터페이스** — core는 이것만 알고 구현을 모른다.
 *
 * 위치 근거: `docs/Architecture.md:131` 폴더 구조 — *"`llm/client.ts` # interface LLMClient —
 * 구현은 주입받는다"*. 구현체는 `apps/web/lib/llm/openai.ts` 이며(같은 문서 :104),
 * core는 `openai` 를 import할 수 없다(Conventions 1 · ESLint `no-restricted-imports` 로 빌드 실패).
 *
 * ⚠️ **이 파일의 형태는 architect가 지정하지 않았다 — implementer(T1)가 정한 최소 형태다.**
 * architect가 준 것은 이름(`LLMClient`)과 호출 형태 1줄뿐이다(`docs/Architecture.md:552`:
 * *"core/steps/* → LLMClient.complete(step, promptVersion, payload)"*).
 * `MediationDeps.llm` 이 타입 체크되려면 이 인터페이스가 존재해야 해서 여기서 정의하되,
 * **추측으로 필드를 늘리지 않았다.** 실제 호출 요구가 드러나는 T4(프록시)·T10(C2)에서
 * 형태가 바뀔 수 있으며, 바뀌면 그 시점에 architect 확인이 필요하다.
 */

import type { ResponseSource } from '../contract';

/**
 * LLM을 호출하는 파이프라인 단계.
 *
 * 값 어휘는 `docs/Database.md:261` **`llm_cache.step`** 의 CHECK 제약
 * (`c1`,`c2`,`c4`,`c6`,`c7`,`suggest`)과 **1:1로 일치**한다 — 이 값이 캐시 키의 구성 요소이기
 * 때문이다(`llm_cache.cache_key` = `sha256(model ∥ prompt_version ∥ step ∥ canonicalJSON(입력))`).
 *
 * ⚠️ `llm_call_log.step`(`docs/Database.md:279`)은 **CHECK 제약이 없는 자유 text** 다 — 같은 6값을
 * 쓰지만 DB가 강제하지는 않는다. 이 타입의 근거는 CHECK가 있는 `llm_cache` 쪽이다.
 * (두 테이블을 혼동한 초기 주석을 2026-08-04 정정했다.)
 */
export type LLMStep = 'c1' | 'c2' | 'c4' | 'c6' | 'c7' | 'suggest';

/**
 * LLM 호출 1건의 결과.
 *
 * 🔴 **`source` 판정은 구현체가 소유한다** — 캐시 적중/실호출/폴백의 3단 해석은
 * `docs/Architecture.md` Data Flow 2)가 `LLMClient` 구현체 안쪽으로 규정했다.
 * core는 판정하지 않고 받은 값을 `MediationResult.source` 로 전달한다(AC-041).
 */
export interface LLMResponse {
  /**
   * 모델이 돌려준 원문 텍스트. 🔴 **여기서는 검증하지 않는다** — 외부 API 응답 검증의 소유자는
   * `apps/web/lib/llm/openai.ts`(zod 파싱, 실패 시 `LLM_MALFORMED` → 폴백)이며,
   * 구조 해석은 각 step이 담당한다(`docs/Architecture.md` Security "Input validation boundaries" ②).
   */
  content: string;
  /** 이 응답이 실호출·캐시·폴백 중 무엇인지 (AC-041). */
  source: ResponseSource;
}

/**
 * core가 주입받는 LLM 호출 수단. 🔴 **구현은 core 밖에 있다**(AC-028).
 *
 * ## 🔴 실패 계약 (T4 구현자와 T10 호출자가 같은 가정을 쓰게 하기 위한 고정)
 *
 * | 상황 | `complete()` 의 동작 | 근거 |
 * |---|---|---|
 * | 캐시 적중 | `{ source: 'cache' }` **반환**. LLM 호출 0건 | AC-041 |
 * | 실호출 성공 | `{ source: 'live' }` **반환** | AC-041 |
 * | 호출 실패·상한 초과·크레딧 소진이지만 **폴백 응답이 있다** | 🔴 **던지지 않고** `{ source: 'fallback' }` 을 **반환**한다 | `docs/API.md` *"LLM 계열은 오류 응답보다 폴백 200이 우선이다"* — `packages/core/src/data/fallback-responses.ts` 에서 찾으면 `200` + `source:"fallback"` |
 * | **폴백조차 없고, 원인이 실제 호출 실패다**(네트워크·5xx·응답이 `LLM_MALFORMED`로 검증 실패) | 🔴 `LLMUnavailableError` 를 **던진다**(`retryable: true` — 재시도하면 성공할 수도 있다) | `docs/API.md` Errors 행 *"503 `LLM_UNAVAILABLE`(폴백도 없을 때)"*, `retryable` 값은 `docs/API.md:42` |
 * | **폴백조차 없고, 원인이 요청 상한 초과다**(OpenAI를 아예 호출하지 않았다) | 🔴 `QuotaExceededError` 를 **던진다**(`retryable: false` — 오늘 안에 재시도해도 동일하게 실패한다) | `docs/API.md` `QUOTA_EXCEEDED` 행, `retryable` 값은 `docs/API.md:44`, `packages/core/src/errors.ts` `QuotaExceededError` JSDoc |
 *
 * ⚠️ **2026-08-04 정정**: 위 두 행은 원래 하나(`LLMUnavailableError`만)였고, 그 상태에서
 * `errors.ts`의 `QuotaExceededError` JSDoc이 "폴백조차 없을 때의 잔여 경로"라고 같은 상황을
 * 자기 것으로 주장해 두 T1 파일이 모순됐다(reviewer REJECTED). 위와 같이 원인별로 분리해
 * 모순을 없앴다 — 구현은 `apps/web/lib/llm/openai.ts`.
 *
 * 🔴 **core는 이 예외를 잡지 않는다.** `packages/core` 와 `apps/web/lib` 는 **던지기만** 하고
 * 잡는 곳은 `apps/web/lib/http.ts` 의 `withApi()` **한 곳뿐**이다
 * (`docs/Architecture.md` Error Handling "Where exceptions are caught" · Conventions 2 ·
 * `docs/CodingRules.md` Error Handling "던지는 쪽 / 잡는 쪽"). 파이프라인 스텝 안에 `try/catch`
 * 를 만들면 같은 실패가 여러 응답으로 갈리고, 빈 `catch` 는 Critical 위반이다.
 *
 * ⚠️ **`LLMUnavailableError` 자체를 여기서 정의하지 않는다** — `CoreError` 계열의 정의 위치는
 * `packages/core/src/errors.ts` 로 이미 지정돼 있다(`docs/Architecture.md:127` 폴더 구조,
 * *"errors.ts # CoreError 계열 + ErrorCode enum"*). 그 파일은 아직 없으며 **T1의 범위가 아니다.**
 *
 * ⚠️ **부분 실패는 예외가 아니다.** 공휴일 조회·이모지 판정·C6 게이트 산출이 실패해도 중재
 * 전체를 실패시키지 않는다 — 해당 필드가 빈 배열/`ticketOption.basis:'undetermined'` 로 나가고
 * 나머지는 정상 반환된다(`docs/Architecture.md` Error Handling "Cross-boundary propagation" ④).
 */
export interface LLMClient {
  /**
   * 실패 계약은 위 인터페이스 주석의 표를 따른다 — 폴백 있으면 **반환**, 없으면 **던진다**.
   *
   * @param step 호출 단계. 캐시 키(`llm_cache.step`)와 호출 기록(`llm_call_log.step`)에 그대로 쓰인다.
   * @param promptVersion `packages/core/src/prompts/` 의 `PROMPT_VERSION`.
   *   🔴 캐시 키에 들어가므로 프롬프트를 고치고 올리지 않으면 옛 응답이 반환된다(Conventions 10).
   * @param payload 프롬프트 입력. 🔴 `any` 금지 규칙에 따라 `unknown` 이다
   *   (`docs/CodingRules.md` Style — *"불가피하면 `unknown` + 타입 가드"*).
   *   구현체가 canonical JSON으로 직렬화해 캐시 키를 만든다(Data Flow 2).
   */
  complete(step: LLMStep, promptVersion: string, payload: unknown): Promise<LLMResponse>;
}
