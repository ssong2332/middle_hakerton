'use client';

/**
 * UX-003 Onboarding Profile Questionnaire — `docs/UX.md` Screen Catalog "Onboarding Profile
 * Questionnaire (Screen ID: UX-003)". AC-011, AC-046②, AC-059.
 *
 * 4문항(직설/완곡·이모지 선호·격식도·존댓말 레벨) — PRD v2.2가 추가한 존댓말 레벨까지
 * 합쳐도 5문항 상한을 넘지 않으므로 기존 문항을 합치지 않았다(`docs/Tasks.md` T19).
 *
 * **완료(complete) 아니면 전부 스킵(skip) — 문항별 부분 스킵은 없다**(`docs/UX.md` UX-003
 * Validation "there is no partial-answer submission"). 완료 경로는 4문항이 전부 응답될 때까지
 * "완료" 버튼이 비활성 상태다. "건너뛰기"는 응답 여부와 무관하게 항상 눌를 수 있다.
 *
 * 저장은 `PUT /api/profile`(`docs/API.md`) 한 번으로 완료·스킵 모두 처리한다 — 스타일 필드를
 * 지어내지 않는다는 원칙(AC-059②)은 서버(`saveOnboardingProfile`)가 마지막으로 강제하지만,
 * 이 화면도 스킵 요청에는 애초에 스타일 필드를 body에 담지 않는다.
 */
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import styles from './onboarding.module.css';

const MEDIATE_ROUTE = '/mediate';
/**
 * 🔴 `apps/web/app/(auth)/signup/page.tsx`·`LoginForm.tsx`와 같은 값 — "Success: brief
 * confirmation, then redirect" 체감을 이 화면도 맞춘다(`docs/UX.md` UX-003 States).
 */
const SUCCESS_REDIRECT_DELAY_MS = 300;
const SAVE_FAILED_MESSAGE = '저장하지 못했습니다, 다시 시도해주세요';

type Directness = 'direct' | 'indirect';
type EmojiPreference = 'likes' | 'neutral' | 'avoids';
type Formality = 'high' | 'medium' | 'low';
type HonorificLevel = 'hapsyo' | 'haeyo';

type Status = 'idle' | 'submitting' | 'success';
type LastAction = 'complete' | 'skip' | null;

interface CompleteBody {
  onboardingState: 'completed';
  directness: Directness;
  emojiPreference: EmojiPreference;
  formality: Formality;
  honorificLevel: HonorificLevel;
}

interface SkipBody {
  onboardingState: 'skipped';
}

