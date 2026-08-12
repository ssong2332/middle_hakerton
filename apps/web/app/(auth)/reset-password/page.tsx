'use client';

/**
 * UX-020 (ResetPassword half) — `docs/UX.md` Screen Catalog "Forgot / Reset Password
 * (Screen ID: UX-020)". AC-090.
 *
 * Reached only via the link Supabase emails from `resetPasswordForEmail()`'s `redirectTo`
 * (`forgot-password/page.tsx`) — `@supabase/ssr`'s browser client parses the recovery token
 * from the URL automatically (`createClient()`, `apps/web/lib/supabase/browser.ts`) and fires
 * `onAuthStateChange('PASSWORD_RECOVERY', ...)`. `getSession()` is checked first (in case the
 * URL was already parsed before this component mounted) and `onAuthStateChange` is subscribed
 * for the case where parsing finishes after mount — same `getSession()` pattern as
 * `ExtensionConnect.tsx`.
 *
 * 🔴 AC-090④ — direct navigation without a live recovery session renders an explicit error +
 * a link back to `/forgot-password`, never a blank/dead form (absent-not-disabled, same
 * principle as `docs/UX.md` AC-053②/AC-084⑥).
 */
import { useEffect, useState, type FormEvent } from 'react';
import { createClient } from '../../../lib/supabase/browser';
import { passwordLengthError } from '../../../lib/validate-password';
import styles from '../auth.module.css';

type SessionCheck = 'checking' | 'ready' | 'invalid';
type SubmitStatus = 'idle' | 'submitting' | 'success' | 'error';

const MISMATCH_MESSAGE = '비밀번호가 일치하지 않습니다';

export default function ResetPasswordPage() {
  const [sessionCheck, setSessionCheck] = useState<SessionCheck>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<SubmitStatus>('idle');

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSessionCheck((current) => (data.session ? 'ready' : current === 'checking' ? 'invalid' : current));
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY' || session) setSessionCheck('ready');
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const passwordError = password === '' ? null : passwordLengthError(password);
  const confirmError =
    confirmPassword !== '' && confirmPassword !== password ? MISMATCH_MESSAGE : null;
  const canSubmit =
    password !== '' &&
    passwordError === null &&
    confirmPassword !== '' &&
    confirmError === null &&
    status !== 'submitting';

  async function submit() {
    setStatus('submitting');
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setStatus('error');
        return;
      }
      setStatus('success');
    } catch {
      setStatus('error');
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    void submit();
  }

  if (sessionCheck === 'checking') {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>비밀번호 재설정</h1>
        <p role="status" className={styles.statusText}>
          확인 중…
        </p>
      </main>
    );
  }

  if (sessionCheck === 'invalid') {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>비밀번호 재설정</h1>
        <p role="alert" className={styles.banner}>
          링크가 만료되었거나 올바르지 않습니다.
        </p>
        <a href="/forgot-password" className={styles.bottomLink}>
          비밀번호 찾기로 돌아가기
        </a>
      </main>
    );
  }

  if (status === 'success') {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>비밀번호 재설정</h1>
        <p role="status" className={styles.statusText}>
          비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.
        </p>
        <a href="/login" className={styles.bottomLink}>
          로그인으로 이동
        </a>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>비밀번호 재설정</h1>
      {status === 'error' && (
        <div role="alert" className={styles.banner}>
          <p>처리 중 오류가 발생했습니다</p>
          <button type="button" className={styles.retryButton} onClick={() => void submit()}>
            다시 시도
          </button>
        </div>
      )}
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="reset-password-new">새 비밀번호</label>
          <input
            id="reset-password-new"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className={styles.hint}>최소 8자</p>
          {passwordError && <p className={styles.fieldError}>{passwordError}</p>}
        </div>
        <div className={styles.field}>
          <label htmlFor="reset-password-confirm">새 비밀번호 확인</label>
          <input
            id="reset-password-confirm"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
          {confirmError && <p className={styles.fieldError}>{confirmError}</p>}
        </div>
        <button type="submit" className={styles.submit} disabled={!canSubmit}>
          {status === 'submitting' ? '변경하는 중…' : '비밀번호 변경'}
        </button>
      </form>
    </main>
  );
}
