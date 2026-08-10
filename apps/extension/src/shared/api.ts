/**
 * 백엔드 호출(Bearer) — `docs/Architecture.md:121` 폴더 구조. 웹앱과 **완전히 같은 엔드포인트**를
 * 쓴다(T56 · AC-028) — 요청/응답 계약은 `docs/API.md` "POST /api/mediate"와
 * `apps/web/app/api/mediate/route.ts`의 `mediateRequestSchema`가 단일 출처다. `channel:'extension'`만
 * 다르다(그 스키마가 이미 `z.enum(['web','extension'])`을 허용한다).
 *
 * 🔴 C-1(reviewer, 2026-08-08 — 이전 판단 뒤집음) — 콘텐츠 스크립트(패널) 컨텍스트 안에서 직접
 * fetch하지 않는다. 이전 주석의 "Chrome은 페이지 CSP의 connect-src를 콘텐츠 스크립트 fetch에
 * 적용하지 않는다"는 참이지만, 실제 차단 요인은 CSP가 아니라 **CORS**다: Chrome 85부터 콘텐츠
 * 스크립트가 시작한 크로스오리진 fetch는 더 이상 `host_permissions`로 CORS가 면제되지 않고,
 * 호스트 페이지의 Origin으로 요청이 나가며 호스트 페이지 자신이 가진 접근권만 그대로 물려받는다
 * (https://www.chromium.org/Home/chromium-security/extension-content-script-fetches/,
 * 2026-08-08 확인). 이 요청은 `content-type: application/json` + `authorization` 헤더가 있는
 * non-simple 요청이라 OPTIONS 프리플라이트가 필요한데, `apps/web/app/api/mediate/route.ts`에는
 * OPTIONS 핸들러도 CORS 헤더도 없다(grep 0건) — 그러면 우리 앱이 아닌 모든 호스트 페이지에서
 * 요청이 실패한다. 그래서 실제 fetch는 서비스 워커(`background.ts`, host_permissions로 CORS
 * 면제됨)로 옮기고, 여기서는 `chrome.runtime.sendMessage`로 위임만 한다.
 *
 * 🔴 상대경로(`/api/mediate`)를 쓰지 않는다 — `background.ts`도 콘텐츠 스크립트의 host 페이지
 * origin이 아니라 확장 자신의 컨텍스트에서 실행되므로, 여전히 `VITE_APP_ORIGIN`으로 절대 URL을
 * 만들어야 한다(그 조립은 이제 `background.ts` 쪽 책임이다).
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

export const MEDIATE_REQUEST_MESSAGE_TYPE = 'cbm:mediate-request' as const;

export interface MediateRequestMessage {
  type: typeof MEDIATE_REQUEST_MESSAGE_TYPE;
  body: MediateApiRequest;
}

/**
 * T66(AC-067①) — `GET /api/pair-protocols` 호출. `callMediationApi`와 같은 이유로 콘텐츠
 * 스크립트에서 직접 fetch하지 않고 `background.ts`에 위임한다(CORS — 파일 헤더 주석 참조).
 */
export const COUNTERPARTS_REQUEST_MESSAGE_TYPE = 'cbm:counterparts-request' as const;

export interface CounterpartsRequestMessage {
  type: typeof COUNTERPARTS_REQUEST_MESSAGE_TYPE;
}

export type CounterpartsApiResult =
  | { ok: true; counterparts: string[] }
  | { ok: false; reason: 'not-logged-in' }
  | { ok: false; reason: 'request-failed'; error: MediateApiErrorEnvelope };

function isCounterpartsApiResult(value: unknown): value is CounterpartsApiResult {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { ok?: unknown };
  return candidate.ok === true || candidate.ok === false;
}

/**
 * AC-067④ — 이 호출이 실패하거나 빈 배열을 반환해도 패널은 기존 미지정 경로로 정상 동작해야
 * 한다. 실패를 예외로 던지지 않고 항상 `CounterpartsApiResult`로 돌려주는 이유는 그 요구를
 * 호출부(`MediationPanel.tsx`)가 `try/catch` 없이 분기만으로 처리하게 하기 위해서다.
 */
export async function fetchKnownCounterparts(): Promise<CounterpartsApiResult> {
  let token: string | null;
  try {
    token = await getStoredToken();
  } catch {
    return { ok: false, reason: 'not-logged-in' };
  }
  if (!token) {
    return { ok: false, reason: 'not-logged-in' };
  }

  const message: CounterpartsRequestMessage = { type: COUNTERPARTS_REQUEST_MESSAGE_TYPE };

  let response: unknown;
  try {
    response = await chrome.runtime.sendMessage(message);
  } catch {
    return {
      ok: false,
      reason: 'request-failed',
      error: genericError('확장 내부 통신 오류가 발생했습니다.'),
    };
  }

  if (!isCounterpartsApiResult(response)) {
    return {
      ok: false,
      reason: 'request-failed',
      error: genericError('확장 내부 통신 오류가 발생했습니다.'),
    };
  }

  return response;
}

function genericError(message: string): MediateApiErrorEnvelope {
  return { code: 'INTERNAL', message, retryable: true };
}

function isMediateApiResult(value: unknown): value is MediateApiResult {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { ok?: unknown };
  return candidate.ok === true || candidate.ok === false;
}

/**
 * 🔴 AC-053①②③④ — 저장된 토큰이 없으면(로그인 안 됨) background에 메시지조차 보내지 않고
 * `not-logged-in`을 반환한다. 패널은 이 값을 NotLoggedIn 상태로 렌더한다.
 *
 * 🔴 M-4(reviewer) — `getStoredToken()`이 reject해도(예: `chrome.storage.session`의 access
 * level이 아직 올라가기 전 race) 무한 로딩이 아니라 NotLoggedIn으로 빠진다 — 그 상태는 이미
 * "웹앱에서 먼저 연결해 달라"는 안내를 보여주므로 실패를 감추지 않으면서도 사용자에게 다음
 * 행동을 준다.
 */
export async function callMediationApi(body: MediateApiRequest): Promise<MediateApiResult> {
  let token: string | null;
  try {
    token = await getStoredToken();
  } catch {
    return { ok: false, reason: 'not-logged-in' };
  }
  if (!token) {
    return { ok: false, reason: 'not-logged-in' };
  }

  const message: MediateRequestMessage = { type: MEDIATE_REQUEST_MESSAGE_TYPE, body };

  let response: unknown;
  try {
    response = await chrome.runtime.sendMessage(message);
  } catch {
    return {
      ok: false,
      reason: 'request-failed',
      error: genericError('확장 내부 통신 오류가 발생했습니다.'),
    };
  }

  if (!isMediateApiResult(response)) {
    return {
      ok: false,
      reason: 'request-failed',
      error: genericError('확장 내부 통신 오류가 발생했습니다.'),
    };
  }

  return response;
}
