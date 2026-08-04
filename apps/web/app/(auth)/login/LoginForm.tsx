'use client';

/**
 * UX-001 Login 폼 — `docs/UX.md` Screen Catalog "Login Screen (Screen ID: UX-001)". AC-039.
 *
 * ADR-0002: 커스텀 `/api/login` 라우트를 두지 않는다 — 브라우저에서 `@supabase/supabase-js`의
 * `signInWithPassword()`를 직접 호출한다. 세션 쿠키는 `@supabase/ssr`이 관리한다.
 *
 * 🔴 `page.tsx`가 아니라 이 파일이 실제 폼이다 — `useSearchParams()`를 쓰는 컴포넌트는 Suspense
 * 경계 밖에서 정적 프리렌더링될 수 없다(Next.js 빌드 에러
 * "useSearchParams() should be wrapped in a suspense boundary", measured: `npm run build`
 * 실행 결과). `page.tsx`가 이 컴포넌트를 `<Suspense>`로 감싼다.
 */
import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '../../../lib/supabase/browser';
import { isValidEmailFormat } from '../../../lib/validate-email';

const DEFAULT_REDIRECT = '/mediate';

/**
 * 🔴 Major 4(reviewer 5차 REJECTED → 수정) — `docs/UX.md:327` States: "Success: brief
 * confirmation, then redirect." UX.md는 정확한 타이밍을 정하지 않는다 — 사람이 확인 문구를
 * 인지할 수 있을 만큼(순간적인 깜빡임이 아니게)이되, 체감이 느려지지 않을 만큼 짧게 잡는다.
 */
const SUCCESS_REDIRECT_DELAY_MS = 300;

type Status = 'idle' | 'submitting' | 'success';
type ErrorKind = 'invalid-credentials' | 'network' | null;

/**
 * 🔴 Critical 1(CWE-601 오픈 리다이렉트) — `searchParams.get('from')`을 검증 없이 `router.push()`에
 * 쓰면 `https://evil.com`·`//evil.com` 같은 절대/프로토콜-상대 URL로 로그인 직후 이탈시킬 수 있다.
 * 같은 오리진의 상대 경로("/"로 시작)만 허용하고, "//" 또는 "/\"로 시작하면(브라우저가 프로토콜-
 * 상대 URL로 해석해 외부 호스트로 이동시키는 경로) 거부한다. 그 외는 전부 `DEFAULT_REDIRECT`로
 * 폴백한다.
 */
function sanitizeRedirectTarget(rawTarget: string | null): string {
  if (!rawTarget) return DEFAULT_REDIRECT;
  if (!rawTarget.startsWith('/')) return DEFAULT_REDIRECT;
  if (rawTarget.startsWith('//') || rawTarget.startsWith('/\\')) return DEFAULT_REDIRECT;
  return rawTarget;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [errorKind, setErrorKind] = useState<ErrorKind>(null);
  // 🔴 Major 2(reviewer 5차 REJECTED → 수정) — show/hide 토글은 UX-002(가입, `docs/UX.md:361`)
  // 에만 명시돼 있고 UX-001(로그인) Accessibility(`docs/UX.md:330` — Tab order: email→password→
  // submit→sign-up link)에는 없다. 여기 있으면 UX.md가 정한 Tab 순서가 어긋난다 — 제거했다.

  const emailFormatValid = isValidEmailFormat(email);
  const canSubmit = email !== '' && password !== '' && emailFormatValid && status === 'idle';

  async function submit() {
    setStatus('submitting');
    setErrorKind(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        // `docs/API.md` Error codes: AUTH_INVALID_CREDENTIALS → UX-001 고정 배너 문구.
        setErrorKind('invalid-credentials');
        setStatus('idle');
        return;
      }
      // Major 4 — 곧장 이동하지 않고 "성공" 상태를 먼저 렌더한 뒤, 짧은 지연 후 이동한다.
      setStatus('success');
      const target = sanitizeRedirectTarget(searchParams.get('from'));
      window.setTimeout(() => router.push(target), SUCCESS_REDIRECT_DELAY_MS);
    } catch {
      // 네트워크/서버 오류 — UX-001 Failure: "다시 시도" 버튼 + 입력값 유지.
      setErrorKind('network');
      setStatus('idle');
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    void submit();
  }

  return (
    <main>
      <h1>UX-001 로그인</h1>
      {errorKind === 'invalid-credentials' && (
        <p role="alert">이메일 또는 비밀번호가 올바르지 않습니다</p>
      )}
      {errorKind === 'network' && (
        <div role="alert">
          <p>처리 중 오류가 발생했습니다</p>
          <button type="button" onClick={() => void submit()}>
            다시 시도
          </button>
        </div>
      )}
      {status === 'success' && <p role="status">로그인되었습니다</p>}
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="login-email">이메일</label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onBlur={() => setEmailTouched(true)}
          />
          {emailTouched && email !== '' && !emailFormatValid && (
            <p>이메일 형식이 올바르지 않습니다</p>
          )}
        </div>
        <div>
          <label htmlFor="login-password">비밀번호</label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <button type="submit" disabled={!canSubmit}>
          {status === 'submitting' ? '로그인 중…' : '로그인'}
        </button>
      </form>
      <a href="/signup">회원가입</a>
    </main>
  );
}
