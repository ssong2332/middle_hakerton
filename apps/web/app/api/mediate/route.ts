/**
 * `POST /api/mediate` — `docs/API.md` "POST /api/mediate" · `docs/Architecture.md` Data Flow ①.
 *
 * 🔴 **범위 경계(T5+T7+T9+T10 누적).** 최종 계약은 C1 분류 → C3 프로필 → C5 용어 주입 → C2 변환 →
 * C4 역번역을 고정 순서로 실행하지만(AC-032), 그 오케스트레이션(`packages/core/src/pipeline.ts`의
 * `run()`)은 **T28의 범위**로 명시돼 있다(그 파일 헤더 주석 "이 파일에 구현이 없는 것은 의도다").
 * C3(T19)·C5(T22)·C6(T24)는 아직 없다. 이 라우트는 **지금 실제로 동작하는 세 스텝인
 * C1(T7)·C2(T10)·C4(T5)만 수행**하고, 나머지 필드는 `MediationResult`(F1) 계약을 만족시키는 선에서
 * placeholder로 채운다 — 각 필드 옆 주석이 소유 태스크를 가리킨다. 해당 태스크가 착수되면
 * 그 줄만 교체하면 된다(`packages/core/src/pipeline.ts`가 준비되면 이 라우트는 그것을 호출하는
 * 형태로 바뀐다 — T28 완료 시 이 파일도 함께 정리 대상).
 *
 * 근거: `docs/Tasks.md` T6 원문 "T5는 [BE-B] 라우트만 만들고 그것을 호출하는 브라우저 화면이
 * 없다" — T5가 실제 HTTP 라우트를 만든다는 것을 그 다음 태스크(T6)가 전제하고 있다.
 *
 * 🔴 **T10 배선 — 발신자 프로필이 아직 없다.** C2의 존댓말 레벨 입력(`honorificLevel`)은
 * `sender.profile.honorificLevel`에서 와야 하지만(AC-046②), 그 값을 채우는 C3 온보딩(T19)과
 * 그것을 저장하는 스키마(T18)가 아직 `todo`다 — 이 라우트는 세션에서 프로필을 조회하지 않고
 * 항상 `null`을 넘긴다. `runToneTransform`은 그 경우 특정 레벨을 지어내지 않고 "하나의
 * 종결어미 레벨을 일관되게 유지하라"는 지시만 프롬프트에 싣는다(`docs/adr/0007-honorific-level
 * -resolution-boundary.md` D2 — 기본값을 채우면 캐시 키가 "프로필 없음"과 "프로필=해요체"를
 * 구분 못 하게 된다). 쌍방 규약(#24)에도 존댓말 축 자체가 없어 "규약 우선" 조각은 지금 표현
 * 불가능하다(`docs/DECISIONS.md` #39, ADR-0007 D1). T19·T18이 붙으면 이 자리를 실제 프로필
 * 조회로 교체한다.
 *
 * 🔴 **T9(AC-005) 분기점 안내.** `docs/Architecture.md` Data Flow "① 웹앱 중재" ②는 "CRITICAL이면
 * 예약·지연 경로를 건너뛰고 톤 정제만"을 요구한다. 이 저장소에는 아직 예약 발송(UX-006)·기한
 * 협상(UX-005)에 대응하는 코드 경로가 존재하지 않으므로(둘 다 `docs/Tasks.md`에서 아직 `todo`),
 * 지금 이 라우트에서 실제로 건너뛸 대상이 없다 — 억지로 스킵 로직을 만들지 않는다. 대신 그
 * 분기가 소비할 타입(`DeliveryPath`)과 순수 판정 함수(`resolveDeliveryPath`,
 * `packages/core/src/rules/urgency-routing.ts`)를 지금 만들어 테스트로 고정해 두었다 — 예약·지연
 * 단계가 추가되는 태스크는 `resolveDeliveryPath(effectiveUrgency) === 'immediate'`일 때 자기
 * 자신을 건너뛰어야 한다.
 */
import { z } from 'zod';
import {
  assessEmotionalSignal,
  combineSource,
  honorificMixedWarning,
  resolveEffectiveUrgency,
  runBackTranslation,
  runToneTransform,
  runUrgencyClassification,
  ticketOptionFrom,
  type LanguageCode,
  type MediationResult,
  type Warning,
} from '@cross-border/core';
import { withApi } from '../../../lib/http';
// 🔴 로컬 테스트 전용 provider 스위치(`LLM_PROVIDER` 환경변수) — 기본값은 항상 OpenAI다.
// `apps/web/lib/llm/create-client.ts` 파일 헤더 주석 참조. Vercel 프로덕션에는 이 변수를
// 설정하지 않으므로 배포 경로는 그대로 OpenAI로 간다.
import { createLLMClient } from '../../../lib/llm/create-client';

