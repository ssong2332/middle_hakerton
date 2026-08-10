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

import type { MediationInput, MediationResult, Warning } from './contract';
import type { LLMClient } from './llm/client';
import { runUrgencyClassification } from './steps/c1';
import { runToneTransform } from './steps/c2';
import { runBackTranslation } from './steps/c4';
import { assessEmotionalSignal } from './steps/c6';
import { resolveDeliveryPath, resolveEffectiveUrgency } from './rules/urgency-routing';
import { combineSource } from './rules/response-source';
import { honorificMixedWarning, honorificNotRegisteredWarnings } from './rules/honorific';
import { ticketOptionFrom } from './rules/ticket-gate';
import type { Directness, EmojiPreference } from './prompts/c2';

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
  /**
   * 🔴 F1-d(2026-08-05 추가 — ADR-0008 · DECISIONS #46) — 호출 시점의 기준일(ISO `YYYY-MM-DD`,
   * UTC 기준). 당사자 서술도 조회물도 아니다 — **호출자만 알 수 있고 core가 만들어서는 안 되는
   * 값**이다(ADR-0008 D1). C2가 날짜 정규화에 쓰는 연도(`prompts/c2.ts` `C2Payload.referenceYear`)를
   * 여기서 뽑는다. 🔴 **`run()` 안에 `new Date()`/`Date.now()` 를 만들지 않는다** — core는 시스템
   * 시계를 직접 읽지 않는다(Conventions 11, ADR-0008 사실 7). 호출자(Route Handler)가
   * `new Date().toISOString().slice(0, 10)` 로 만들어 넘긴다.
   */
  referenceDate: string;
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

/**
 * 🔴 T28 — `docs/Tasks.md` T28 · AC-032. 명세 순서
 * `C1 → (CRITICAL 즉시) → C3 → C5 → C2 → C4 → (감정형이면 C6) → 승인 → 전송 + diff 저장`을
 * 그대로 코드 구조로 옮긴다. 아래 각 스텝 주석의 번호(①~⑦)가 그 순서와 1:1이다.
 *
 * 🔴 **"승인 → 전송 + diff 저장"은 이 함수의 범위가 아니다.** `docs/Architecture.md` Data Flow
 * ①은 그 두 단계를 `POST /api/mediate`(이 함수가 호출되는 라우트) 응답 **이후**, 사용자의
 * "Approve & Send" 클릭으로 별도 호출되는 `POST /api/messages`(T14/T20, `apps/web/app/api/
 * messages/route.ts`)로 그린다 — "이 클릭 없이 실행되는 저장/발송 경로가 코드에 존재하지 않는다"
 * (AC-010)는 그 라우트가 이미 지킨다. 두 엔드포인트를 하나로 합치는 것은 그 분리를 깨는 것이라
 * 하지 않는다.
 *
 * 🔴 **C3(프로필)·C5(사전)는 별도 LLM 호출이 아니다.** `docs/Architecture.md` Data Flow ①⑤ —
 * 조회는 Route Handler가 `run()` 호출 *전에* 끝내고(F1-b "조회는 여기서 끝난다"), 그 결과가
 * `input.sender.profile`(C3)·`deps.data.dictionary`(C5)로 이미 채워져 들어온다. 이 함수 안에서
 * 이 둘의 역할은 **C2 호출의 입력으로 흘려보내는 것**뿐이다 — 그래서 AC-032의 핵심 증거는
 * "LLM 호출이 C1 → C2 → C4 순서로 일어난다"는 사실이다(`pipeline.test.ts`가 그 순서를 고정한다).
 *
 * 🔴 **`deps.data.learnedItems`(profile_learned_items) 소비 — T79(Planning Decision #124).**
 * T35 리허설(Scene 5a "학습 전/후")에서 이 값이 파이프라인 어디에도 반영되지 않는다는 gap이
 * 드러났다 — `docs/Architecture.md:384`는 조회를 요구했지만 변환 로직 반영 지점이 어느
 * 태스크에도 배정돼 있지 않았다(T20은 쓰기만, T21은 열람 화면만). 이제 `resolveMergedStyle()`
 * (아래)가 `directness`/`emojiPreference` 두 축에서 **학습값이 자기신고를 덮어쓴다** —
 * `apps/web/app/(app)/(with-nav)/profile/page.tsx`의 `PATTERN_TO_FIELD` 표시 우선순위와
 * 같은 규칙(둘 다 `pattern-detection.ts`의 `DiffPatternKey` 어휘를 단일 출처로 삼는다).
 * `honorificLevel`은 학습 대상이 아니므로(`DiffPatternKey`에 대응 패턴 없음) 이 병합의 범위
 * 밖이며 지금처럼 자기신고 값만 그대로 흘려보낸다.
 */
