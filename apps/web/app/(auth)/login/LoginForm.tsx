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
import styles from '../auth.module.css';
import split from './login.module.css';

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
    <main className={split.splitPage}>
      <div className={split.formSide}>
        <div className={split.formInner}>
          <div className={split.brandRow} aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" focusable="false">
              <rect x="2" y="5" width="14" height="4" rx="2" fill="#191F28" />
              <rect x="8" y="10" width="14" height="4" rx="2" fill="#191F28" />
              <rect x="2" y="15" width="20" height="4" rx="2" fill="#FF6100" />
            </svg>
            <span className={split.brandName}>
              사이 <span className={split.brandCaption}>SAI</span>
            </span>
          </div>
          <h1 className={styles.title}>다시 만나서 반가워요</h1>
          <p className={split.subtitle}>이메일로 로그인하고 중재를 이어서 진행하세요.</p>

          {errorKind === 'invalid-credentials' && (
            <p role="alert" className={styles.banner}>
              이메일 또는 비밀번호가 올바르지 않습니다
            </p>
          )}
          {errorKind === 'network' && (
            <div role="alert" className={styles.banner}>
              <p>처리 중 오류가 발생했습니다</p>
              <button type="button" className={styles.retryButton} onClick={() => void submit()}>
                다시 시도
              </button>
            </div>
          )}
          {status === 'success' && (
            <p role="status" className={styles.statusText}>
              로그인되었습니다
            </p>
          )}
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.field}>
              <label htmlFor="login-email">이메일</label>
              <input
                id="login-email"
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
            <div className={styles.field}>
              <div className={split.fieldTopRow}>
                <label htmlFor="login-password">비밀번호</label>
                {/* UX-020/AC-090 — ADR-0002 Follow-up(2026-08-12)이 "로그인 고도화" 컷 항목 중
                    비밀번호 재설정만 되돌려 실제로 구현했다(SSO는 계속 제외 — IdP 자격증명 없음). */}
                <a href="/forgot-password" className={split.forgotLink}>
                  비밀번호 찾기
                </a>
              </div>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
              />
            </div>
            <button type="submit" className={styles.submit} disabled={!canSubmit}>
              {status === 'submitting' ? '로그인 중…' : '로그인'}
            </button>
          </form>

          {/* v8.0/T84, 재확인 T86(2026-08-12) — 목업의 "회사 계정(SSO)으로 계속하기" 버튼은
              여전히 넣지 않는다. T84 당시 이유("SSO 코드 경로 부재, 장식 버튼 금지 원칙")는
              그대로 유효할 뿐 아니라, T86에서 ADR-0002를 재확인한 결과 실제 외부 ID 공급자
              (Google Workspace/Okta 등) 클라이언트 자격증명이 없어 지어낼 수 없고, PRD에도
              소셜 로그인 요구사항 자체가 없다(ADR-0002 Option 비교 "소셜 로그인은 PRD에
              없다"). `docs/UX.md` UX-020 Decision Log 참조 — 비밀번호 찾기만 실제 구현했다. */}

          <a href="/signup" className={styles.bottomLink}>
            처음이신가요? 회원가입
          </a>
        </div>
      </div>

      {/* 순수 장식용 프리뷰 패널 — 상태 없음, 로그인 로직과 무관 (MEDIATE 리디자인.dc.html 목업 원문). */}
      <div className={split.previewSide} aria-hidden="true">
        <div className={split.previewInner}>
          <p className={split.previewEyebrow}>중재 워크스페이스</p>
          <h2 className={split.previewHeading}>
            보내기 전에 한 번 더,
            <br />
            상대가 읽을 문장을 확인하세요.
          </h2>
          <p className={split.previewBody}>긴급도 판단, 문장 변환, 역번역 검토까지 한 화면에서 끝냅니다.</p>
        </div>
        <div className={split.previewCard}>
          <div className={split.previewCardLabel}>변환 미리보기</div>
          <div className={split.previewCardBefore}>이거 오늘까지 무조건 해줘</div>
          <div className={split.previewCardAfter}>
            오늘 중으로 필요한 건이라 확인 부탁드려요. 어려우시면 알려주세요.
          </div>
          <div className={split.previewTags}>
            <span className={`${split.previewTag} ${split.previewTagPositive}`}>존댓말 정렬</span>
            <span className={`${split.previewTag} ${split.previewTagNeutral}`}>긴급도 보통</span>
          </div>
        </div>
      </div>
    </main>
  );
}
