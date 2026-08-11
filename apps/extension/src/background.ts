/**
 * 백그라운드 서비스 워커 — `docs/Architecture.md` "확장 인증" 절.
 *
 * 🔴 역할을 정확히 3가지로 좁힌다(T56 review round 2, C-1 반영):
 * ① `chrome.storage.session`의 access level을 콘텐츠 스크립트에도 연다 — 기본값은 확장
 *    페이지(백그라운드 등) 전용이라, 이걸 하지 않으면 패널(콘텐츠 스크립트, `layer1/panel-mount.tsx`
 *    가 붙이는 shadow DOM 안의 React 트리)이 저장된 토큰을 전혀 읽을 수 없다(`shared/token-storage.ts`
 *    헤더 주석 참조).
 * ② 웹앱의 `/extension/connect` 페이지가 `chrome.runtime.sendMessage(EXTENSION_ID, ...)`로 보내는
 *    access token을 받아 저장한다(`onMessageExternal` — 외부 웹사이트발 메시지). `manifest.json`의
 *    `externally_connectable.matches`가 우리 앱 origin 1개로 제한되어 있어(빌드 시 `vite.config.ts`가
 *    `VITE_APP_ORIGIN`으로 채운다), 다른 사이트는 이 리스너에 메시지를 보낼 수 없다.
 * ③ (C-1, 2026-08-08 reviewer — 이전 판단 뒤집음) 콘텐츠 스크립트/패널이 내부 `chrome.runtime.
 *    sendMessage`(`onMessage` — 확장 내부 메시지, `onMessageExternal`과 다르다)로 보낸 중재 요청을
 *    실제로 fetch한다. 이전 주석은 "콘텐츠 스크립트가 직접 fetch해도 된다"고 판단했으나, Chrome
 *    85부터 콘텐츠 스크립트가 시작한 크로스오리진 fetch는 `host_permissions`로 CORS가 면제되지
 *    않는다(호스트 페이지의 Origin으로 나가고, 호스트 페이지 자신의 권한만 물려받는다) —
 *    https://www.chromium.org/Home/chromium-security/extension-content-script-fetches/
 *    (2026-08-08 확인, `shared/api.ts` 헤더 주석 참조). 서비스 워커는 이 제약에서 면제되므로
 *    (`host_permissions`가 빌드 시 `VITE_APP_ORIGIN`으로 채워진다) 실제 fetch를 여기로 옮긴다.
 */
import { clearStoredToken, getStoredToken, setStoredToken } from './shared/token-storage';
import {
  COUNTERPARTS_REQUEST_MESSAGE_TYPE,
  MEDIATE_REQUEST_MESSAGE_TYPE,
  SAMPLE_ADD_REQUEST_MESSAGE_TYPE,
  type AddSampleApiResult,
  type AddSampleRequest,
  type CounterpartsApiResult,
  type MediateApiErrorEnvelope,
  type MediateApiRequest,
  type MediateApiResult,
  type MediateRequestMessage,
  type SampleAddRequestMessage,
  type StoredSampleSummary,
} from './shared/api';
import type { MediationResult } from '@cross-border/core';

chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });
});

interface ConnectTokenMessage {
  type: 'cbm:set-token';
  token: string;
}

function isConnectTokenMessage(message: unknown): message is ConnectTokenMessage {
  if (typeof message !== 'object' || message === null) return false;
  const candidate = message as { type?: unknown; token?: unknown };
  return candidate.type === 'cbm:set-token' && typeof candidate.token === 'string' && candidate.token.length > 0;
}

chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (!isConnectTokenMessage(message)) {
    sendResponse({ ok: false, error: 'invalid message' });
    return false;
  }
  setStoredToken(message.token)
    .then(() => sendResponse({ ok: true }))
    .catch((error: unknown) => {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    });
  return true; // sendResponse는 비동기로 호출된다 — 리스너가 살아있게 true를 반환한다.
});

function isMediateRequestMessage(message: unknown): message is MediateRequestMessage {
  if (typeof message !== 'object' || message === null) return false;
  const candidate = message as { type?: unknown; body?: unknown };
  return candidate.type === MEDIATE_REQUEST_MESSAGE_TYPE && typeof candidate.body === 'object';
}

function genericError(message: string): MediateApiErrorEnvelope {
  return { code: 'INTERNAL', message, retryable: true };
}

/**
 * 실제 `/api/mediate` fetch. `shared/api.ts`의 이전 구현(패널 컨텍스트에서 직접 fetch하던 버전)과
 * 같은 요청 계약·에러 매핑을 그대로 쓰되, 실행 위치만 여기(서비스 워커)로 옮겼다.
 *
 * 🔴 M-2(reviewer) — 200 응답이라도 `response.json()`이 던질 수 있다(프록시 간섭, 잘린 응답 등).
 * 에러 경로처럼 `.catch(() => null)`로 감싸 request-failed 봉투를 돌려준다.
 * 🔴 M-6(reviewer) — 401 또는 `error.code === 'AUTH_REQUIRED'`는 일반 request-failed가 아니라
 * not-logged-in으로 매핑하고, 만료된 토큰을 지운다 — 패널이 이미 NotLoggedIn 상태·안내 링크를
 * 가지고 있으므로 별도 UI를 새로 만들 필요가 없다.
 */
