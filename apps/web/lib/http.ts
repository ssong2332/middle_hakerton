/**
 * `withApi()` — HTTP 경계 단일 지점. `docs/Architecture.md` Conventions 2:
 * "HTTP 경계 밖으로 예외가 새지 않는다. 모든 Route Handler는 withApi()로 감싼다."
 *
 * 책임(실 구현은 T4 이후 채운다 — 🔴 T2 스캐폴드는 시그니처만 고정한다):
 * - 세션 확인(`auth.ts`) · zod 입력 검증 실패 시 400 `VALIDATION_FAILED`
 * - `CoreError` 계열을 잡아 `docs/API.md` 공통 에러 봉투로 변환
 * - 그 외 예외는 500 `INTERNAL`
 *
 * Route Handler 본문에 `try/catch`를 쓰지 않는다(`docs/CodingRules.md` Error Handling).
 */
import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export interface WithApiOptions<TInput> {
  /** 요청 body/query를 파싱할 zod 스키마. 실패 시 400 `VALIDATION_FAILED`. */
  schema?: ZodType<TInput>;
  /** `/api/health` 등 인증 불필요 라우트만 `false`. */
  requireAuth?: boolean;
}

export function withApi<TInput, TOutput>(
  _options: WithApiOptions<TInput>,
  _handler: (input: TInput, request: Request) => Promise<TOutput>,
): (request: Request) => Promise<NextResponse<TOutput | ApiErrorBody>> {
  throw new Error('Not implemented — T4에서 채운다');
}
