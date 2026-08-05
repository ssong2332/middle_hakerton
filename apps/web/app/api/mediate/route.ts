/**
 * `POST /api/mediate` — `docs/API.md` "POST /api/mediate" · `docs/Architecture.md` Data Flow ①.
 *
 * 🔴 **T5 범위 경계.** 최종 계약은 C1 분류 → C3 프로필 → C5 용어 주입 → C2 변환 → C4 역번역을
 * 고정 순서로 실행하지만(AC-032), 그 오케스트레이션(`packages/core/src/pipeline.ts`의 `run()`)은
 * **T28의 범위**로 명시돼 있다(그 파일 헤더 주석 "이 파일에 구현이 없는 것은 의도다"). C1(T7)·
 * C3(T19)·C5(T22)·C2(T10)·C6(T24)도 아직 없다. 이 라우트는 **지금 실제로 동작하는 유일한
 * 스텝인 C4만 수행**하고, 나머지 필드는 `MediationResult`(F1) 계약을 만족시키는 선에서
 * placeholder로 채운다 — 각 필드 옆 주석이 소유 태스크를 가리킨다. 해당 태스크가 착수되면
 * 그 줄만 교체하면 된다(`packages/core/src/pipeline.ts`가 준비되면 이 라우트는 그것을 호출하는
 * 형태로 바뀐다 — T28 완료 시 이 파일도 함께 정리 대상).
 *
 * 근거: `docs/Tasks.md` T6 원문 "T5는 [BE-B] 라우트만 만들고 그것을 호출하는 브라우저 화면이
 * 없다" — T5가 실제 HTTP 라우트를 만든다는 것을 그 다음 태스크(T6)가 전제하고 있다.
 */
import { z } from 'zod';
import {
  honorificMixedWarning,
  runBackTranslation,
  ticketOptionFrom,
  type LanguageCode,
  type MediationResult,
  type Warning,
} from '@cross-border/core';
import { withApi } from '../../../lib/http';
import { createOpenAiLLMClient } from '../../../lib/llm/openai';

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

export const POST = withApi<MediateRequest, MediationResult>(
  { schema: mediateRequestSchema, requireAuth: true },
  async ({ input, session }) => {
    const senderLanguage = senderLanguageOf(input.context.languageDirection);

    // 🔴 C2(T10) 대기 — 실제 톤 변환이 없으므로 원문을 그대로 "변환문" 자리에 둔다. 이것은
    // 톤 변환이 아니라 항등 placeholder다(변환 손실이 없다고 주장하지 않는다). T10 착수 시
    // 이 줄을 C2 호출로 교체한다.
    const transformed = input.text;

    const llm = createOpenAiLLMClient(session?.userId);
    const { backTranslation, source } = await runBackTranslation(
      { text: transformed, targetLanguage: senderLanguage },
      llm,
    );

    // AC-046③ — EN→KO 변환문의 종결어미 레벨 혼용 감지. C2가 없는 지금은 `transformed`가
    // 원문(placeholder)이라 실질적으로 트리거될 일이 적지만, 배선 자체는 지금 완성해 둔다 —
    // T10이 실제 한국어 변환문을 채우는 순간 그대로 동작한다.
    const warnings: Warning[] = [];
    if (input.context.languageDirection === 'en-ko') {
      const warning = honorificMixedWarning(transformed);
      if (warning) warnings.push(warning);
    }

    const result: MediationResult = {
      // 🔴 C1(T7) 대기. override가 있으면 그 값을 반영하고(AC-004), 없으면 중립 기본값이다.
      urgency: input.context.urgencyOverride ?? 'NORMAL',
      urgencyReason: 'C1 긴급도 분류가 아직 연결되지 않았습니다(T7 대기) — 임시값입니다.',
      transformed,
      // 🔴 C2(T10) 대기.
      reason: 'C2 톤 변환이 아직 연결되지 않았습니다(T10 대기) — 임시값입니다.',
      // 🔴 C2 보존 필터(T10) 대기.
      preserved: [],
      backTranslation,
      warnings,
      // 🔴 오해 사전 경고 생성(T10) 대기.
      misreadRisks: [],
      // 🔴 수신자 국가 정보가 아직 연결되지 않아(T22/T41) 항상 null이므로 빈 배열이 정확한
      // 값이다(AC-063①) — placeholder가 아니라 현재 상태의 정답이다.
      holidayConflicts: [],
      // 🔴 프로필(T19)·규약(T41)이 아직 연결되지 않아 개인화가 실제로 적용되지 않는다 —
      // 이 역시 현재 상태의 정확한 값이다(AC-059③/AC-066③).
      personalizationApplied: false,
      source,
      // 🔴 C6 게이트(T24) 대기 — 판정 근거를 얻지 못했으므로 fail-closed(undetermined)가
      // 정답이다(AC-058, `ticketOptionFrom`은 이 조합만 만드는 유일한 통로).
      ticketOption: ticketOptionFrom('undetermined'),
    };

    return result;
  },
);
