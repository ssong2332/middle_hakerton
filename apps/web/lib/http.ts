/**
 * `withApi()` — HTTP 경계 단일 지점. `docs/Architecture.md` Conventions 2:
 * "HTTP 경계 밖으로 예외가 새지 않는다. 모든 Route Handler는 withApi()로 감싼다."
 *
 * 책임:
 * - 세션 확인(`auth.ts`) · zod 입력 검증 실패 시 400 `VALIDATION_FAILED`
 * - `CoreError` 계열을 잡아 `docs/API.md` 공통 에러 봉투로 변환
 * - 그 외 예외는 500 `INTERNAL`
 *
 * Route Handler 본문에 `try/catch`를 쓰지 않는다(`docs/CodingRules.md` Error Handling) —
 * 잡는 곳은 이 파일 한 곳뿐이다.
 *
 * 🔴 T5가 처음 채운다(스텁 주석 "T5에서 채운다"). 핸들러 시그니처를 `(input, request)` 에서
 * `(args: { input, request, session })` 로 넓혔다 — `apps/web/lib/llm/openai.ts`의
 * `createOpenAiLLMClient(userId)`가 요청 스코프 인스턴스를 전제하므로(그 파일 JSDoc "호출부는
 * T5+ 범위") 핸들러가 `resolveSession()`을 다시 호출하지 않고도 userId를 얻을 수 있어야 한다.
 * 이 타입은 Freeze Point가 아니라(F1/F2에 없음) 이 파일을 처음 구현하는 태스크가 정할 수 있는
 * 내부 유틸리티 시그니처다 — 지금까지 이 타입을 참조하는 Route Handler가 0개이므로(첫 소비자가
 * T5) 변경 비용이 최저점이다.
 *
 * 🔴 `resolveSession()`은 아직 스텁이다(`lib/auth.ts` — "T45에서 채운다"). `docs/Tasks.md`
 * Rules "M2는 인증부터 시작한다... 인증은 Core 1차(T5~T16)를 침범하지 않는다"에 따라 T5는
 * 이 함수를 구현하지 않는다 — 호출만 하고, 실제 세션 해석은 T45가 채운다. 그때까지
 * `requireAuth:true` 라우트는 `resolveSession()`이 던지는 예외가 아래 catch에서 500
 * `INTERNAL`로 잡혀 반환된다(알려진 임시 상태 — T5 구현 보고서 참조).
 */
import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';
import { CoreError, ValidationError, type ErrorCode } from '@cross-border/core';
import { resolveSession, type Session } from './auth';

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export interface WithApiOptions<TInput> {
  /** 요청 body를 파싱할 zod 스키마. 실패 시 400 `VALIDATION_FAILED`. 생략하면 입력을 파싱하지 않는다. */
  schema?: ZodType<TInput>;
  /** `/api/health` 등 인증 불필요 라우트만 `false`. 기본값 `true`(`docs/API.md` Conventions "인증"). */
  requireAuth?: boolean;
  /**
   * 성공 응답 HTTP 상태 코드. 기본값 `200`. 🔴 T14 — `POST /api/messages`는 리소스를 생성하므로
   * `docs/API.md` "POST /api/messages" Response가 `201`을 명시한다. 이 옵션이 없으면 새 리소스를
   * 만드는 라우트도 전부 200으로 나가 계약과 어긋난다.
   */
  successStatus?: number;
}

export interface ApiHandlerArgs<TInput> {
  input: TInput;
  request: Request;
  /** 인증된 세션. `requireAuth:false` 라우트에서는 세션을 확인하지 않으므로 항상 `null`이다. */
  session: Session | null;
}

/**
 * `docs/API.md` "Error codes" 표의 HTTP 상태 매핑.
 * 🔴 `QUOTA_EXCEEDED`의 "폴백조차 없는" 경로는 표에 숫자 코드가 없다(표는 "200(폴백)"만
 * 적는다 — `LLMClient.complete()` 실패 계약상 폴백이 있으면 이 코드가 애초에 던져지지 않고
 * 200으로 반환되기 때문). 형제 LLM_* 코드(TIMEOUT/UNAVAILABLE)의 "폴백 없음" 값과 같은 성격
 * ("일시적으로 쓸 수 없음")으로 보고 503을 쓴다 — `docs/API.md`에 명시가 없으므로 T5 구현
 * 보고서에 이 gap을 남긴다.
 */
