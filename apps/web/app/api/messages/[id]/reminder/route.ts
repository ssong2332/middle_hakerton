/**
 * `POST /api/messages/{id}/reminder` — `docs/API.md` "POST /api/messages/{id}/reminder"
 * (UX-015(UF-013), AC-044③④). `docs/Tasks.md` T51/T52.
 *
 * 🔴 **초안만 반환한다.** 이 라우트는 아무것도 발송·저장하지 않는다 — 사용자가 편집·승인하면
 * FE가 별도로 `POST /api/messages`(`isReminder:true`)를 호출한다(`docs/API.md:155`).
 *
 * 🔴 **C2를 그대로 재사용한다(`runToneTransform`, T10) — 새 프롬프트·새 LLM 호출 경로를 만들지
 * 않는다**(`docs/Tasks.md` T51 원문 "문구는 T10의 C2 톤 변환을 재사용해 생성"). 이 라우트가 새로
 * 만드는 것은 **입력 시드 문구**뿐이다 — 원 메시지 내용을 인용하지 않는 고정 정중 확인 템플릿이다
 * (원문을 지어내 섞지 않는다, `contract.ts` "없는 값을 지어내지 않는다" 원칙과 같은 방향).
 *
 * ## 🔴 언어 방향 결정 — 스코프 결정(설계 근거를 여기 남긴다)
 * `sent_messages`에는 `language_direction` 컬럼이 없다(`docs/Database.md:182` 스키마 grep 0건).
 * 대신 **이미 발송된 `final_text`가 어떤 언어인지**(한글 포함 여부, `HANGUL_RE`)로 목표 언어를
 * 판별한다 — 리마인드도 같은 수신자에게 같은 언어로 가야 자연스럽다. 목표가 한국어면
 * `languageDirection:'en-ko'`(영어 시드 → 한국어 출력, 존댓말 레벨 규칙 적용)를, 목표가 영어면
 * `'ko-en'`(한국어 시드 → 영어 출력)을 쓴다 — `runToneTransform`을 변경 없이 그대로 쓸 수 있는
 * 유일한 조합이다.
 *
 * ## 🔴 프로필 축 — 스코프 결정
 * `honorificLevel`/`directness`/`emojiPreference`는 발신자의 **자기신고 프로필 원값**만 쓴다
 * (`fetchSenderProfile`). `pipeline.ts`의 T79 학습값 병합(`resolveMergedStyle`)과 쌍방 규약
 * 우선순위(`directnessFromProtocol` 등)는 `run()` 내부 비공개 함수라 여기서 재사용할 수 없고,
 * 새로 export하는 것은 이 태스크 범위 밖의 core 변경이다 — 이 라우트는 전체 중재 파이프라인이
 * 아니라 C2 한 스텝만 쓰는 좁은 호출이므로, 그 병합 없이 자기신고 값만 쓰는 것으로 범위를
 * 좁혔다(다음 라운드에서 필요하면 `pipeline.ts`가 병합 로직을 export하도록 확장).
 */
import { ValidationError, runToneTransform, type LanguageDirection } from '@cross-border/core';
import { withApi } from '../../../../../lib/http';
import { fetchSentMessageForReminder } from '../../../../../lib/messages/storage';
import { fetchSenderProfile } from '../../../../../lib/profile/storage';
import { createLLMClient } from '../../../../../lib/llm/create-client';

const HANGUL_RE = /[가-힣]/;

const EN_SEED_TEXT =
  "I'm following up on the message I sent earlier, since I haven't heard back yet. " +
  'Please let me know when you have a chance to respond — no rush.';
const KO_SEED_TEXT =
  '이전에 보내드린 메시지에 대해 아직 답변을 받지 못해 다시 한번 확인차 연락드립니다. ' +
  '편하실 때 답변 부탁드립니다.';

/**
 * 목표 언어(수신자가 읽을 언어)를 `finalText`의 한글 포함 여부로 판정하고, 그 목표를 만드는
 * `(languageDirection, seedText)` 조합을 고른다(파일 헤더 "언어 방향 결정" 참조).
 */
function resolveSeed(finalText: string): { languageDirection: LanguageDirection; seedText: string } {
  const targetIsKorean = HANGUL_RE.test(finalText);
  return targetIsKorean
    ? { languageDirection: 'en-ko', seedText: EN_SEED_TEXT }
    : { languageDirection: 'ko-en', seedText: KO_SEED_TEXT };
}

function parseIdFromReminderUrl(request: Request): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  // [...'api','messages',id,'reminder']
  const id = segments[segments.length - 2];
  if (!id) {
    throw new ValidationError('id가 없습니다');
  }
  return id;
}

export interface ReminderDraftResponse {
  draftText: string;
  source: 'live' | 'cache' | 'fallback';
}

export const POST = withApi<undefined, ReminderDraftResponse>(
  { requireAuth: true },
  async ({ request, session }) => {
    const client = session?.client;
    if (!client) {
      throw new Error('세션에 인증된 Supabase 클라이언트가 없습니다');
    }
    const id = parseIdFromReminderUrl(request);

    const [message, profile] = await Promise.all([
      fetchSentMessageForReminder(client, session.userId, id),
      fetchSenderProfile(client, session.userId),
    ]);

    const { languageDirection, seedText } = resolveSeed(message.finalText);
    const llm = await createLLMClient(session.userId);

    const result = await runToneTransform(
      {
        text: seedText,
        languageDirection,
        honorificLevel: profile.honorificLevel,
        referenceDate: new Date().toISOString().slice(0, 10),
        directness: profile.directness,
        emojiPreference: profile.emojiPreference,
      },
      llm,
    );

    return { draftText: result.transformed, source: result.source };
  },
);
