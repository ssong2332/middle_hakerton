'use client';

/**
 * 확장 토큰 인계 — `docs/Architecture.md` "확장 인증": "확장 패널 '로그인' → 웹앱
 * /extension/connect 탭 열기 → 그 페이지가 chrome.runtime.sendMessage로 access token 전달".
 * `docs/API.md`가 이 페이지를 "예외 1개"로 명시한다(API가 아니라 페이지, `GET /extension/connect`).
 *
 * 이 페이지는 `apps/web/proxy.ts`의 보호 matcher 안에 있어 미인증이면 이미 `/login`으로 리다이렉트
 * 된다(`page.tsx` 헤더 주석 M-3 참조) — 그래도 세션이 아직 하이드레이션 중이거나 만료된 경계
 * 케이스를 위해 NotLoggedIn 상태를 방어적으로 둔다.
 */
import { useEffect, useState } from 'react';
import { createClient } from '../../../lib/supabase/browser';
import styles from './ExtensionConnect.module.css';

type Status = 'checking' | 'notLoggedIn' | 'sending' | 'connected' | 'failed';

interface ChromeRuntimeLike {
  sendMessage: (
    extensionId: string,
    message: unknown,
    callback: (response: unknown) => void,
  ) => void;
  lastError?: { message?: string };
}

function getChromeRuntime(): ChromeRuntimeLike | null {
  const chromeGlobal = (globalThis as { chrome?: { runtime?: ChromeRuntimeLike } }).chrome;
  return chromeGlobal?.runtime ?? null;
}

function isOkResponse(response: unknown): boolean {
  return (
    typeof response === 'object' && response !== null && (response as { ok?: unknown }).ok === true
  );
}

export function ExtensionConnect() {
  const [status, setStatus] = useState<Status>('checking');
  const [failureReason, setFailureReason] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? null;
      if (!token) {
        if (!cancelled) setStatus('notLoggedIn');
        return;
      }

      // 🔴 모듈 최상단이 아니라 함수 안에서 읽는다 — 테스트가 `process.env`를 케이스마다
      // 바꿀 수 있어야 하고(모듈은 파일당 1회만 평가된다), 배포본에서도 Next.js가 빌드 시점에
      // `NEXT_PUBLIC_` 값을 인라인하므로 런타임 동작은 동일하다.
      const extensionId = process.env.NEXT_PUBLIC_EXTENSION_ID;
      if (!extensionId) {
        if (!cancelled) {
          setFailureReason('NEXT_PUBLIC_EXTENSION_ID가 설정되지 않았습니다.');
          setStatus('failed');
        }
        return;
      }

      const runtime = getChromeRuntime();
      if (!runtime) {
        if (!cancelled) {
          setFailureReason('Chrome 확장을 찾을 수 없습니다. 확장이 설치되어 있는지 확인해 주세요.');
          setStatus('failed');
        }
        return;
      }

      if (!cancelled) setStatus('sending');
      runtime.sendMessage(extensionId, { type: 'cbm:set-token', token }, (response) => {
        if (cancelled) return;
        if (!runtime.lastError && isOkResponse(response)) {
          setStatus('connected');
        } else {
          setFailureReason(runtime.lastError?.message ?? '확장과 연결하지 못했습니다.');
          setStatus('failed');
        }
      });
    }

    void connect();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>확장 연결</h1>
      {status === 'checking' && <p role="status" className={styles.statusText}>확인 중…</p>}
      {status === 'notLoggedIn' && (
        <p role="alert" className={styles.alertText}>
          로그인이 필요합니다. 먼저 로그인해 주세요.
        </p>
      )}
      {status === 'sending' && (
        <p role="status" className={styles.statusText}>
          확장에 연결하는 중…
        </p>
      )}
      {status === 'connected' && (
        <p role="status" className={styles.statusText}>
          확장이 연결되었습니다. 이 탭을 닫고 확장을 사용해 주세요.
        </p>
      )}
      {status === 'failed' && (
        <p role="alert" className={styles.alertText}>
          연결 실패{failureReason ? `: ${failureReason}` : ''}
        </p>
      )}
    </main>
  );
}
