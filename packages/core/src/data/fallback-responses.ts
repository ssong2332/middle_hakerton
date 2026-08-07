// AC-041 사전 준비 데모 폴백 응답.
// `docs/Architecture.md` Data Flow "2) LLM 호출 3단 해석" ③ - 실패/상한초과/크레딧 소진 시
// `cacheKey` 일치분을 우선 조회하고, 없으면 해당 step의 시나리오 기본값(cacheKey 없는 항목)을 쓴다.
// `docs/DECISIONS.md` #11 - TestCases.md/DemoScript.md 시연 입력과 동일 cacheKey로 미리 계산해 담는다.
//
// 🔴 T4는 조회 메커니즘만 만든다. 실 데모 데이터(TestCases.md/DemoScript.md 시연 입력에 맞춘
// 항목)는 각 스텝의 프롬프트가 확정된 뒤 T16(API 실패·크레딧 소진 시 폴백 UI)이 채운다 —
// 지금 채우면 아직 없는 PROMPT_VERSION·cacheKey를 추측으로 만드는 것이 된다(Error Handling
// "없는 값을 지어내지 않는다").
import type { LLMStep } from '../llm/client';

export interface FallbackResponseEntry {
  /** 특정 cacheKey와 정확히 일치할 때만 쓰는 폴백(TestCases.md/DemoScript.md 시연 입력 전용). */
  cacheKey?: string;
  step: LLMStep;
  /** `LLMResponse.content`에 그대로 들어갈 원문 텍스트. */
  content: string;
}

/**
 * 🔴 T16(2026-08-05) — 이 3건은 **시나리오 기본값**(`cacheKey` 없음)만 채운다. `cacheKey`가
 * 정확히 일치하는 데모 전용 항목은 채우지 않았다 — 근거: `cacheKey` 공식(`apps/web/lib/llm/cache-key.ts`
 * `buildCacheKey`)이 `model`을 입력에 포함하는데, `OPENAI_MODEL`은 이 리포에 값이 없다
 * (`.env.example:13` — 플레이스홀더만 있고 실제 값은 각자 로컬 `.env`/배포 환경변수에만 존재,
 * `docs/CodingRules.md` Directory Rules `apps/web/lib/supabase` 행과 같은 이유로 시크릿·환경설정을
 * 이 커밋에 옮겨 적지 않는다). 배포 환경마다 `OPENAI_MODEL` 값이 달라질 수 있어(등급 낮출 때
 * 재배포만으로 끝나도록 코드에 박지 않는다 — 같은 파일 주석) 지금 특정 모델 문자열을 가정해
 * `sha256(model ∥ promptVersion ∥ step ∥ canonicalJson(payload))`를 미리 계산하면, 실제 배포
 * 모델이 다를 때 그 항목은 영원히 조회되지 않는 죽은 데이터가 된다. 반면 아래 시나리오 기본값은
 * `model`/`payload`와 무관하게 항상 조회된다 — `apps/web/lib/llm/openai.ts`(실호출 실패·상한
 * 초과·크레딧 소진 시)와 `packages/core/src/steps/{c1,c2,c4}.ts`(step 스키마 검증 실패 시,
 * `NO_STEP_CACHE_KEY = ''`로 조회) **양쪽 모두**가 이 항목으로 강등된다(`fallback-responses.test.ts`
 * "정확히 일치하는 cacheKey가 없으면 시나리오 기본값을 반환한다"로 검증된 동작).
 *
 * 내용 출처(있는 그대로, 지어내지 않는다) — c1/c2/c4 **셋 다 TestCases U-01**
 * ("혹시 오늘 중으로 가능하실까요?", `docs/DemoScript.md:105-117`)로 통일한다:
 *
 * 🔴 2026-08-05(reviewer C-1 REJECTED → 수정) — 이전 버전은 c1/c2/c4가 서로 다른 데모 시나리오
 * 에서 왔다. c1.reason은 "마감 신호 없음"을 주장했는데 c2는 실제로 마감(오늘 중 → EOD today)을
 * `preserved[]`에 넣고 있어 자기모순이었고, c4.backTranslation은 C4 데모 케이스("이 안건은
 * 보류하고...")의 문구인데 c2.transformed는 U-01("I need this by EOD today...")이라 역번역이
 * 그 위에 표시되는 변환문과 아무 관계가 없었다 — 폴백 발동 시 이 3건이 `SenderPanel.tsx` 한
 * 화면에 동시에 뜨므로, `BackTranslationPreview`(변환문 검증이 존재 이유)가 무너지는 결함이었다.
 * 아래는 셋 다 U-01 하나로 통일한 뒤의 근거다.
 *
 * - `c1`: **판단 근거를 지어내지 않는다** — 폴백은 실제 입력을 보지 않았으므로 "마감·장애 신호가
 *   없다" 같은, 입력을 봤다고 전제하는 주장을 할 근거가 없다. `reason`은 폴백이라 실제 입력 기반
 *   판단 근거가 없다는 사실 자체를 말한다. `urgency: 'NORMAL'`은 유지한다 — `docs/TestCases.md`는
 *   U-01(AC-045, C2 변환 케이스)에 C1 분류 등급을 지정하지 않는다(T-U01~T-U08은 다른 문구의 별도
 *   세트다 — `docs/TestCases.md:345-352`). 표본이 없을 때의 중립값으로 기존 NORMAL을 그대로 쓴다.
 * - `c2`: `docs/DemoScript.md` 장면 3①(TestCases **U-01** "혹시 오늘 중으로 가능하실까요?")의
 *   설계된 변환 예시를 **그대로** 썼다 — "우리 변환: I need this by EOD today. Please confirm if
 *   that's not feasible."(`docs/DemoScript.md:117`). 🔴 Major 5(2026-08-05, reviewer 재검토 →
 *   수정)로 `preserved[]`는 **비운다** — 이전 버전은 이 자리에 같은 케이스의 마감(오늘 중 →
 *   EOD today)을 채워 뒀지만, 폴백은 실제 원문을 본 적이 없으므로 "이걸 원문에서 보존했다"고
 *   주장할 근거가 없다(`ComparisonView.tsx`가 이를 "(보존됨)"으로 렌더해, 쓰지 않은 마감이
 *   보존됐다고 통보되는 결함이었다). `transformed`(위 문구)는 U-01 시나리오 예시로 계속 유지한다.
 * - `c4`: 위 `c2.transformed`("I need this by EOD today. Please confirm if that's not
 *   feasible.")를 **이 태스크가 성실하게 역번역해 새로 작성했다** — TestCases.md/DemoScript.md
 *   원문을 그대로 옮긴 것이 아니다(U-01에는 "역번역이 이렇게 돌아오면 정상"이라는 고정 문구가
 *   없으므로, c2의 변환문 자체를 참조 대상으로 삼아 직접 번역했다. 참조 대상이 명확한 번역이라
 *   지어낸 값은 아니다).
 */
