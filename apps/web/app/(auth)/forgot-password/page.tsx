'use client';

/**
 * UX-020 (ForgotPassword half) — `docs/UX.md` Screen Catalog "Forgot / Reset Password
 * (Screen ID: UX-020)". AC-090.
 *
 * ADR-0002 Follow-up (2026-08-12): password reset is un-cut from Planning Decision
 * #42/#62's "로그인 고도화" cut item, SSO stays cut. This screen calls Supabase Auth's
 * built-in `resetPasswordForEmail()` directly (no custom API route), same pattern as
 * `LoginForm.tsx`/`signup/page.tsx`.
 *
 * 🔴 AC-090② — never reveals whether the submitted email is actually registered. Supabase's
 * own `resetPasswordForEmail()` already avoids leaking that (it does not error for an unknown
 * email), so the success branch is shown for any resolved response — only a thrown exception
 * (transport failure) gets the distinct network-error banner, matching `LoginForm.tsx`'s
 * idle/submitting/success + catch-network split.
 */
import { useState, type FormEvent } from 'react';
import { createClient } from '../../../lib/supabase/browser';
import { isValidEmailFormat } from '../../../lib/validate-email';
import styles from '../auth.module.css';

type Status = 'idle' | 'submitting' | 'sent' | 'networkError';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [status, setStatus] = useState<Status>('idle');

  const emailFormatValid = isValidEmailFormat(email);
  const canSubmit = email !== '' && emailFormatValid && status === 'idle';

  async function submit() {
    setStatus('submitting');
    try {
      const supabase = createClient();
      // AC-090② — the response's `error` field (if any) is intentionally not branched on:
      // Supabase does not report "email not found" as an error, and branching on other error
      // codes here would risk leaking which ones mean "account exists" by omission.
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setStatus('sent');
    } catch {
      setStatus('networkError');
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    void submit();
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>비밀번호 찾기</h1>
      {status === 'sent' ? (
        <p role="status" className={styles.statusText}>
          등록된 이메일이면 비밀번호 재설정 링크를 보냈습니다. 메일함을 확인해 주세요.
        </p>
      ) : (
        <>
          <p className={styles.hint}>가입할 때 사용한 이메일을 입력하면 재설정 링크를 보내드립니다.</p>
          {status === 'networkError' && (
            <div role="alert" className={styles.banner}>
              <p>처리 중 오류가 발생했습니다</p>
              <button type="button" className={styles.retryButton} onClick={() => void submit()}>
                다시 시도
              </button>
            </div>
          )}
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.field}>
              <label htmlFor="forgot-password-email">이메일</label>
              <input
                id="forgot-password-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onBlur={() => setEmailTouched(true)}
                placeholder="name@company.com"
              />
              {emailTouched && email !== '' && !emailFormatValid && (
                <p className={styles.fieldError}>이메일 형식이 올바르지 않습니다</p>
              )}
            </div>
            <button type="submit" className={styles.submit} disabled={!canSubmit}>
              {status === 'submitting' ? '보내는 중…' : '재설정 링크 보내기'}
            </button>
          </form>
        </>
      )}
      <a href="/login" className={styles.bottomLink}>
        로그인으로 돌아가기
      </a>
    </main>
  );
}
