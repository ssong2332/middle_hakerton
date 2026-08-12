/**
 * T86 인접(2026-08-12, 사용자 지적) — UX-004 타이틀 행의 "개인화 프로필 적용 중" 상태 배지
 * (`docs/UX.md` UX-004 Visual Design Brief, 목업 원문 pill). T84/T85 두 라운드 모두 카드/토큰만
 * 옮기고 이 배지 자체를 구현하지 않았다.
 *
 * 🔴 실제로 개인화가 적용될지를 나타내는 값이어야 한다(장식용 상시 표시 금지) — `profile/page.tsx`
 * 의 "개인화 미적용" 배너 판정(`isSkippedOrEmpty`)과 대칭인 로직을 쓴다: 자기신고 스타일 필드가
 * 하나라도 있거나(단, `onboardingState==='completed'`일 때만 — `profile/page.tsx`와 같은 이유,
 * skip/not_started 사용자는 `saveOnboardingProfile`이 항상 null로 저장한다) 학습된 항목이
 * 하나라도 있으면(diff 학습은 온보딩 상태와 무관하게 항상 실행된다, `profile/page.tsx` 헤더 주석
 * M-1과 동일 근거) "적용 중"으로 본다.
 *
 * `apps/web/lib/onboarding-guard.ts`(`shouldRedirectToOnboarding`)와 같은 형태로 fail-open —
 * DB/env 오류로 이 배지 하나가 안 뜨는 것이 인증 화면 전체를 막는 것보다 대가가 작다.
 */
import { createClient } from './supabase/server';
import { fetchSenderProfile, fetchLearnedItems } from './profile/storage';

function logPersonalizationStatusError(error: unknown): void {
  const code =
    (error as { code?: unknown } | null)?.code ?? (error instanceof Error ? error.name : undefined);
  const message = (error as { message?: unknown } | null)?.message ?? String(error);
  console.error('[personalization-status] checkPersonalizationActive failed — fail-open (badge hidden)', {
    code,
    message,
  });
}

export async function checkPersonalizationActive(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const [profile, learnedItems] = await Promise.all([
      fetchSenderProfile(supabase, user.id),
      fetchLearnedItems(supabase, user.id),
    ]);

    const hasSelfReport =
      profile.onboardingState === 'completed' &&
      (profile.directness !== null ||
        profile.emojiPreference !== null ||
        profile.formality !== null ||
        profile.honorificLevel !== null);

    return hasSelfReport || learnedItems.length > 0;
  } catch (error) {
    logPersonalizationStatusError(error);
    return false;
  }
}