const PATTERN_TO_STYLE_FIELD: Record<string, 'directness' | 'emojiPreference'> = {
  cushion_insert: 'directness',
  emoji_removed: 'emojiPreference',
};

/**
 * `directness`/`emojiPreference` 한 축을 자기신고+학습값으로 병합한다 — **학습이 자기신고를
 * 덮어쓴다**(우선순위 근거는 위 step ③ 주석). `learnedItems`에 해당 축의 패턴이 없으면 자기신고
 * 값을 그대로 쓰고, 그것도 `null`이면(미응답) `null`이다 — 추측 기본값을 채우지 않는다
 * (Conventions 9, `honorificLevel`과 같은 원칙).
 *
 * `LearnedItem.patternKey`는 DB CHECK 제약이 `DiffPatternKey` 두 값으로 좁히지만 타입 자체는
 * `string`이다(`LearnedItem` 인터페이스 주석) — 여기서 매핑에 없는 값은 그냥 무시한다(어느
 * 축에도 속하지 않는 패턴을 지어내 반영하지 않는다).
 */
/**
 * T41/T42(AC-037) — 쌍방 규약 축 → C2 스타일 축 어휘 변환. `docs/PRD.md:675`의 유일한 명시
 * 예시("프로필 '이모지 선호' + 규약 '이모지 미사용' → 결과에 이모지 없음")를 그대로 구현한다.
 * 프로필 어휘(3단계: `likes`/`neutral`/`avoids`)와 규약 어휘(2단계: `ok`/`avoid`)가 서로 달라
 * 매핑이 필요하다 — `'ok'`는 "명시적으로 좋아한다"가 아니라 "금지하지 않는다"는 뜻이라
 * `'likes'`가 아니라 `'neutral'`로 옮긴다(규약에 없는 정보를 지어내지 않는다, Conventions 9와
 * 같은 원칙).
 *
 * 🔴 **`addressForm`/`deadlineStyle`은 이 변환 대상이 아니다** — `honorificLevel`이 규약
 * 축에 자리가 없는 것(`steps/c2.ts` 헤더 주석)과 대칭인 반대 방향 갭이다: `prompts/c2.ts`의
 * `C2Payload`에 이 두 값을 실을 자리가 아직 없다(`directness`/`emojiPreference`/
 * `honorificLevel` 세 필드뿐). 두 축을 프롬프트에 실으려면 `C2Payload` 확장이 필요한데, 그건
 * 스키마 변경이라 architect 소관이다(T42의 권한 밖) — 지금은 `docs/API.md`/UX-011 화면에
 * 저장·표시만 되고 변환 결과에는 반영되지 않는다. AC-037이 요구하는 "4항목 전부 반영"의
 * 절반(2/4축)은 이 갭이 해소되기 전까지 미충족 상태로 남는다.
 */
function directnessFromProtocol(value: 'yes' | 'no' | null): Directness | null {
  if (value === 'yes') return 'direct';
  if (value === 'no') return 'indirect';
  return null;
}

/** 위 `directnessFromProtocol`과 같은 근거(AC-037, `docs/PRD.md:675`). */
function emojiPreferenceFromProtocol(value: 'ok' | 'avoid' | null): EmojiPreference | null {
  if (value === 'avoid') return 'avoids';
  if (value === 'ok') return 'neutral';
  return null;
}

