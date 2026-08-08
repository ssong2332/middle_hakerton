/**
 * 백엔드 호출(Bearer) — `docs/Architecture.md:121` 폴더 구조. 웹앱과 **완전히 같은 엔드포인트**를
 * 쓴다(T56 · AC-028) — 요청/응답 계약은 `docs/API.md` "POST /api/mediate"와
 * `apps/web/app/api/mediate/route.ts`의 `mediateRequestSchema`가 단일 출처다. `channel:'extension'`만
 * 다르다(그 스키마가 이미 `z.enum(['web','extension'])`을 허용한다).
 *
 * 🔴 콘텐츠 스크립트(패널) 컨텍스트 안에서 직접 fetch한다 — 백그라운드로 프록시하지 않는다.
 * 근거는 `background.ts` 헤더 주석 "판단 1" 참조(Chrome은 페이지 CSP의 connect-src를 콘텐츠
 * 스크립트 fetch에 적용하지 않는다, 2026-08 WebSearch로 확인).
 *
 * 🔴 상대경로(`/api/mediate`)를 쓰지 않는다 — 콘텐츠 스크립트는 host 페이지의 origin에서
 * 실행되므로 상대경로는 우리 앱이 아니라 그 host 페이지를 가리키게 된다. `VITE_APP_ORIGIN`
 * (`.env.example` 참조)으로 절대 URL을 만든다.
 */
import type { MediationResult } from '@cross-border/core';
import { getStoredToken } from './token-storage';

export interface MediateApiRequest {
  text: string;
  recipient?: string | null;
  context: {
    languageDirection: 'ko-en' | 'en-ko';
    channel: 'extension';
    urgencyOverride?: 'CRITICAL' | 'NORMAL' | 'LOW' | null;
    needDeadline?: string | null;
  };
}

export interface MediateApiErrorEnvelope {
  code: string;
  message: string;
  retryable: boolean;
}

export type MediateApiResult =
  | { ok: true; data: MediationResult }
  | { ok: false; reason: 'not-logged-in' }
  | { ok: false; reason: 'request-failed'; error: MediateApiErrorEnvelope };

function genericError(message: string): MediateApiErrorEnvelope {
  return { code: 'INTERNAL', message, retryable: true };
}

/**
 * 🔴 AC-053①②③④ — 저장된 토큰이 없으면(로그인 안 됨) fetch를 아예 시도하지 않고
 * `not-logged-in`을 반환한다. 패널은 이 값을 NotLoggedIn 상태로 렌더한다.
 */
export async function callMediationApi(body: MediateApiRequest): Promise<MediateApiResult> {
  const token = await getStoredToken();
  if (!token) {
    return { ok: false, reason: 'not-logged-in' };
  }

  // 매 호출마다 읽는다(모듈 최상단에서 한 번만 읽으면 테스트가 `vi.stubEnv`로 값을 바꿀 수 없다).
  const APP_ORIGIN = (import.meta.env.VITE_APP_ORIGIN as string | undefined) ?? '';
  if (!APP_ORIGIN) {
    return {
      ok: false,
      reason: 'request-failed',
      error: genericError('확장 설정 오류: VITE_APP_ORIGIN이 설정되지 않았습니다.'),
    };
  }

  let response: Response;
  try {
    response = await fetch(`${APP_ORIGIN}/api/mediate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    return {
      ok: false,
      reason: 'request-failed',
      error: genericError('네트워크 오류가 발생했습니다.'),
    };
  }

  if (!response.ok) {
    const parsed = (await response.json().catch(() => null)) as {
      error?: MediateApiErrorEnvelope;
    } | null;
    return {
      ok: false,
      reason: 'request-failed',
      error: parsed?.error ?? genericError('처리에 실패했습니다.'),
    };
  }

  const data = (await response.json()) as MediationResult;
  return { ok: true, data };
}
