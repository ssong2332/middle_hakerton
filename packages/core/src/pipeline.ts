/**
 * 코어 파이프라인의 **시그니처 동결** — 🔒 Freeze Point 1 (F1-b)
 *
 * `docs/Architecture.md` F1-b · `docs/DECISIONS.md` #36 · `docs/adr/0004-core-pipeline-input-vs-deps.md`
 * 가 확정한 형태다. ADR-0004 Follow-up 1이 이 반영을 **T1의 일**로 지정했다
 * (*"T1: 위 타입을 `contract.ts`/`pipeline.ts` 에 반영해 F1을 동결한다"*).
 *
 * 🔴 **이 파일에 구현이 없는 것은 의도다.** 파이프라인 본문(C1→C3→C5→C2→C4→(C6) 순서 고정,
 * AC-032)은 **T28의 범위**다. T1은 **경계만** 동결한다 — R2(*"경계는 먼저 고정하고 내용은
 * 나중에 채운다"*, `docs/Architecture.md` 설계 제1원칙).
 *
 * ## `run` 을 함수 선언이 아니라 함수 **타입**으로 동결한 이유 (implementer 판단)
 *
 * ADR-0004와 F1-b는 시그니처를 `export function run(input, deps): Promise<MediationResult>;`
 * 로 적었다. 그것을 그대로 `.ts` 에 쓰면 **본문 없는 함수 선언이라 컴파일되지 않는다**
 * (measured: `error TS2391: Function implementation is missing or not immediately following
 * the declaration`). 대안 검토:
 *
 * - `export declare function run(...)` — 컴파일은 되지만 **실체 없는 export**가 생긴다.
 *   `import { run }` 이 타입 체크를 통과하고 **런타임에만 터진다.** "없는 것을 있는 것처럼
 *   보이게 하지 않는다"(Conventions 9)에 정면으로 걸려 기각했다.
 * - `pipeline.d.ts` 별도 파일 — T28이 만들 `pipeline.ts` 와 선언이 이중화된다. 폴더 구조
 *   (`docs/Architecture.md:127`)에도 `.d.ts` 가 없어 기각했다.
 * - **채택: 함수 타입 별칭 `MediationPipeline`.** 런타임 코드 0줄·실체 없는 export 0개이면서
 *   시그니처가 **기계적으로 검증 가능**하다.
 *
 * ## 🔴 T28은 아래 **한 가지 형태로만** 구현한다
 *
 * ```ts
 * export const run: MediationPipeline = async (input, deps) => { ... };
 * ```
 *
 * 🔴 **평범한 `export async function run(...)` 은 쓰지 않는다.** 그 형태는 이 별칭을 참조하지
 * 않으므로 **시그니처가 어긋나도 빌드가 통과한다** — 인자 3개짜리
 * `export async function run(input, deps, extra)` 가 **EXIT=0 으로 통과**함을 재현해 확인했다
 * (2026-08-04 measured, implementer). F1이 존재하는 이유가 시그니처 표류 방지인데
 * 그 형태를 권하면 이 파일이 표류 경로를 여는 셈이다.
 * 반면 위 `const` + 타입 주석 형태는 같은 3-인자 시도가
 * `error TS2322 ... Target signature provides too few arguments`(EXIT=2)로 **즉시 깨진다**(measured).
 * 덤으로 `input`·`deps` 의 타입이 별칭에서 **문맥 추론**되므로 인자에 타입을 다시 적지 않아도 된다.
 *
 * ⚠️ 대안으로 `export async function run(...)` + `const _assert: MediationPipeline = run;`
 * 도 같은 오류를 잡는 것을 확인했다(measured, EXIT=2). **그럼에도 채택하지 않은 이유**: 그 단언은
 * 지워도 빌드가 통과하는 **삭제 가능한 한 줄**이라, F1의 보장이 "아무도 그 줄을 지우지 않는다"는
 * 가정 위에 서게 된다. 형태 자체가 곧 계약인 쪽을 택했다.
 */

import type { MediationInput, MediationResult } from './contract';
import type { LLMClient } from './llm/client';

/**
 * `run()` 의 두 번째 인자 — **실행 수단과 조회 결과**.
 *
 * 🔴 **`MediationInput` 은 4필드에서 늘어나지 않는다.** 앞으로 발견되는 DB 조회물은 전부
 * 여기로 온다(`docs/Architecture.md` F1-b · ADR-0004 판정표). 이 규칙이 없으면 T10·T28에서
 * 사람마다 다른 자리에 넣는다.
 */
