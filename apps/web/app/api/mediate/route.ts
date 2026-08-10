/**
 * `POST /api/mediate` — `docs/API.md` "POST /api/mediate" · `docs/Architecture.md` Data Flow ①.
 *
 * 🔴 **T28 완료 — 이 라우트는 이제 `packages/core/src/pipeline.ts`의 `run()`을 부르는 얇은
 * 어댑터다.** 오케스트레이션(C1 분류 → (CRITICAL 즉시) → C3 프로필 → C5 용어 주입 → C2 변환 →
 * C4 역번역 → (감정형이면 C6), AC-032)은 더 이상 이 파일에 인라인으로 있지 않다 —
 * `pipeline.ts` 헤더 주석이 예고한 대로("T28 완료 시 이 파일도 함께 정리 대상") `run()`이 그
 * 순서를 소유하고, 이 파일은 **DB 조회를 끝낸 뒤 `run(input, deps)`을 호출**하기만 한다.
 *
 * 🔴 **조회는 여기서 끝난다(F1-b)** — `dictionary_terms`(C5, T22) · `profiles`/
 * `profile_learned_items`(C3, T28)를 `run()` 호출 *전에* 전부 끝낸다(AC-028 — core는 조회하지
 * 않는다). `session.client`가 없으면(테스트 목이 `{ userId }`만 돌려주는 경우, `lib/auth.ts`
 * `Session` JSDoc 참조) 각각 "없음"과 동치인 기본값으로 대체한다 — 사전은 `[]`, 프로필은
 * `not_started` + 스타일 4필드 전부 `null`, learnedItems는 `[]`. 읽기 실패가 아니라 테스트/타입
 * 레벨의 선택적 필드를 방어하는 것이다(`lib/dictionary/storage.ts` 헤더 주석과 같은 판단).
 *
 * 🔴 **T41/T42 — recipient를 배선한다.** `input.recipient`(요청 body의 식별자 문자열)가 있고
 * `session.client`가 있으면 `pair_protocols`를 조회해 `RecipientContext`를 조립한다. **국가·
 * 타임존은 아직 배선하지 않는다** — 수신자 보강(T64/T65, `recipient_enrichments`)이 여전히
 * `todo`라 그 값을 채울 조회 자체가 없다(지어내면 AC-063①/AC-065④ 위반) — `country`/
 * `timezone`은 항상 `null`이고, 이는 "현재 상태의 정확한 값"이다(`holidayConflicts: []`와
 * 같은 원칙, `pipeline.ts` 헤더 주석 참조). recipient가 채워지면 `personalizationApplied`는
 * (온보딩 완료 조건과 함께) `true`가 될 수 있다 — 두 false 조건(`MediationResult.
 * personalizationApplied` 계약 주석, AC-059③/AC-066③) 중 "수신자 미지정"이 더 이상 항상
 * 참은 아니게 된다.
 */
import { z } from 'zod';
import {
  run,
  type CommunicationProfile,
  type DictionaryEntry,
  type LanguageCode,
  type LearnedItem,
  type MediationResult,
  type RecipientContext,
} from '@cross-border/core';
import { withApi } from '../../../lib/http';
// 🔴 로컬 테스트 전용 provider 스위치(`LLM_PROVIDER` 환경변수) — 기본값은 항상 OpenAI다.
// `apps/web/lib/llm/create-client.ts` 파일 헤더 주석 참조. Vercel 프로덕션에는 이 변수를
// 설정하지 않으므로 배포 경로는 그대로 OpenAI로 간다.
import { createLLMClient } from '../../../lib/llm/create-client';
// 🔴 T22 — C5 용어사전 조회. `run()` 호출 전에 여기서 조회를 끝낸다(AC-028, 파일 헤더 주석 참조).
import { fetchDictionaryEntries } from '../../../lib/dictionary/storage';
// 🔴 T28 — C3 프로필/학습 항목 조회. 같은 이유로 `run()` 호출 전에 끝낸다.
import { fetchLearnedItems, fetchSenderProfile } from '../../../lib/profile/storage';
// 🔴 T41/T42 — 규약 조회. 같은 이유로 `run()` 호출 전에 끝낸다.
import { fetchProtocol, toPairProtocolOrNull } from '../../../lib/protocol/storage';

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

/** `session.client`가 없을 때(테스트 목) 프로필 조회 없음과 동치인 기본값 — `fetchSenderProfile`의
 * "행 없음" 기본값과 같은 형태(AC-059②③, `lib/profile/storage.ts` 참조). */
const EMPTY_PROFILE: CommunicationProfile = {
  onboardingState: 'not_started',
  directness: null,
  emojiPreference: null,
  formality: null,
  honorificLevel: null,
};

export const POST = withApi<MediateRequest, MediationResult>(
  { schema: mediateRequestSchema, requireAuth: true },
  async ({ input, session }) => {
    const senderLanguage = senderLanguageOf(input.context.languageDirection);

    const llm = await createLLMClient(session?.userId);

    // 🔴 F1-b "조회는 여기서 끝난다" — C5(dictionary_terms)·C3(profiles/profile_learned_items)를
    // `run()` 호출 전에 전부 끝낸다. `session.client`가 없으면(테스트 목) 셋 다 "없음"과 동치인
    // 기본값으로 대체한다.
    let dictionary: DictionaryEntry[] = [];
    let profile: CommunicationProfile = EMPTY_PROFILE;
    let learnedItems: LearnedItem[] = [];
    if (session?.client) {
      [dictionary, profile, learnedItems] = await Promise.all([
        fetchDictionaryEntries(session.client, session.userId),
        fetchSenderProfile(session.client, session.userId),
        fetchLearnedItems(session.client, session.userId),
      ]);
    }

    // 🔴 T41/T42 — recipient가 지정되고 세션 클라이언트가 있을 때만 규약을 조회한다. 이메일은
    // `client.auth.getUser()`로 확인한다(`apps/web/app/api/protocol/route.ts`와 같은 패턴).
    let recipient: RecipientContext | null = null;
    if (input.recipient && session?.client) {
      const { data: userData, error: userError } = await session.client.auth.getUser();
      if (!userError && userData.user?.email) {
        const protocolRecord = await fetchProtocol(session.client, userData.user.email, input.recipient);
        recipient = {
          identifier: input.recipient,
          protocol: toPairProtocolOrNull(protocolRecord),
          // 🔴 T64/T65(수신자 보강)가 todo라 아직 채울 수 없다 — 파일 헤더 주석 참조.
          country: null,
          timezone: null,
        };
      }
    }

    return run(
      {
        text: input.text,
        sender: { language: senderLanguage, profile },
        recipient,
        context: {
          languageDirection: input.context.languageDirection,
          channel: input.context.channel,
          urgencyOverride: input.context.urgencyOverride ?? null,
          needDeadline: input.context.needDeadline ?? null,
        },
      },
      {
        llm,
        data: { dictionary, learnedItems },
        // 🔴 F1-d(ADR-0008) — core는 시스템 시계를 직접 읽지 않는다. 호출자(여기)가
        // `new Date()`로 만들어 `deps.referenceDate`로 넘긴다(UTC 기준, ADR-0008 D2).
        referenceDate: new Date().toISOString().slice(0, 10),
      },
    );
  },
);
