/**
 * `POST /api/samples` — `docs/API.md:335` "GET / POST /api/samples · DELETE /api/samples/{id}"
 * (UX-016 Mark 모드, UF-020) / AC-080, AC-081. `docs/Tasks.md` T71.
 *
 * 🔴 이 파일은 **POST만** 구현한다 — `docs/API.md:382,385` Screen↔Endpoint 매핑이 이미
 * `GET`/`DELETE`를 UX-019(T72)로 나눠 놓았다. T72가 이 파일에 `GET`/`DELETE`를 추가한다
 * (`apps/web/app/api/protocol/route.ts`처럼 한 파일에 메서드별로 export하는 이 리포의 관례).
 *
 * 🔴 **요청 스키마에 원문 텍스트 필드가 없다**(`docs/API.md:339` "원문은 확장 콘텐츠 스크립트에서
 * 집계 후 폐기되며 어떤 payload에도 실리지 않는다", AC-081①③) — 이 라우트가 받는 것은
 * `indicatorDeltas`(집계값)뿐이다. 원문이 이 라우트까지 도달하는 코드 경로 자체가 존재하지
 * 않는다(타입에서부터 배제).
 */
import { z } from 'zod';
import { withApi } from '../../../lib/http';
import { insertSample } from '../../../lib/samples/storage';

const indicatorDeltasSchema = z.object({
  sentenceCount: z.number(),
  emojiCount: z.number(),
  charCount: z.number(),
  hedgeCount: z.number(),
  addressFormKind: z.string().nullable(),
  deadlineMentionKind: z.string().nullable(),
});

const samplesPostRequestSchema = z.object({
  counterpart: z.string().trim().min(1),
  source: z.literal('manual'),
  indicatorDeltas: indicatorDeltasSchema,
  collectedAt: z.string().datetime(),
});

type SamplesPostRequest = z.infer<typeof samplesPostRequestSchema>;

export interface SamplesPostResponse {
  id: string;
  counterpart: string;
  source: 'manual';
  collectedAt: string;
}

/** T71 — `docs/API.md:342` Response 201 `{ id, counterpart, source, collectedAt }`. 🔴 필드명은
 * `counterpart`다 — `insertSample()`이 내부적으로 쓰는 `counterpartIdentifier`(storage.ts,
 * DB 컬럼명과 맞춘 이름)를 그대로 응답에 흘리지 않고 계약 그대로 변환한다. `collectedAt`은
 * 클라이언트가 선택을 마크한 시점을 보낸다(사용자가 실제로 "표본에 추가"를 누른 순간 — 네트워크
 * 지연으로 서버 도착 시각과 달라질 수 있어 그대로 신뢰한다, 예약 발송처럼 정책 우회에 쓰이는
 * 필드가 아니라 표시용 타임스탬프뿐). */
export const POST = withApi<SamplesPostRequest, SamplesPostResponse>(
  { schema: samplesPostRequestSchema, requireAuth: true, successStatus: 201 },
  async ({ input, session }) => {
    const client = session?.client;
    if (!client) {
      throw new Error('세션에 인증된 Supabase 클라이언트가 없습니다');
    }
    const stored = await insertSample(client, {
      userId: session.userId,
      counterpartIdentifier: input.counterpart,
      source: input.source,
      indicatorDeltas: input.indicatorDeltas,
      collectedAt: input.collectedAt,
    });
    return {
      id: stored.id,
      counterpart: stored.counterpartIdentifier,
      // 🔴 이 라우트는 `source: 'manual'`만 받는다(스키마 `z.literal('manual')`) — `stored.source`
      // 타입은 `insertSample()`이 GitHub 경로와 공유하는 범용 타입이라 넓지만, 이 라우트에서는
      // 항상 리터럴 그대로다.
      source: 'manual',
      collectedAt: stored.collectedAt,
    };
  },
);