const mediateRequestSchema = z.object({
  // 🔴 길이 상한 검증을 걸지 않는다 — 5,000자는 소프트 캡이며 변환을 막지 않는다(AC-061②).
  text: z.string().min(1),
  recipient: z.string().nullable().optional(),
  context: z.object({
    languageDirection: z.enum(['ko-en', 'en-ko']),
    channel: z.enum(['web', 'extension']),
    urgencyOverride: z.enum(['CRITICAL', 'NORMAL', 'LOW']).nullable().optional(),
    needDeadline: z.string().nullable().optional(),
  }),
});

type MediateRequest = z.infer<typeof mediateRequestSchema>;

/** `context.languageDirection`의 앞쪽 값이 발신자 언어다(`docs/Architecture.md:224` 주석). */
function senderLanguageOf(direction: 'ko-en' | 'en-ko'): LanguageCode {
  return direction === 'ko-en' ? 'ko' : 'en';
}

// 🔴 (2026-08-05 갱신 — F1-e, DECISIONS #48 · ADR-0009) 이 라우트가 LLM을 세 번 호출한다는
// 사실(C1·C2·C4)과 "복수 스텝의 source를 어떻게 합치는가"라는 질문은 그대로이지만, 그 답은 더
// 이상 이 파일의 지역 판단이 아니다 — `MediationResult`가 이제 `stepSources: { c1, c2, c4 }`를
// 계약으로 노출하고, `source = worst(stepSources)`(fallback > cache > live) 불변식과 그 유일한
// 구현(`combineSource`)은 `packages/core/src/rules/response-source.ts`로 승격됐다(웹·확장
// 어댑터가 각자 재구현하지 않도록). 이 라우트는 그 함수를 세 값과 함께 호출만 한다.

