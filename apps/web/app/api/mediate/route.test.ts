/**
 * `POST /api/mediate` — T5+T7+T9 범위(C1 분류·C4 역번역이 실제로 동작, `docs/Tasks.md` T5/T6/T7/T9·
 * `docs/API.md`). 🔴 C2/C3/C5/C6은 아직 없다 — 이 테스트는 그 필드들이 T1 계약을 만족하는
 * placeholder 값으로 나가는 것과, C1(긴급도 분류+override, AC-003/AC-004)·C4(역번역)·
 * AC-046③(존댓말 혼용 경고)이 실제로 동작하는 것을 확인한다.
 * `resolveSession()`(T45 스텁)과 OpenAI 호출(`createOpenAiLLMClient`)은 모킹한다.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/auth', () => ({
  resolveSession: vi.fn(),
}));
vi.mock('../../../lib/llm/openai', () => ({
  createOpenAiLLMClient: vi.fn(),
}));

import { resolveSession } from '../../../lib/auth';
import { createOpenAiLLMClient } from '../../../lib/llm/openai';
import { POST } from './route';

const mockResolveSession = vi.mocked(resolveSession);
const mockCreateClient = vi.mocked(createOpenAiLLMClient);

type Source = 'live' | 'cache' | 'fallback';

/**
 * 🔴 이 라우트는 이제 LLM을 두 번 호출한다(C1 분류 → C4 역번역, `route.ts` 헤더 주석 참조).
 * `step` 인자로 어느 호출인지 구분해 각각 다른 응답을 흉내 낸다 — 옵션을 생략하면 각 스텝의
 * 무난한 기본값(NORMAL/back)을 쓴다.
 */
function fakeLlm(
  options: {
    urgency?: string;
    urgencyReason?: string;
    urgencySource?: Source;
    urgencyContent?: string;
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
    mockCreateClient.mockReturnValue(fakeLlm({ backTranslation: 'Please confirm by tomorrow.' }));

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

  it('T1 계약의 12개 필드를 모두 채운다(C2/C3/C5/C6 대기 중에도 스키마는 만족)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient.mockReturnValue(fakeLlm());

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
        'ticketOption',
        'transformed',
        'urgency',
        'urgencyReason',
        'warnings',
      ].sort(),
    );
    // 🔴 C6(T24) 대기 — 판정 근거가 없으므로 fail-closed(undetermined)가 정답이다(AC-058).
    expect(body.ticketOption).toEqual({ offered: false, basis: 'undetermined' });
    // 🔴 프로필/규약이 아직 연결되지 않아 개인화가 적용되지 않는다 — 현재 상태에서는 정확한 값.
    expect(body.personalizationApplied).toBe(false);
    expect(body.holidayConflicts).toEqual([]);
    expect(body.misreadRisks).toEqual([]);
    expect(body.preserved).toEqual([]);
  });

  it('AC-003 — C1이 분류한 urgency와 근거 문장을 그대로 응답에 담는다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient.mockReturnValue(
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
    mockCreateClient.mockReturnValue(
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
    mockCreateClient.mockReturnValue(
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
    mockCreateClient.mockReturnValue(fakeLlm({ urgency: 'LOW', urgencyReason: '근거' }));

    const response = await POST(
      postRequest({
        text: 'hi',
        context: { languageDirection: 'ko-en', channel: 'web', urgencyOverride: null },
      }),
    );
    const body = await response.json();

    expect(body.urgency).toBe('LOW');
  });

  it('AC-046③ — en-ko 방향에서 존댓말 혼용이 감지되면 warnings에 경고가 담긴다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient.mockReturnValue(fakeLlm());

    const response = await POST(
      postRequest({
        text: '확인 부탁드립니다. 편하실 때 연락 주세요.',
        context: { languageDirection: 'en-ko', channel: 'web' },
      }),
    );
    const body = await response.json();

    expect(body.warnings).toContainEqual(expect.objectContaining({ type: 'honorificLevelMixed' }));
  });

  it('ko-en 방향에서는 존댓말 혼용 검사를 실행하지 않는다(AC-046은 EN→KO 전용)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient.mockReturnValue(fakeLlm());

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
    mockCreateClient.mockReturnValue(fakeLlm());

    const response = await POST(
      postRequest({
        text: '확인해 주세요.',
        context: { languageDirection: 'en-ko', channel: 'web' },
      }),
    );
    const body = await response.json();

    expect(body.warnings).toEqual([]);
  });

  it('AC-030 — 응답 어디에도 OPENAI_API_KEY 값이 노출되지 않는다', async () => {
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-test-secret-value-should-not-leak';
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient.mockReturnValue(fakeLlm());

    const response = await POST(
      postRequest({ text: 'hello', context: { languageDirection: 'ko-en', channel: 'web' } }),
    );
    const bodyText = await response.text();

    expect(bodyText).not.toContain('sk-test-secret-value-should-not-leak');
    process.env.OPENAI_API_KEY = previous;
  });

  it('C1 응답이 스키마 검증에 실패하면 502 LLM_MALFORMED를 반환한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient.mockReturnValue(fakeLlm({ urgencyContent: '유효하지 않은 JSON' }));

    const response = await POST(
      postRequest({ text: 'hello', context: { languageDirection: 'ko-en', channel: 'web' } }),
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error.code).toBe('LLM_MALFORMED');
  });

  it('C4 응답이 스키마 검증에 실패하면 502 LLM_MALFORMED를 반환한다', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient.mockReturnValue(fakeLlm({ backTranslationContent: '유효하지 않은 JSON' }));

    const response = await POST(
      postRequest({ text: 'hello', context: { languageDirection: 'ko-en', channel: 'web' } }),
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error.code).toBe('LLM_MALFORMED');
  });

  it('C1이 fallback이고 C4가 live면 응답 source는 신뢰도가 낮은 쪽(fallback)을 따른다(AC-041)', async () => {
    mockResolveSession.mockResolvedValue({ userId: 'user-1' });
    mockCreateClient.mockReturnValue(
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
    mockCreateClient.mockReturnValue(
      fakeLlm({ urgencySource: 'live', backTranslationSource: 'cache' }),
    );

    const response = await POST(
      postRequest({ text: 'hello', context: { languageDirection: 'ko-en', channel: 'web' } }),
    );
    const body = await response.json();

    expect(body.source).toBe('cache');
  });
});