const HTTP_STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  AUTH_REQUIRED: 401,
  AUTH_INVALID_CREDENTIALS: 401,
  NOT_FOUND: 404,
  CONFLICT_PROTOCOL_AUTHORED: 409,
  CONFLICT_DUPLICATE_ENTRY: 409,
  LLM_TIMEOUT: 503,
  LLM_UNAVAILABLE: 503,
  LLM_MALFORMED: 502,
  QUOTA_EXCEEDED: 503,
  EXTERNAL_FETCH_FAILED: 502,
  INTERNAL: 500,
};

function errorResponse(
  code: ErrorCode,
  message: string,
  retryable: boolean,
  status: number,
): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: { code, message, retryable } }, { status });
}

async function parseInput<TInput>(request: Request, schema?: ZodType<TInput>): Promise<TInput> {
  if (!schema) {
    return undefined as TInput;
  }

  // 🔴 검증 *실패*를 나타내는 값은 core의 `ValidationError`를 그대로 쓴다 — 에러 클래스를
  // 두 곳에서 따로 정의하지 않는다(`docs/API.md` Conventions "Error format" 봉투 1개 원칙과
  // 같은 이유).
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ValidationError('요청 본문을 JSON으로 파싱할 수 없습니다');
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.message);
  }
  return parsed.data;
}

/**
 * 🔴 Reviewer 3차(APPROVED) Action Item 2 — `errorResponseFrom()`의 비-`CoreError` 분기가
 * 이 리포의 유일한 중앙 catch 지점(`withApi()`)인데도 로그를 남기지 않아, 예상치 못한 예외가
 * 500으로 변환되면서 어디에도 흔적이 남지 않았다. `lib/auth.ts`의 `logAuthError()`와 같은
 * 형태(코드·메시지만, 원문 스택·시크릿은 클라이언트 응답에만 안 실을 뿐 로그에는 원인 파악을
 * 위해 남긴다)로 남긴다.
 */
function logInternalError(context: string, error: unknown): void {
  const code =
    (error as { code?: unknown } | null)?.code ?? (error instanceof Error ? error.name : undefined);
  const message = (error as { message?: unknown } | null)?.message ?? String(error);
  console.error(context, { code, message });
}

function errorResponseFrom(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof CoreError) {
    return errorResponse(
      error.code,
      error.message,
      error.retryable,
      HTTP_STATUS_BY_CODE[error.code],
    );
  }
  // 🔴 원본 에러 메시지(스택 추적 등 내부 상세)를 그대로 노출하지 않는다 — 클라이언트에는
  // 고정 문구만 나간다(`docs/CodingRules.md` Error Handling "로그 금지 항목"과 같은 원칙:
  // 사용자에게 보이는 응답에 내부 상세가 실리면 안 된다). 원인 파악은 서버 로그에서 한다.
  logInternalError('[http] withApi unexpected error — responding 500 INTERNAL', error);
  return errorResponse('INTERNAL', '처리 중 오류가 발생했습니다', true, 500);
}

export function withApi<TInput, TOutput>(
  options: WithApiOptions<TInput>,
  handler: (args: ApiHandlerArgs<TInput>) => Promise<TOutput>,
): (request: Request) => Promise<NextResponse<TOutput | ApiErrorBody>> {
  const requireAuth = options.requireAuth ?? true;
  const successStatus = options.successStatus ?? 200;

  return async (request: Request): Promise<NextResponse<TOutput | ApiErrorBody>> => {
    try {
      const session = requireAuth ? await resolveSession(request) : null;
      if (requireAuth && !session) {
        return errorResponse('AUTH_REQUIRED', '인증이 필요합니다', false, 401);
      }

      const input = await parseInput(request, options.schema);
      const output = await handler({ input, request, session });
      return NextResponse.json(output, { status: successStatus });
    } catch (error) {
      return errorResponseFrom(error);
    }
  };
}