export const POST = withApi<MediateRequest, MediationResult>(
  { schema: mediateRequestSchema, requireAuth: true },
  async ({ input, session }) => {
    const senderLanguage = senderLanguageOf(input.context.languageDirection);

    const llm = await createLLMClient(session?.userId);

    // C1(T7) — 원문의 긴급도를 분류한다(AC-003). C1은 변환 전 원문의 긴급도를 판정하는 스텝이라
    // 이 순서는 C2가 붙은 뒤에도 바뀌지 않는다(`docs/Architecture.md` Data Flow ①이 C1을 항상
    // 맨 앞에 둔다).
    const classification = await runUrgencyClassification({ text: input.text }, llm);
    // AC-004 — 사용자 override가 있으면 C1 판정 대신 그 값을 쓴다. override 판정 로직의 단일
    // 출처는 `resolveEffectiveUrgency`(core) 하나이며 이 라우트가 다시 구현하지 않는다.
    const effectiveUrgency = resolveEffectiveUrgency(
      classification.urgency,
      input.context.urgencyOverride ?? null,
    );

    // C2(T10) — 보존 대상(마감일·수치·필수 액션)을 먼저 추출해 고정한 뒤 톤을 변환하고, 같은
    // 호출 안에서 오해 사전 경고(misreadRisks)를 함께 산출한다(AC-006/043/045/046/049). 프로필의
    // 존댓말 레벨은 세션에서 아직 조회하지 않는다(파일 상단 "T10 배선" 주석 참조) — `null`을
    // 넘겨도 `runToneTransform`은 기본 레지스터로 대체하지 않는다. 대신 특정 레벨을 지정하지
    // 않은 채 "한 메시지 안에서 하나의 종결어미 레벨을 끝까지 유지하라"는 일관성 지시만 프롬프트에
    // 싣는다(`docs/DECISIONS.md` #40, `docs/adr/0007-honorific-level-resolution-boundary.md` D2 —
    // 기본값을 채우면 "프로필 없음"과 "프로필=특정값"의 payload가 같아져 캐시 키가 두 상태를
    // 구분하지 못하게 된다).
    const {
      transformed,
      reason,
      preserved,
      misreadRisks,
      source: toneSource,
    } = await runToneTransform(
      {
        text: input.text,
        languageDirection: input.context.languageDirection,
        honorificLevel: null,
        // 🔴 QA 정적 분석 후속(2026-08-05) — 서버 현재 시각 기준. 원문에 연도가 없는 날짜
        // (`8월 12일`, `8/8` 등)를 모델이 지어내지 않고 채울 수 있게 하는 값이다
        // (`packages/core/src/prompts/c2.ts` `C2Payload.referenceYear` 주석 참조).
        referenceDate: new Date().toISOString().slice(0, 10),
      },
      llm,
    );

    const { backTranslation, source: backTranslationSource } = await runBackTranslation(
      { text: transformed, targetLanguage: senderLanguage },
      llm,
    );
    // 🔴 F1-e — 세 스텝의 출처를 계약 필드(`stepSources`)로 먼저 채우고, 화면 레벨 단일 `source`는
    // 그 세 값에서 파생시킨다(`source = worst(stepSources)`, `combineSource` 참조). 합치는 지역
    // 규칙을 다시 만들지 않는다 — `packages/core`가 유일한 구현이다.
    const stepSources = { c1: classification.source, c2: toneSource, c4: backTranslationSource };
    const source = combineSource(stepSources.c1, stepSources.c2, stepSources.c4);

    // AC-046③ — EN→KO 변환문의 종결어미 레벨 혼용 감지. C2가 실제 한국어 변환문을 채우므로
    // 이제 정상적으로 트리거된다.
    const warnings: Warning[] = [];
    if (input.context.languageDirection === 'en-ko') {
      const warning = honorificMixedWarning(transformed);
      if (warning) warnings.push(warning);
    }

    const result: MediationResult = {
      // AC-003 — C1 판정. override가 있으면 그 값이 반영된다(AC-004, `resolveEffectiveUrgency`).
      urgency: effectiveUrgency,
      // 🔴 override 여부와 무관하게 C1이 실제로 그 등급을 고른 근거 문장을 그대로 보여준다 —
      // override는 사용자의 수동 선택이라 그 자체의 "판단 근거 문장"이 존재하지 않으며, 지어내면
      // Error Handling "없는 값을 지어내지 않는다" 위반이다. 이 응답만 보면 "override로 나온 등급 +
      // override 전 근거 문장"이 뒤섞여 보일 수 있으므로, 그 구분을 유지하는 책임은 FE에 있다 —
      // `MediationDemoForm`이 이번 요청에 실어 보낸 override 값을 응답을 받은 뒤에도
      // `appliedOverride`로 계속 들고 있다가 "사용자가 등급을 조정했습니다" 안내를 유지한다
      // (M1, `MediationDemoForm.test.tsx` "근거-등급 모순 방지" 참조) — `UrgencyPanel` 자체는
      // `isOverridden`을 그대로 받아 렌더만 할 뿐 이 판단을 하지 않는다.
      urgencyReason: classification.reason,
      transformed,
      reason,
      preserved,
      backTranslation,
      warnings,
      misreadRisks,
      // 🔴 수신자 국가 정보가 아직 연결되지 않아(T22/T41) 항상 null이므로 빈 배열이 정확한
      // 값이다(AC-063①) — placeholder가 아니라 현재 상태의 정답이다.
      holidayConflicts: [],
      // 🔴 프로필(T19)·규약(T41)이 아직 연결되지 않아 개인화가 실제로 적용되지 않는다 —
      // 이 역시 현재 상태의 정확한 값이다(AC-059③/AC-066③).
      personalizationApplied: false,
      source,
      // 🔴 13번째 필드(F1-e, DECISIONS #48 · ADR-0009) — 스텝별 출처. `source`는 이 값에서
      // 파생된다(위 `combineSource` 호출 참조). 세 키 모두 AC-032 고정 순서상 항상 채워진다.
      stepSources,
      // 🔴 T24 — AC-058 게이트. `assessEmotionalSignal`(core, `steps/c6.ts`)은 추가 LLM 호출 없이
      // 원문에서 감정 신호 유무를 판정하는 순수 함수다(`docs/adr/0005-c6-ticket-gate-field.md`
      // Follow-up #2 "산출 위치는 구현 판단" + "추가 호출 금지"). `ticketOptionFrom`은 그 결과를
      // 판별 유니온으로만 조립하는 유일한 통로다(F1-c).
      ticketOption: ticketOptionFrom(assessEmotionalSignal(input.text)),
    };

    return result;
  },
);
