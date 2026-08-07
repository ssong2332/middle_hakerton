'use client';

/**
 * UX-002 Sign Up — `docs/UX.md` Screen Catalog "Sign Up Screen (Screen ID: UX-002)".
 * AC-039, AC-060.
 *
 * ADR-0002: 커스텀 `/api/signup` 라우트를 두지 않는다 — 브라우저에서 `@supabase/supabase-js`의
 * `signUp()`을 직접 호출한다. 비밀번호는 `lib/validate-password.ts`의 앱 레벨 최소 8자 검증만
 * 거친다 — 그 이상의 복잡도 규칙은 절대 추가하지 않는다(AC-060③).
 */
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/browser';
import { isValidEmailFormat } from '../../../lib/validate-email';
import { passwordLengthError } from '../../../lib/validate-password';
import styles from '../auth.module.css';

const ONBOARDING_ROUTE = '/onboarding';
const PASSWORD_MISMATCH_MESSAGE = '비밀번호가 일치하지 않습니다';
/**
 * 🔴 Major 4(reviewer 5차 REJECTED → 수정) — `docs/UX.md:357` States: "Success: brief
 * confirmation, then redirect." UX.md는 정확한 타이밍을 정하지 않는다 — `LoginForm.tsx`와
 * 같은 값을 써서 두 화면의 체감을 맞춘다.
 */
const SUCCESS_REDIRECT_DELAY_MS = 300;

type Status = 'idle' | 'submitting' | 'success';
type BannerKind = 'duplicate-email' | 'weak-password' | 'network' | null;
/**
 * 🔴 Major 3(QA 6차 NO-GO → 수정) — Supabase가 자체 정책으로 비밀번호를 거부할 때 쓰는 코드.
 * `node_modules/@supabase/auth-js/src/lib/error-codes.ts:70`에서 확인(`'weak_password'`).
 * `docs/CodingRules.md:93` "클라이언트는 error.message 문자열이 아니라 error.code로 분기한다".
 */
const WEAK_PASSWORD_MESSAGE = '이 비밀번호는 사용할 수 없습니다. 다른 비밀번호를 입력해 주세요.';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [banner, setBanner] = useState<BannerKind>(null);
  // Major 4① — 비밀번호 show/hide 토글, 필드별 독립(`docs/UX.md:361`).
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const emailFormatValid = isValidEmailFormat(email);
  const passwordError = password === '' ? null : passwordLengthError(password);
  const confirmError =
    confirmPassword !== '' && confirmPassword !== password ? PASSWORD_MISMATCH_MESSAGE : null;
  const canSubmit =
    email !== '' &&
    emailFormatValid &&
    password !== '' &&
    passwordError === null &&
    confirmPassword !== '' &&
    confirmError === null &&
    status === 'idle';

  async function submit() {
    setStatus('submitting');
    setBanner(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        // Supabase auth-js error codes: 'user_already_exists' | 'email_exists' → 중복 가입.
        // 'weak_password' → 대시보드 자체 정책에 의한 거부(Major 3, 전용 사유 문구). 그 외는
        // 네트워크/서버 오류 배너로 처리한다.
        if (error.code === 'user_already_exists' || error.code === 'email_exists') {
          setBanner('duplicate-email');
        } else if (error.code === 'weak_password') {
          // Major 3 — 사유가 비밀번호 자체에 있으므로, network 배너와 동일하게 비밀번호 필드
          // 2개를 초기화해 재입력을 유도한다.
          setBanner('weak-password');
          setPassword('');
          setConfirmPassword('');
        } else {
          // Major 4② — 네트워크/서버 오류: 이메일은 유지, 비밀번호 필드 2개는 보안상 초기화한다
          // (`docs/UX.md:360`).
          setBanner('network');
          setPassword('');
          setConfirmPassword('');
        }
        setStatus('idle');
        return;
      }
      // Major 4 — 곧장 이동하지 않고 "성공" 상태를 먼저 렌더한 뒤, 짧은 지연 후 이동한다.
      setStatus('success');
      window.setTimeout(() => router.push(ONBOARDING_ROUTE), SUCCESS_REDIRECT_DELAY_MS);
    } catch {
      // Major 4② — catch 경로(fetch 자체 실패 등)도 동일하게 비밀번호 필드를 초기화한다.
      setBanner('network');
      setPassword('');
      setConfirmPassword('');
      setStatus('idle');
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    void submit();
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>회원가입</h1>
      {banner === 'duplicate-email' && (
        <p role="alert" className={styles.banner}>
          이미 가입된 이메일입니다 <a href="/login">로그인</a>
        </p>
      )}
      {banner === 'weak-password' && (
        <p role="alert" className={styles.banner}>
          {WEAK_PASSWORD_MESSAGE}
        </p>
      )}
      {banner === 'network' && (
        <div role="alert" className={styles.banner}>
          <p>처리 중 오류가 발생했습니다</p>
          <button type="button" className={styles.retryButton} onClick={() => void submit()}>
            다시 시도
          </button>
        </div>
      )}
      {status === 'success' && (
        <p role="status" className={styles.statusText}>
          회원가입되었습니다
        </p>
      )}
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="signup-email">이메일</label>
          <input
            id="signup-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onBlur={() => setEmailTouched(true)}
          />
          {emailTouched && email !== '' && !emailFormatValid && (
            <p className={styles.fieldError}>이메일 형식이 올바르지 않습니다</p>
          )}
        </div>
        <div className={styles.field}>
          <label htmlFor="signup-password">비밀번호</label>
          <div className={styles.fieldRow}>
            <input
              id="signup-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              type="button"
              className={styles.toggleButton}
              aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? '숨기기' : '보기'}
            </button>
          </div>
          {/* AC-060③ — 이 문구 이상의 복잡도 안내(대문자·특수문자 등)를 추가하지 않는다. */}
          <p className={styles.hint}>최소 8자</p>
          {passwordError && <p className={styles.fieldError}>{passwordError}</p>}
        </div>
        <div className={styles.field}>
          <label htmlFor="signup-confirm-password">비밀번호 확인</label>
          <div className={styles.fieldRow}>
            <input
              id="signup-confirm-password"
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
            <button
              type="button"
              className={styles.toggleButton}
              aria-label={showConfirmPassword ? '비밀번호 확인 숨기기' : '비밀번호 확인 보기'}
              onClick={() => setShowConfirmPassword((value) => !value)}
            >
              {showConfirmPassword ? '숨기기' : '보기'}
            </button>
          </div>
          {confirmError && <p className={styles.fieldError}>{confirmError}</p>}
        </div>
        <button type="submit" className={styles.submit} disabled={!canSubmit}>
          {status === 'submitting' ? '가입 중…' : '회원가입'}
        </button>
      </form>
      <a href="/login" className={styles.bottomLink}>
        로그인
      </a>
    </main>
  );
}
