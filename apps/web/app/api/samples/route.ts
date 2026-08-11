/**
 * `GET / POST /api/samples` — `docs/API.md:335` "GET / POST /api/samples · DELETE
 * /api/samples/{id}" (UX-016 Mark 모드/UX-019, UF-020/UF-021) / AC-080, AC-081. `docs/Tasks.md`
 * T71(POST)/T72(GET). `DELETE`는 경로가 `/api/samples/{id}`라 별도 파일(`[id]/route.ts`, T72)에
 * 있다 — `docs/API.md:384` Screen↔Endpoint 매핑이 GET/POST/DELETE를 나눈 것은 API 경로 소유
 * 구분일 뿐, 이 파일이 GET+POST를 함께 갖는 것은 `protocol/route.ts`(GET+PUT)와 같은 관례다.
 *
 * 🔴 **요청/응답 어디에도 원문 텍스트 필드가 없다**(`docs/API.md:339,341` — POST는 집계값만
 * 받고, GET은 `indicatorContribution`(집계값)만 돌려준다, AC-081①②③). 원문이 이 파일의 어떤
 * 경로로도 도달하지 않는다(타입에서부터 배제).
 */
import { z } from 'zod';
import { withApi } from '../../../lib/http';
import { insertSample, listSamples, type SamplesOverview } from '../../../lib/samples/storage';

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

/** T72 — `docs/API.md:341` Response 200. 쿼리 파라미터 없이 이 사용자의 상대별 롤업 전체 +
 * 표본 목록 전체를 반환한다(계약에 `?counterpart=` 같은 필터가 없다) — CounterpartList
 * (`/observation-samples`)와 SampleList(`/observation-samples/:counterpart`) 두 화면 모두
 * 같은 응답을 재사용하고, 상세 화면은 클라이언트에서 `samples`를 그 상대로 필터링한다. */
export const GET = withApi<undefined, SamplesOverview>({ requireAuth: true }, async ({ session }) => {
  const client = session?.client;
  if (!client) {
    throw new Error('세션에 인증된 Supabase 클라이언트가 없습니다');
  }
  return listSamples(client, session.userId);
});