export interface MediationDeps {
  /**
   * 실행 수단. core는 인터페이스만 알고 구현(`apps/web/lib/llm/openai.ts`)을 모른다(AC-028).
   * 🔴 Conventions 11의 *"`Promise` 를 반환하는 저장소성 인자 금지"* 규칙의 **유일한 예외**가 이것이다.
   */
  llm: LLMClient;
  /**
   * 🔴 **호출 전에 이미 조회를 마친** DB 산출물. core는 여기서 **읽기만 하고 조회하지 않는다.**
   * 조회는 Route Handler가 `run()` 호출 *전에* 끝낸다(`docs/API.md` `POST /api/mediate` "읽는 테이블" 행).
   */
  data: MediationData;
}

/**
 * 변환이 참조하는 **목록형 조회물**. 당사자 1인의 속성 객체(발신자 프로필·쌍 규약·수신자
 * 국가/타임존)는 여기가 아니라 `MediationInput` 의 기존 자리를 쓴다 — 판정표는 F1-b에 있다.
 *
 * 🔴 **조회 *함수*가 아니라 조회 *결과*를 받는 이유 3가지**(ADR-0004):
 * 1. Layers 절이 core를 *"I/O는 전부 인자와 반환값으로만"* 으로 규정했다. 함수를 주입하면
 *    **저장소 실패가 core 안에서** 발생해 "예외는 `withApi()` 한 곳에서 잡는다"가 흐려진다.
 * 2. 부분 실패 정책(Error Handling ④)이 Route Handler 한 곳에 남는다.
 * 3. T11(회귀 검증셋 26건)이 **저장소 목 없이 픽스처만으로** "하나의 실행 출력"을 낸다.
 */
export interface MediationData {
  /**
   * C5 용어사전 — `dictionary_terms` 전 행(사용자 스코프, DECISIONS #22).
   * 🔴 비어 있으면 **`[]` 가 정상 상태**다. 기본 엔트리를 만들어 채우지 않는다.
   */
  dictionary: DictionaryEntry[];
  /**
   * C3 학습 항목 — `profile_learned_items` 전 행.
   * 🔴 비어 있으면 **`[]` 가 정상 상태**다(AC-059 — 온보딩 스킵 계정도 정상 동작해야 한다).
   */
  learnedItems: LearnedItem[];
}

/**
 * `docs/Database.md` `dictionary_terms` 중 **변환이 읽는 컬럼만**.
 * `id`·`note` 는 화면용이라 넣지 않는다 — core가 읽지 않는 값을 계약에 넣으면
 * "core는 화면을 모른다"는 경계가 흐려진다.
 */
export interface DictionaryEntry {
  /** `term`(용어) / `person`(사람 호칭) — UX-010의 두 엔트리 타입(AC-047). */
  entryType: 'term' | 'person';
  /** `term`: 원문 용어 / `person`: 실명. */
  sourceText: string;
  /** `term`: 유지할 표기. 🔴 `null` 이면 **원문 유지**이며 의역하지 않는다(AC-015). */
  targetText: string | null;
  /** `person` 전용 — 한국어 호칭. 미등록이면 `null`. */
  koHonorific: string | null;
  /**
   * `person` 전용 — 영어 호칭.
   * 🔴 **`null` 이면 추측 생성 금지**(AC-047 ②③) — 직급을 직역해 위계를 덧붙이지 않는다
   * ("Manager Kim" 자동 생성 금지). 원문 형태를 유지하고 `warnings[]` 에 "호칭 미등록"을 넣는다.
   */
  enHonorific: string | null;
}

/**
 * `docs/Database.md` `profile_learned_items` 중 변환이 읽는 컬럼만.
 *
 * 🔴 `observed_count` 를 넣지 않는다 — 스키마 CHECK가 `≥ 3` 이라 **행의 존재 자체가 3회 도달을
 * 뜻한다**(AC-013). 필드를 두면 core가 3회 판정을 다시 하게 되고 판정처가 둘이 된다.
 */
export interface LearnedItem {
  /** 수정 패턴 식별자. `diff_records.pattern_key` 와 **같은 어휘**를 쓴다. */
  patternKey: string;
  /** 프로필에 반영된 값. */
  value: string;
}

/**
 * 🔒 **동결된 파이프라인 시그니처** — `run(input, deps)` (DECISIONS #36).
 * 구현은 T28이 이 타입에 맞춰 이 파일에 추가한다(파일 상단 주석 참조).
 */
export type MediationPipeline = (
  input: MediationInput,
  deps: MediationDeps,
) => Promise<MediationResult>;