async function handleMediateRequest(body: MediateApiRequest): Promise<MediateApiResult> {
  const token = await getStoredToken();
  if (!token) {
    return { ok: false, reason: 'not-logged-in' };
  }

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

    if (response.status === 401 || parsed?.error?.code === 'AUTH_REQUIRED') {
      await clearStoredToken();
      return { ok: false, reason: 'not-logged-in' };
    }

    return {
      ok: false,
      reason: 'request-failed',
      error: parsed?.error ?? genericError('처리에 실패했습니다.'),
    };
  }

  const data = (await response.json().catch(() => null)) as MediationResult | null;
  if (data === null) {
    return {
      ok: false,
      reason: 'request-failed',
      error: genericError('응답을 해석할 수 없습니다.'),
    };
  }
  return { ok: true, data };
}

function isCounterpartsRequestMessage(message: unknown): message is { type: string } {
  if (typeof message !== 'object' || message === null) return false;
  const candidate = message as { type?: unknown };
  return candidate.type === COUNTERPARTS_REQUEST_MESSAGE_TYPE;
}

/**
 * T66(AC-067①) — `GET /api/pair-protocols` fetch. `handleMediateRequest`와 같은 이유로
 * 서비스 워커에서 수행한다(CORS, `shared/api.ts` 헤더 주석). 401/`AUTH_REQUIRED`를
 * not-logged-in으로 매핑하고 토큰을 지우는 것도 동일하다.
 */
async function handleCounterpartsRequest(): Promise<CounterpartsApiResult> {
  const token = await getStoredToken();
  if (!token) {
    return { ok: false, reason: 'not-logged-in' };
  }

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
    response = await fetch(`${APP_ORIGIN}/api/pair-protocols`, {
      headers: { authorization: `Bearer ${token}` },
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

    if (response.status === 401 || parsed?.error?.code === 'AUTH_REQUIRED') {
      await clearStoredToken();
      return { ok: false, reason: 'not-logged-in' };
    }

    return {
      ok: false,
      reason: 'request-failed',
      error: parsed?.error ?? genericError('처리에 실패했습니다.'),
    };
  }

  const data = (await response.json().catch(() => null)) as { counterparts: string[] } | null;
  if (data === null) {
    return {
      ok: false,
      reason: 'request-failed',
      error: genericError('응답을 해석할 수 없습니다.'),
    };
  }
  return { ok: true, counterparts: data.counterparts };
}

function isSampleAddRequestMessage(message: unknown): message is SampleAddRequestMessage {
  if (typeof message !== 'object' || message === null) return false;
  const candidate = message as { type?: unknown; body?: unknown };
  return candidate.type === SAMPLE_ADD_REQUEST_MESSAGE_TYPE && typeof candidate.body === 'object';
}

/**
 * T71(AC-080/081) — `POST /api/samples` fetch. `handleMediateRequest`와 같은 이유·같은 에러
 * 매핑으로 서비스 워커에서 수행한다(CORS). 🔴 이 함수가 받는 `body`(`AddSampleRequest`)에는
 * 원문 텍스트 필드가 애초에 없다 — `shared/api.ts`의 타입이 이미 그것을 배제한다(AC-081①③).
 */
async function handleSampleAddRequest(body: AddSampleRequest): Promise<AddSampleApiResult> {
  const token = await getStoredToken();
  if (!token) {
    return { ok: false, reason: 'not-logged-in' };
  }

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
    response = await fetch(`${APP_ORIGIN}/api/samples`, {
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

    if (response.status === 401 || parsed?.error?.code === 'AUTH_REQUIRED') {
      await clearStoredToken();
      return { ok: false, reason: 'not-logged-in' };
    }

    return {
      ok: false,
      reason: 'request-failed',
      error: parsed?.error ?? genericError('처리에 실패했습니다.'),
    };
  }

  // 🔴 `docs/API.md:342` 계약 그대로 `{ id, counterpart, source, collectedAt }` — 필드명이
  // `apps/web/app/api/samples/route.ts`의 실제 응답과 정확히 일치해야 한다.
  const data = (await response.json().catch(() => null)) as StoredSampleSummary | null;
  if (data === null) {
    return {
      ok: false,
      reason: 'request-failed',
      error: genericError('응답을 해석할 수 없습니다.'),
    };
  }
  return { ok: true, data };
}

// 🔴 T66 — `chrome.runtime.onMessage.addListener`를 내부 메시지 타입당 하나씩 여러 번 등록하지
// 않는다. 실 Chrome은 여러 리스너를 다 부르지만, 테스트 하네스(`background.test.ts`)의 페이크
// `addListener`는 마지막 등록만 남기는 단순 구현이라 여러 개를 등록하면 앞선 리스너가 실질적으로
// 죽는다 — 그 사실을 여기서 우회하지 않고, 타입으로 분기하는 디스패처 하나로 합쳐 실 Chrome과
// 테스트 하네스 양쪽에서 동일하게 동작하게 한다.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isMediateRequestMessage(message)) {
    handleMediateRequest(message.body)
      .then(sendResponse)
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          reason: 'request-failed',
          error: genericError(error instanceof Error ? error.message : String(error)),
        });
      });
    return true; // sendResponse는 비동기로 호출된다 — 리스너가 살아있게 true를 반환한다.
  }

  if (isCounterpartsRequestMessage(message)) {
    handleCounterpartsRequest()
      .then(sendResponse)
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          reason: 'request-failed',
          error: genericError(error instanceof Error ? error.message : String(error)),
        });
      });
    return true;
  }

  if (isSampleAddRequestMessage(message)) {
    handleSampleAddRequest(message.body)
      .then(sendResponse)
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          reason: 'request-failed',
          error: genericError(error instanceof Error ? error.message : String(error)),
        });
      });
    return true;
  }

  return false;
});
