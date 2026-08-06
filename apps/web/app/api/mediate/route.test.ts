/**
 * `POST /api/mediate` — T5+T7+T9+T10 범위(C1 분류·C2 톤 변환·C4 역번역이 실제로 동작,
 * `docs/Tasks.md` T5/T6/T7/T9/T10 · `docs/API.md`). 🔴 C3/C5/C6은 아직 없다 — 이 테스트는 그
 * 필드들이 T1 계약을 만족하는 placeholder 값으로 나가는 것과, C1(긴급도 분류+override,
 * AC-003/AC-004)·C2(톤 변환+보존+오해 경고, AC-006/043)·C4(역번역)·AC-046③(존댓말 혼용 경고)이
 * 실제로 동작하는 것을 확인한다. C2의 의미적 정확도(변환 품질)는 이 파일이 아니라
 * `packages/core/src/steps/c2.test.ts`(스키마·폴백 계약)와 `docs/TestCases.md`를 쓰는 T11
 * 러너(`tests/regression-c2.ts`)의 몫이다 — 여기서는 라우트 배선(세 스텝을 순서대로 부르고
 * source를 합치는 것)만 본다.
 * `resolveSession()`(T45 스텁)과 OpenAI 호출(`createOpenAiLLMClient`)은 모킹한다.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/auth', () => ({
  resolveSession: vi.fn(),
}));
vi.mock('../../../lib/llm/openai', () => ({
  createOpenAiLLMClient: vi.fn(),
}));
// 🔴 M-4(reviewer 라운드) — `route.ts`는 실제로 `openai.ts`를 직접 부르지 않고
// `create-client.ts`의 `createLLMClient`(provider 스위치)를 거친다. 위 `../../../lib/llm/openai`
// mock만으로는 그 배선(route.ts가 create-client.ts를 실제로 호출하는지)을 검증하지 못한다 —
// route.ts가 openai.ts를 다시 직접 부르도록 되돌려도 이 mock은 여전히 통과했을 것이다.
// `create-client`를 직접 mock해 `createLLMClient`가 호출되는지 별도로 단언한다.
vi.mock('../../../lib/llm/create-client', () => ({
  createLLMClient: vi.fn(),
}));

import { resolveSession } from '../../../lib/auth';
import { createOpenAiLLMClient } from '../../../lib/llm/openai';
import { createLLMClient } from '../../../lib/llm/create-client';
import { POST } from './route';

const mockResolveSession = vi.mocked(resolveSession);
const mockCreateOpenAiClient = vi.mocked(createOpenAiLLMClient);
const mockCreateLLMClient = vi.mocked(createLLMClient);

/**
 * 기존 테스트들은 전부 `mockCreateClient`(이제 `mockCreateOpenAiClient`)로 `fakeLlm()`을
 * 주입해 왔다 — 그 테스트들의 의도(C1/C2/C4 배선 검증)는 그대로 두되, provider 스위치를
 * 우회하지 않도록 `mockCreateLLMClient`도 같은 `LLMClient`를 반환하게 위임한다.
 */
function mockCreateClient(llm: ReturnType<typeof createOpenAiLLMClient>) {
  mockCreateOpenAiClient.mockReturnValue(llm);
  mockCreateLLMClient.mockResolvedValue(llm);
}

type Source = 'live' | 'cache' | 'fallback';

/**
 * 🔴 이 라우트는 이제 LLM을 세 번 호출한다(C1 분류 → C2 톤 변환 → C4 역번역, `route.ts` 헤더
 * 주석 참조, T10에서 C2가 추가됐다). `step` 인자로 어느 호출인지 구분해 각각 다른 응답을 흉내
 * 낸다 — 옵션을 생략하면 각 스텝의 무난한 기본값을 쓴다.
 */