export default function OnboardingPage() {
  const router = useRouter();
  const [directness, setDirectness] = useState<Directness | null>(null);
  const [emojiPreference, setEmojiPreference] = useState<EmojiPreference | null>(null);
  const [formality, setFormality] = useState<Formality | null>(null);
  const [honorificLevel, setHonorificLevel] = useState<HonorificLevel | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [showErrorBanner, setShowErrorBanner] = useState(false);
  const [lastAction, setLastAction] = useState<LastAction>(null);

  const allAnswered =
    directness !== null &&
    emojiPreference !== null &&
    formality !== null &&
    honorificLevel !== null;
  const canSubmit = allAnswered && status === 'idle';
  const canSkip = status === 'idle';

  async function save(body: CompleteBody | SkipBody, action: 'complete' | 'skip') {
    setStatus('submitting');
    setShowErrorBanner(false);
    setLastAction(action);
    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setShowErrorBanner(true);
        setStatus('idle');
        return;
      }
      setStatus('success');
      window.setTimeout(() => router.push(MEDIATE_ROUTE), SUCCESS_REDIRECT_DELAY_MS);
    } catch {
      setShowErrorBanner(true);
      setStatus('idle');
    }
  }

  function completeBody(): CompleteBody | null {
    if (!directness || !emojiPreference || !formality || !honorificLevel) return null;
    return { onboardingState: 'completed', directness, emojiPreference, formality, honorificLevel };
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    const body = completeBody();
    if (!body) return;
    void save(body, 'complete');
  }

  function handleSkip() {
    if (!canSkip) return;
    void save({ onboardingState: 'skipped' }, 'skip');
  }

  // 저장 실패(complete/skip 어느 경로든) 후 재시도 — 응답값·스킵 선택 모두 유지된다
  // (`docs/UX.md` UX-003 Failure: "the skip choice is retained so the user doesn't have to
  // re-click Skip").
  function handleRetry() {
    if (lastAction === 'skip') {
      void save({ onboardingState: 'skipped' }, 'skip');
      return;
    }
    if (lastAction === 'complete') {
      const body = completeBody();
      if (body) void save(body, 'complete');
    }
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>UX-003 온보딩 설문</h1>
      <p className={styles.lead}>
        평소 커뮤니케이션 스타일을 알려주시면 변환에 반영합니다. 지금 건너뛰어도 나중에 프로필에서
        다시 채울 수 있습니다.
      </p>
      {showErrorBanner && (
        <div role="alert" className={styles.banner}>
          <p>{SAVE_FAILED_MESSAGE}</p>
          <button type="button" className={styles.retryButton} onClick={handleRetry}>
            다시 시도
          </button>
        </div>
      )}
      {status === 'success' && (
        <p role="status" className={styles.statusText}>
          저장되었습니다
        </p>
      )}
      <form onSubmit={handleSubmit} className={styles.form}>
        <fieldset className={styles.fieldset}>
          <legend>메시지를 표현할 때 어느 쪽에 가깝나요?</legend>
          <label>
            <input
              type="radio"
              name="directness"
              checked={directness === 'direct'}
              onChange={() => setDirectness('direct')}
            />
            직설적으로 표현하는 편이에요
          </label>
          <label>
            <input
              type="radio"
              name="directness"
              checked={directness === 'indirect'}
              onChange={() => setDirectness('indirect')}
            />
            완곡하게 표현하는 편이에요
          </label>
          {directness === null && <p className={styles.unanswered}>선택해주세요</p>}
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend>이모지를 메시지에 사용하는 편인가요?</legend>
          <label>
            <input
              type="radio"
              name="emojiPreference"
              checked={emojiPreference === 'likes'}
              onChange={() => setEmojiPreference('likes')}
            />
            자주 써요
          </label>
          <label>
            <input
              type="radio"
              name="emojiPreference"
              checked={emojiPreference === 'neutral'}
              onChange={() => setEmojiPreference('neutral')}
            />
            가끔 써요
          </label>
          <label>
            <input
              type="radio"
              name="emojiPreference"
              checked={emojiPreference === 'avoids'}
              onChange={() => setEmojiPreference('avoids')}
            />
            거의 안 써요
          </label>
          {emojiPreference === null && <p className={styles.unanswered}>선택해주세요</p>}
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend>평소 메시지의 격식 수준은?</legend>
          <label>
            <input
              type="radio"
              name="formality"
              checked={formality === 'high'}
              onChange={() => setFormality('high')}
            />
            격식 있게
          </label>
          <label>
            <input
              type="radio"
              name="formality"
              checked={formality === 'medium'}
              onChange={() => setFormality('medium')}
            />
            보통
          </label>
          <label>
            <input
              type="radio"
              name="formality"
              checked={formality === 'low'}
              onChange={() => setFormality('low')}
            />
            편하게
          </label>
          {formality === null && <p className={styles.unanswered}>선택해주세요</p>}
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend>한국어로 쓸 때 기본 종결어미는? (EN→KO 변환 기본값)</legend>
          <label>
            <input
              type="radio"
              name="honorificLevel"
              checked={honorificLevel === 'hapsyo'}
              onChange={() => setHonorificLevel('hapsyo')}
            />
            합쇼체 (합니다/입니다)
          </label>
          <label>
            <input
              type="radio"
              name="honorificLevel"
              checked={honorificLevel === 'haeyo'}
              onChange={() => setHonorificLevel('haeyo')}
            />
            해요체 (해요/이에요)
          </label>
          {honorificLevel === null && <p className={styles.unanswered}>선택해주세요</p>}
        </fieldset>

        <div className={styles.actions}>
          <button type="submit" className={styles.submit} disabled={!canSubmit}>
            {status === 'submitting' && lastAction === 'complete' ? '저장 중…' : '완료'}
          </button>
          <button
            type="button"
            className={styles.skipButton}
            onClick={handleSkip}
            disabled={!canSkip}
          >
            {status === 'submitting' && lastAction === 'skip' ? '건너뛰는 중…' : '건너뛰기'}
          </button>
        </div>
      </form>
    </main>
  );
}