export const FALLBACK_RESPONSES: FallbackResponseEntry[] = [
  {
    step: 'c1',
    content: JSON.stringify({
      urgency: 'NORMAL',
      reason:
        '폴백 응답이라 실제 입력을 확인하지 못했습니다 — 입력 기반 판단 근거 없이 표시하는 기본값입니다.',
    }),
  },
  {
    step: 'c2',
    content: JSON.stringify({
      transformed: "I need this by EOD today. Please confirm if that's not feasible.",
      // 🔴 MJ-A(2026-08-05, 사용자 지시 유지보수 라운드) — 이전 문구("완곡한 표현 속 긴급도를
      // 명시적 기한과 확인 요청 문장으로 복원했습니다")는 실제로 보지 않은 사용자 입력을 분석해
      // 판단한 것처럼 말했다. 마감이 없는 원문에서 이 폴백이 뜨면, 쓰지도 않은 마감("오늘 중")이
      // 실제 원문에서 온 것처럼 preserved[]와 함께 통보되는 결함이었다. c1(`c1.ts` 폴백)과 같은
      // 패턴 — "이건 폴백이라 실제 입력을 확인하지 못했다"는 사실만 말한다.
      //
      // 🔴 Major 5(reviewer 재검토 → 수정, 2026-08-05) — MJ-A는 `reason` 문구만 고쳤고
      // `preserved`는 그대로 두어 근본 결함이 남아 있었다: `ComparisonView.tsx`가 이 배열을
      // "EOD today (보존됨)"으로 렌더하므로, 마감이 없는 실제 원문에서 이 폴백이 떠도 사용자가
      // 쓰지 않은 마감이 "보존됨"으로 통보됐다 — 폴백은 실제로 아무것도 "봤다"고 주장할 근거가
      // 없으므로 `preserved`도 비운다(c1과 동일한 "사실만 말한다" 원칙). `transformed`(U-01
      // 시나리오 예시 텍스트)는 건드리지 않는다 — U-01 데모 문구 자체는 유지 대상이다.
      // Minor(사용자 지시 유지보수 라운드) — "보존 항목" 언급을 지운다. 이 폴백의 `preserved`는
      // 항상 `[]`라(Major 5, 아래 참조) `ComparisonView`의 "보존된 항목" 블록 자체가 렌더되지
      // 않는다 — 화면에 없는 UI를 가리키는 문구였다.
      reason:
        '폴백 응답이라 실제 입력을 확인하지 못했습니다 — 아래 변환문은 예시이며 실제 입력을 분석한 결과가 아닙니다.',
      preserved: [],
      misreadRisks: [],
    }),
  },
  {
    step: 'c4',
    content: JSON.stringify({
      backTranslation: '오늘 중으로 필요합니다. 어려우시면 알려주세요.',
    }),
  },
  /**
   * 🔴 T24(2026-08-06) — C6 폴백. 위 c1/c2/c4와 같은 이유로 **실제 입력을 본 적이 없다는 사실만
   * 말한다** — 근거 없는 섹션 내용을 지어내지 않는다(AC-062와 같은 "없는 값을 지어내지 않는다"
   * 원칙). 4개 섹션 전부 "없음"이 아니라 "폴백이라 원문을 확인하지 못했다"는 사실을 각 섹션에
   * 채운 이유: 섹션이 "없음"이면 "원문에 근거가 없다"는 뜻인데, 폴백은 원문 자체를 본 적이 없으므로
   * 그 주장도 할 수 없다 — 두 상태(근거 없음 vs 폴백이라 판단 불가)를 섞지 않는다.
   * `decisionAuthority`는 `'불명'`(AC-050①과 동일 — 근거를 확인할 수 없으므로 임의 판정 금지),
   * `decisionAuthorityEvidence`는 `null`이다(F1-c 불변식 — `'불명'`일 때만 허용되는 조합).
   */
  {
    step: 'c6',
    content: JSON.stringify({
      sections: {
        problem: '폴백 응답이라 실제 입력을 확인하지 못했습니다.',
        impact: '폴백 응답이라 실제 입력을 확인하지 못했습니다.',
        request: '폴백 응답이라 실제 입력을 확인하지 못했습니다.',
        concernLevel: '폴백 응답이라 실제 입력을 확인하지 못했습니다.',
      },
      decisionAuthority: '불명',
      decisionAuthorityEvidence: null,
    }),
  },
  /**
   * 🔴 T26(2026-08-07) — C7 폴백. 위 c1/c2/c4/c6과 같은 이유로 **실제 입력을 본 적이 없다는
   * 사실만 말한다** — 근거 없는 결정 항목을 지어내지 않는다(AC-020/AC-038과 같은 "없는 값을
   * 지어내지 않는다" 원칙). `decisions: []`가 자연스러운 값인 이유: 폴백은 스레드 원문을 본 적이
   * 없으므로 어떤 결정이 있었는지 자체를 말할 근거가 없다 — 빈 배열은 "결정 없음"이 아니라
   * "폴백이라 판단 불가"에 해당하지만, `SummaryResult.decisions`는 항목이 있을 때만 내용을
   * 담는 구조라 근거 없이 항목을 채우는 대신 빈 배열로 둔다(`unresolved`도 `decisions`에서
   * 파생되므로 함께 빈 배열이 된다, `steps/c7.ts` `toUnresolved()` 참조).
   */
  {
    step: 'c7',
    content: JSON.stringify({
      decisions: [],
    }),
  },
];

/**
 * cacheKey 정확 일치를 우선하고, 없으면 같은 step의 시나리오 기본값(cacheKey 없는 항목)을 쓴다.
 * 아무것도 없으면 `undefined` - 호출자(`apps/web/lib/llm/openai.ts`)가 원인에 따라
 * `LLMUnavailableError`(실제 호출 실패) 또는 `QuotaExceededError`(요청 상한 초과)를 던진다
 * (`packages/core/src/llm/client.ts` `LLMClient` 실패 계약 — 2026-08-04 원인별로 분리).
 */
export function findFallbackResponse(
  step: LLMStep,
  cacheKey: string,
  entries: readonly FallbackResponseEntry[] = FALLBACK_RESPONSES,
): FallbackResponseEntry | undefined {
  const exact = entries.find((entry) => entry.cacheKey === cacheKey);
  if (exact) return exact;
  return entries.find((entry) => entry.step === step && entry.cacheKey === undefined);
}