function fakeLlm(
  options: {
    urgency?: string;
    urgencyReason?: string;
    urgencySource?: Source;
    urgencyContent?: string;
    toneTransformed?: string;
    toneReason?: string;
    tonePreserved?: unknown[];
    toneMisreadRisks?: unknown[];
    toneSource?: Source;
    toneContent?: string;
    backTranslation?: string;
    backTranslationSource?: Source;
    backTranslationContent?: string;
  } = {},
) {
  const {
    urgency = 'NORMAL',
    urgencyReason = '일반 업무 요청입니다.',
    urgencySource = 'live',
    urgencyContent,
    toneTransformed = 'transformed text',
    toneReason = '톤을 다듬었습니다.',
    tonePreserved = [],
    toneMisreadRisks = [],
    toneSource = 'live',
    toneContent,
    backTranslation = 'back',
    backTranslationSource = 'live',
    backTranslationContent,
  } = options;

  return {
    complete: vi.fn().mockImplementation((step: string) => {
      if (step === 'c1') {
        return Promise.resolve({
          content: urgencyContent ?? JSON.stringify({ urgency, reason: urgencyReason }),
          source: urgencySource,
        });
      }
      if (step === 'c2') {
        return Promise.resolve({
          content:
            toneContent ??
            JSON.stringify({
              transformed: toneTransformed,
              reason: toneReason,
              preserved: tonePreserved,
              misreadRisks: toneMisreadRisks,
            }),
          source: toneSource,
        });
      }
      return Promise.resolve({
        content: backTranslationContent ?? JSON.stringify({ backTranslation }),
        source: backTranslationSource,
      });
    }),
  };
}

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/mediate', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/mediate', () => {
  it('세션이 없으면 401 AUTH_REQUIRED를 반환한다', async () => {
    mockResolveSession.mockResolvedValue(null);

    const response = await POST(
      postRequest({
        text: '안녕하세요',
        context: { languageDirection: 'ko-en', channel: 'web' },
      }),
    );

    expect(response.status).toBe(401);
  });

  it('text가 비어 있으면 400 VALIDATION_FAILED를 반환한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });

    const response = await POST(
      postRequest({ text: '', context: { languageDirection: 'ko-en', channel: 'web' } }),
    );

    expect(response.status).toBe(400);
  });

  it('AC-001 — backTranslation을 응답에 담아 200을 반환한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient(fakeLlm({ backTranslation: 'Please confirm by tomorrow.' }));

    const response = await POST(
      postRequest({
        text: '내일까지 확인 부탁드립니다.',
        context: { languageDirection: 'ko-en', channel: 'web' },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.backTranslation).toBe('Please confirm by tomorrow.');
    expect(body.source).toBe('live');
  });

  // 🔴 (2026-08-05 갱신 — F1-e, DECISIONS #48 · ADR-0009) `stepSources`가 13번째 필드로 덧붙어
  // 12개 → 13개로 늘었다(테스트 이름도 갱신). 기존 12개 필드는 이름·순서·타입 그대로다.
  it('T1 계약의 13개 필드를 모두 채운다(C3/C5/C6 대기 중에도 스키마는 만족)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient(fakeLlm());

    const response = await POST(
      postRequest({ text: 'hello', context: { languageDirection: 'en-ko', channel: 'web' } }),
    );
    const body = await response.json();

    expect(Object.keys(body).sort()).toEqual(
      [
        'backTranslation',
        'holidayConflicts',
        'misreadRisks',
        'personalizationApplied',
        'preserved',
        'reason',
        'source',
        'stepSources',
        'ticketOption',
        'transformed',
        'urgency',
        'urgencyReason',
        'warnings',
      ].sort(),
    );
    // 🔴 T24 — 'hello'는 감정 신호 키워드가 없으므로 대조군(signal_absent)이 정답이다(AC-058①).
    // 게이트 판정 자체의 케이스별 검증(T-E01~T-E04)은 `packages/core/src/steps/c6.test.ts`가 한다.
    expect(body.ticketOption).toEqual({ offered: false, basis: 'signal_absent' });
    // 🔴 프로필/규약이 아직 연결되지 않아 개인화가 적용되지 않는다 — 현재 상태에서는 정확한 값.
    expect(body.personalizationApplied).toBe(false);
    expect(body.holidayConflicts).toEqual([]);
    expect(body.misreadRisks).toEqual([]);
    expect(body.preserved).toEqual([]);
    // 🔴 F1-e — 세 스텝 모두 필수(AC-032 고정 순서상 항상 실행된다). 기본 mock은 모두 live다.
    expect(body.stepSources).toEqual({ c1: 'live', c2: 'live', c4: 'live' });
  });

  it('AC-003 — C1이 분류한 urgency와 근거 문장을 그대로 응답에 담는다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient(
      fakeLlm({ urgency: 'LOW', urgencyReason: '시간 압박이 없는 참고 메시지입니다.' }),
    );

    const response = await POST(
      postRequest({
        text: '참고로 보내드립니다.',
        context: { languageDirection: 'ko-en', channel: 'web' },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.urgency).toBe('LOW');
    expect(body.urgencyReason).toBe('시간 압박이 없는 참고 메시지입니다.');
  });

  // 🔴 M2(reviewer 라운드 → 수정) — 이 테스트는 AC-005("예약·지연 경로를 건너뛴다")를 검증하지
  // 않는다(그 경로 자체가 아직 존재하지 않는다 — `route.ts` 헤더 주석 "T9(AC-005) 분기점 안내"
  // 참조). 여기서 확인하는 것은 AC-003(C1 판정을 그대로 응답에 담는다)의 CRITICAL 케이스뿐이다.
  it('AC-003 — C1이 CRITICAL로 판정하면 override 없이도 응답 urgency가 CRITICAL이다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient(
      fakeLlm({ urgency: 'CRITICAL', urgencyReason: '프로덕션 장애로 즉시 대응이 필요합니다.' }),
    );

    const response = await POST(
      postRequest({
        text: '지금 프로덕션이 다운됐습니다',
        context: { languageDirection: 'ko-en', channel: 'web' },
      }),
    );
    const body = await response.json();

    expect(body.urgency).toBe('CRITICAL');
  });

  it('AC-004 — urgencyOverride가 있으면 C1 판정 대신 override 값이 응답에 반영된다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient(
      fakeLlm({ urgency: 'NORMAL', urgencyReason: '일반 업무 요청으로 보입니다.' }),
    );

    const response = await POST(
      postRequest({
        text: '확인 부탁드립니다.',
        context: {
          languageDirection: 'ko-en',
          channel: 'web',
          urgencyOverride: 'CRITICAL',
        },
      }),
    );
    const body = await response.json();

    // override가 C1의 원래 판정(NORMAL)을 이긴다.
    expect(body.urgency).toBe('CRITICAL');
    // 🔴 근거 문장은 override에 대해 지어내지 않고 C1의 원래 판단 근거를 그대로 유지한다
    // (`route.ts` 주석 — override 자체의 "판단 근거 문장"은 존재하지 않는다).
    expect(body.urgencyReason).toBe('일반 업무 요청으로 보입니다.');
  });

  it('urgencyOverride가 null이면(명시적으로 override하지 않음) C1 판정을 그대로 쓴다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient(fakeLlm({ urgency: 'LOW', urgencyReason: '근거' }));

    const response = await POST(
      postRequest({
        text: 'hi',
        context: { languageDirection: 'ko-en', channel: 'web', urgencyOverride: null },
      }),
    );
    const body = await response.json();

    expect(body.urgency).toBe('LOW');
  });

  // 🔴 T10 이후 존댓말 혼용 검사는 입력 원문이 아니라 **C2의 변환문**(`transformed`)을 본다
  // (`route.ts`의 `honorificMixedWarning(transformed)` 호출) — 아래 테스트는 C2 mock의
  // `toneTransformed`로 검사 대상 텍스트를 직접 지정한다.
  it('AC-046③ — en-ko 방향에서 C2 변환문에 존댓말 혼용이 있으면 warnings에 경고가 담긴다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient(
      fakeLlm({ toneTransformed: '확인 부탁드립니다. 편하실 때 연락 주세요.' }),
    );

    const response = await POST(
      postRequest({
        text: 'Please check this. Contact me when convenient.',
        context: { languageDirection: 'en-ko', channel: 'web' },
      }),
    );
    const body = await response.json();

    expect(body.warnings).toContainEqual(expect.objectContaining({ type: 'honorificLevelMixed' }));
  });

  it('ko-en 방향에서는 존댓말 혼용 검사를 실행하지 않는다(AC-046은 EN→KO 전용)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient(
      fakeLlm({ toneTransformed: '확인 부탁드립니다. 편하실 때 연락 주세요.' }),
    );

    const response = await POST(
      postRequest({
        text: '확인 부탁드립니다. 편하실 때 연락 주세요.',
        context: { languageDirection: 'ko-en', channel: 'web' },
      }),
    );
    const body = await response.json();

    expect(body.warnings).toEqual([]);
  });

  it('경고가 없으면 warnings는 빈 배열이다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient(fakeLlm({ toneTransformed: '확인해 주세요.' }));

    const response = await POST(
      postRequest({
        text: 'Please check.',
        context: { languageDirection: 'en-ko', channel: 'web' },
      }),
    );
    const body = await response.json();

    expect(body.warnings).toEqual([]);
  });

  it('AC-006/043 — C2가 반환한 preserved/misreadRisks/reason/transformed가 그대로 응답에 담긴다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    const preserved = [
      { kind: 'deadline', sourceText: '금요일까지', transformedText: 'by Friday' },
    ];
    const misreadRisks = [
      { quote: '확인 부탁드립니다', misreading: '단순 참고로 읽힘', evidence: '명시적 기한 없음' },
    ];
    mockCreateClient(
      fakeLlm({
        toneTransformed: 'Please confirm by Friday.',
        toneReason: '완곡한 요청을 명시적 요청으로 복원했습니다.',
        tonePreserved: preserved,
        toneMisreadRisks: misreadRisks,
      }),
    );

    const response = await POST(
      postRequest({
        text: '금요일까지 확인 부탁드립니다.',
        context: { languageDirection: 'ko-en', channel: 'web' },
      }),
    );
    const body = await response.json();

    expect(body.transformed).toBe('Please confirm by Friday.');
    expect(body.reason).toBe('완곡한 요청을 명시적 요청으로 복원했습니다.');
    expect(body.preserved).toEqual(preserved);
    expect(body.misreadRisks).toEqual(misreadRisks);
  });

  // 🔴 T16 — `packages/core/src/data/fallback-responses.ts`의 `FALLBACK_RESPONSES`가 비어 있던
  // 시절에는 step 스키마 검증 실패가 곧 "폴백도 없음"과 같아 502로 직행했다. 이제 c1/c2/c4 각각
  // 시나리오 기본값이 있으므로(각 step이 `NO_STEP_CACHE_KEY`로 조회, `steps/c2.ts` 참조), 스키마
  // 검증 실패는 502가 아니라 **200 + source:'fallback'**으로 정상 응답한다(AC-041 "오류 응답보다
  // 폴백 200이 우선" — `docs/API.md:48`). 이 테스트는 그 동작 변경을 고정한다.
  it('C2 응답이 스키마 검증에 실패해도 실 FALLBACK_RESPONSES로 폴백해 200을 반환한다(T16, AC-041)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient(fakeLlm({ toneContent: '유효하지 않은 JSON' }));

    const response = await POST(
      postRequest({ text: 'hello', context: { languageDirection: 'ko-en', channel: 'web' } }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.source).toBe('fallback');
    expect(typeof body.transformed).toBe('string');
    expect(body.transformed.length).toBeGreaterThan(0);
  });

  it('AC-030 — 응답 어디에도 OPENAI_API_KEY 값이 노출되지 않는다', async () => {
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-test-secret-value-should-not-leak';
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient(fakeLlm());

    const response = await POST(
      postRequest({ text: 'hello', context: { languageDirection: 'ko-en', channel: 'web' } }),
    );
    const bodyText = await response.text();

    expect(bodyText).not.toContain('sk-test-secret-value-should-not-leak');
    process.env.OPENAI_API_KEY = previous;
  });

  it('C1 응답이 스키마 검증에 실패해도 실 FALLBACK_RESPONSES로 폴백해 200을 반환한다(T16, AC-041)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient(fakeLlm({ urgencyContent: '유효하지 않은 JSON' }));

    const response = await POST(
      postRequest({ text: 'hello', context: { languageDirection: 'ko-en', channel: 'web' } }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.source).toBe('fallback');
    expect(['CRITICAL', 'NORMAL', 'LOW']).toContain(body.urgency);
  });

  it('C4 응답이 스키마 검증에 실패해도 실 FALLBACK_RESPONSES로 폴백해 200을 반환한다(T16, AC-041)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient(fakeLlm({ backTranslationContent: '유효하지 않은 JSON' }));

    const response = await POST(
      postRequest({ text: 'hello', context: { languageDirection: 'ko-en', channel: 'web' } }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.source).toBe('fallback');
    expect(typeof body.backTranslation).toBe('string');
    expect(body.backTranslation.length).toBeGreaterThan(0);
  });

  it('C1이 fallback이고 C4가 live면 응답 source는 신뢰도가 낮은 쪽(fallback)을 따른다(AC-041)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient(
      fakeLlm({ urgencySource: 'fallback', backTranslationSource: 'live' }),
    );

    const response = await POST(
      postRequest({ text: 'hello', context: { languageDirection: 'ko-en', channel: 'web' } }),
    );
    const body = await response.json();

    expect(body.source).toBe('fallback');
  });

  it('C1이 live이고 C4가 cache면 응답 source는 신뢰도가 낮은 쪽(cache)을 따른다(AC-041)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient(
      fakeLlm({ urgencySource: 'live', backTranslationSource: 'cache' }),
    );

    const response = await POST(
      postRequest({ text: 'hello', context: { languageDirection: 'ko-en', channel: 'web' } }),
    );
    const body = await response.json();

    expect(body.source).toBe('cache');
  });

  it('C1·C4가 live여도 C2가 fallback이면 응답 source는 fallback을 따른다(AC-041, 세 스텝 모두 대상)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient(
      fakeLlm({ urgencySource: 'live', toneSource: 'fallback', backTranslationSource: 'live' }),
    );

    const response = await POST(
      postRequest({ text: 'hello', context: { languageDirection: 'ko-en', channel: 'web' } }),
    );
    const body = await response.json();

    expect(body.source).toBe('fallback');
  });

  // 🔴 F1-e(DECISIONS #48 · ADR-0009 Follow-up #1) — `stepSources`가 세 스텝의 출처를 **뒤섞지
  // 않고** 각자 담는지 확인한다. 위 세 테스트는 합쳐진 `source`만 보므로, 세 값이 서로 달라도
  // (c1≠c2≠c4) `stepSources.c1`/`.c2`/`.c4`가 각각 자신의 스텝 값과 일치하는지는 별도로 확인해야
  // 잘못된 매핑(예: c2와 c4가 뒤바뀜)을 잡을 수 있다.
  it('stepSources는 C1/C2/C4 각각의 출처를 뒤섞지 않고 그대로 담는다(F1-e)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient(
      fakeLlm({ urgencySource: 'cache', toneSource: 'fallback', backTranslationSource: 'live' }),
    );

    const response = await POST(
      postRequest({ text: 'hello', context: { languageDirection: 'ko-en', channel: 'web' } }),
    );
    const body = await response.json();

    expect(body.stepSources).toEqual({ c1: 'cache', c2: 'fallback', c4: 'live' });
    // 합쳐진 값은 세 스텝 중 가장 신뢰도가 낮은 fallback(AC-041) — stepSources와 source가 함께
    // 검증되어야 F1-e의 파생 불변식(`source = worst(stepSources)`)이 이 라우트에서도 지켜진다.
    expect(body.source).toBe('fallback');
  });

  // 🔴 M-4(reviewer 라운드) — route.ts가 openai.ts를 직접 부르지 않고 provider 스위치
  // (`create-client.ts`의 `createLLMClient`)를 거쳐 LLMClient를 얻는지 배선 자체를 검증한다.
  // 이 단언이 없으면 route.ts가 `createOpenAiLLMClient`를 다시 직접 호출하도록 되돌려도
  // 위 테스트들은 `../../../lib/llm/openai` mock 덕분에 여전히 통과해 회귀를 잡지 못한다.
  it('M-4 — route.ts는 createOpenAiLLMClient를 직접 부르지 않고 createLLMClient(userId)를 거친다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-42' });
    mockCreateClient(fakeLlm());

    await POST(
      postRequest({ text: 'hello', context: { languageDirection: 'ko-en', channel: 'web' } }),
    );

    expect(mockCreateLLMClient).toHaveBeenCalledWith('user-42');
  });

  // 🔴 T24 — AC-058 게이트가 이 라우트에 실제로 배선됐는지 확인한다(단위 케이스 자체의 소유자는
  // `packages/core/src/steps/c6.test.ts`의 `assessEmotionalSignal` — 여기서는 원문(`input.text`)이
  // 그 함수에 실제로 전달되는지만 본다). `docs/TestCases.md` T-E02/T-E03을 그대로 쓴다.
  it('AC-058② — 감정형 원문(T-E02)이면 ticketOption.offered가 true다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient(fakeLlm());

    const response = await POST(
      postRequest({
        text: '이건 명백히 그쪽 실수입니다',
        context: { languageDirection: 'ko-en', channel: 'web' },
      }),
    );
    const body = await response.json();

    expect(body.ticketOption).toEqual({ offered: true, basis: 'signal_present' });
  });

  it('AC-058① — 대조군 원문(T-E03)이면 ticketOption.offered가 false다(항상 제시가 아님을 증명)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient(fakeLlm());

    const response = await POST(
      postRequest({
        text: '확인 부탁드립니다',
        context: { languageDirection: 'ko-en', channel: 'web' },
      }),
    );
    const body = await response.json();

    expect(body.ticketOption).toEqual({ offered: false, basis: 'signal_absent' });
  });
});