function resolveMergedStyle<T extends string>(
  field: 'directness' | 'emojiPreference',
  selfReported: T | null,
  learnedItems: LearnedItem[],
): T | null {
  const learned = learnedItems.find((item) => PATTERN_TO_STYLE_FIELD[item.patternKey] === field);
  return learned ? (learned.value as T) : selfReported;
}
export const run: MediationPipeline = async (input, deps) => {
  const { llm } = deps;

  // ① C1 — 원문의 긴급도를 분류한다(AC-003). 변환 전 원문을 판정하는 스텝이라 항상 맨 앞이다.
  const classification = await runUrgencyClassification({ text: input.text }, llm);
  // AC-004 — 사용자 override가 있으면 C1 판정 대신 그 값을 쓴다. 판정 로직의 단일 출처는
  // `resolveEffectiveUrgency`(이 파일이 다시 구현하지 않는다).
  const effectiveUrgency = resolveEffectiveUrgency(
    classification.urgency,
    input.context.urgencyOverride,
  );

  // ② (CRITICAL 즉시) — AC-005 분기점. 예약 발송(T32)·기한 협상(T39/T40)이 이 리포에서 전부
  // `todo`라 지금 건너뛸 코드 경로 자체가 없다(`rules/urgency-routing.ts` 헤더 주석 — 억지로
  // 스킵 로직을 만들지 않는다, `docs/Architecture.md` 설계 제1원칙 R2). 판정 자체는 여기서 항상
  // 계산해 순서를 로그/테스트로 확인할 수 있게 한다(AC-032) — 그 단계들이 생기면
  // `deliveryPath === 'immediate'`일 때 자기 자신을 건너뛰어야 한다.
  const deliveryPath = resolveDeliveryPath(effectiveUrgency);
  if (deliveryPath === 'immediate') {
    // 🔴 건너뛸 예약·지연 코드가 아직 없다 — 지금은 그대로 톤 정제로 진행한다(의도적 스텁).
  }

  // ③ C3 — 발신자 프로필. `input.sender.profile`은 Route Handler가 `run()` 호출 전에 이미
  // `profiles`/`profile_learned_items`를 조회해 채운 값이다(F1-b, AC-028 — core는 조회하지
  // 않는다). `honorificLevel`은 자기신고 그대로 아래 C2 호출의 입력으로 넘긴다 — 프로필이
  // 비어 있으면(`skipped`/`not_started`) `null`이고, C2는 기본 레벨을 지어내지 않는다
  // (`docs/Architecture.md` Data Flow 1-a, DECISIONS #40). `directness`/`emojiPreference`는
  // T79(위 `resolveMergedStyle` 주석) — `deps.data.learnedItems`에 해당 축의 학습값이 있으면
  // 그 값이 자기신고를 덮어쓴다.
  // 🔴 T41/T42(AC-037) — 규약이 C3(자기신고+학습값 병합 결과)보다 우선한다(`docs/PRD.md:675`
  // "동일 항목이 C3 전역 프로필과 충돌하는 경우 규약 값이 우선 적용된다"). 규약 값이 있으면
  // 그 값을 쓰고, 없으면(`input.recipient`가 null이거나 그 축이 미합의) C3 병합 결과로 되돌아간다.
  const directness =
    directnessFromProtocol(input.recipient?.protocol?.directnessAllowed ?? null) ??
    resolveMergedStyle<Directness>('directness', input.sender.profile.directness, deps.data.learnedItems);
  const emojiPreference =
    emojiPreferenceFromProtocol(input.recipient?.protocol?.emojiPolicy ?? null) ??
    resolveMergedStyle<EmojiPreference>(
      'emojiPreference',
      input.sender.profile.emojiPreference,
      deps.data.learnedItems,
    );

  // ④ C5 — 용어사전. `deps.data.dictionary`도 Route Handler가 이미 조회를 마친 값이다(AC-028).
  // 별도 LLM 호출이 아니라 아래 C2 프롬프트에 구조화된 데이터로 주입된다(T22).

  // ⑤ C2 — 보존 대상(마감일·수치·필수 액션)을 먼저 고정한 뒤 톤을 변환하고, 같은 호출 안에서
  // 오해 사전 경고와 C5 사전 주입 결과를 함께 산출한다(AC-006/043/045/046/049, 추가 호출 금지).
  const tone = await runToneTransform(
    {
      text: input.text,
      languageDirection: input.context.languageDirection,
      honorificLevel: input.sender.profile.honorificLevel,
      referenceDate: deps.referenceDate,
      dictionary: deps.data.dictionary,
      directness,
      emojiPreference,
    },
    llm,
  );

  // ⑥ C4 — 변환문을 발신자 원문 언어로 역번역해 발신자가 스스로 검증할 수 있게 한다(AC-001).
  const backTranslation = await runBackTranslation(
    { text: tone.transformed, targetLanguage: input.sender.language },
    llm,
  );

  // F1-e — 세 스텝(C1/C2/C4)의 출처를 계약 필드(`stepSources`)로 먼저 채우고, 화면 레벨 단일
  // `source`는 그 세 값에서 파생시킨다(`source = worst(stepSources)`, `combineSource` 참조).
  const stepSources = { c1: classification.source, c2: tone.source, c4: backTranslation.source };
  const source = combineSource(stepSources.c1, stepSources.c2, stepSources.c4);

  // AC-046③ — EN→KO 변환문의 종결어미 레벨 혼용 감지. 방향이 en-ko일 때만 검사한다(AC-046이
  // EN→KO 전용이므로).
  const warnings: Warning[] = [];
  if (input.context.languageDirection === 'en-ko') {
    const warning = honorificMixedWarning(tone.transformed);
    if (warning) warnings.push(warning);
  }
  // AC-047② — C2가 원문과 교차 검증까지 마치고 넘긴 미등록 호칭 목록을 `Warning[]`으로 조립한다.
  // 방향과 무관하게 항상 검사한다.
  warnings.push(...honorificNotRegisteredWarnings(tone.unregisteredHonorifics));

  // ⑦ (감정형이면 C6) — AC-058 게이트. `assessEmotionalSignal`은 추가 LLM 호출 없이 원문에서
  // 감정 신호 유무를 판정하는 순수 함수이고, `ticketOptionFrom`이 그 결과를 판별 유니온으로만
  // 조립하는 유일한 통로다(F1-c). "제시만" 한다 — 항상 제시/항상 미제시가 아니다.
  const ticketOption = ticketOptionFrom(assessEmotionalSignal(input.text));

  // 개인화 적용 여부(`contract.ts` `MediationResult.personalizationApplied` 주석이 유일한 출처) —
  // `false`가 되는 두 경우: ① 발신자 프로필이 비었거나 온보딩을 건너뛴 상태(AC-059③) ② 수신자가
  // 미지정(AC-066③). 두 조건을 모두 벗어나야(온보딩 완료 + 수신자 지정) `true`다. 추측 기본값을
  // 채우지 않는다.
  const personalizationApplied =
    input.sender.profile.onboardingState === 'completed' && input.recipient !== null;

  return {
    urgency: effectiveUrgency,
    // override 여부와 무관하게 C1이 실제로 그 등급을 고른 근거 문장을 그대로 담는다 — override
    // 자체의 "판단 근거 문장"은 존재하지 않으며, 지어내면 Error Handling "없는 값을 지어내지
    // 않는다" 위반이다.
    urgencyReason: classification.reason,
    transformed: tone.transformed,
    reason: tone.reason,
    preserved: tone.preserved,
    backTranslation: backTranslation.backTranslation,
    warnings,
    misreadRisks: tone.misreadRisks,
    // 🔴 T41이 `input.recipient`를 채우지만 `country`는 수신자 보강(T64/T65, recipient_enrichments)이
    // 아직 없어 항상 `null`이다 — 그래서 이 배열도 여전히 항상 빈 배열이다(현재 상태의 정확한
    // 값, AC-063①). T64/T65가 채워지면 이 자리가 자동으로 채워진다(RecipientContext.country
    // 주석 참조, 이 파일은 그 값을 읽기만 한다).
    holidayConflicts: [],
    personalizationApplied,
    source,
    stepSources,
    ticketOption,
  };
};
