/**
 * T6 — `POST /api/mediate`를 실제로 호출해 <BackTranslationPreview>를 그리는 최소 폼.
 * 🔴 UX-004 전체 화면(긴급도 override, 티켓 링크, 공휴일 충돌 등)은 이 컴포넌트의 범위가
 * 아니다 — 그 화면은 T12/T13이 만든다(`apps/web/app/(app)/mediate/page.tsx` 원래 주석
 * "실제 화면은 T12/T13이 채운다" 참조). 이 폼은 T6의 AC-030 동적 검증(브라우저에서 실제
 * 요청 1건 실행)이 가능하도록 최소한의 입력→호출→결과 표시만 제공한다.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MediationDemoForm } from './MediationDemoForm';

describe('MediationDemoForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('실행 버튼을 누르면 POST /api/mediate를 호출하고 역번역 결과를 표시한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        backTranslation: 'Please confirm by tomorrow.',
        warnings: [],
        source: 'live',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MediationDemoForm />);

    fireEvent.change(screen.getByLabelText('메시지'), {
      target: { value: '내일까지 확인 부탁드립니다.' },
    });
    fireEvent.click(screen.getByRole('button', { name: '실행' }));

    await waitFor(() => {
      expect(screen.getByText('Please confirm by tomorrow.')).toBeTruthy();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/mediate',
      expect.objectContaining({ method: 'POST' }),
    );
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(requestBody.text).toBe('내일까지 확인 부탁드립니다.');
    // Major 3 — live 응답에는 "폴백 응답 사용 중" 라벨이 없다.
    expect(screen.queryByText('폴백 응답 사용 중')).toBeNull();
  });

  // Major 3(reviewer 5차 REJECTED → 수정) — `docs/UX.md:918`. `result.source`를 무시하면 캐시
  // 응답이 이 라벨 없이 나갈 수 있었다(`apps/web/lib/llm/openai.ts:253`로 `source:'cache'`는
  // 실제 도달 가능).
  it('API가 source:"cache"를 반환하면 "폴백 응답 사용 중" 라벨을 표시한다(AC-041)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        backTranslation: 'Please confirm by tomorrow.',
        warnings: [],
        source: 'cache',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MediationDemoForm />);

    fireEvent.change(screen.getByLabelText('메시지'), {
      target: { value: '내일까지 확인 부탁드립니다.' },
    });
    fireEvent.click(screen.getByRole('button', { name: '실행' }));

    await waitFor(() => {
      expect(screen.getByText('폴백 응답 사용 중')).toBeTruthy();
    });
  });

  // Major 1(QA 6차 NO-GO → 수정) — `docs/UX.md:912` "Duplicate/double-click submission": "Every
  // submit-type control disables itself immediately on click until the request resolves." ·
  // `docs/UX.md:904` "Loading": "never a bare unlabeled spinner beyond ~1s."
  it('요청이 처리 중일 때는 실행 버튼이 비활성화되고 로딩 표시를 보여준다(중복 제출 방지)', async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    const pending = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(pending);
    vi.stubGlobal('fetch', fetchMock);

    render(<MediationDemoForm />);

    fireEvent.change(screen.getByLabelText('메시지'), { target: { value: '테스트 문구' } });
    const button = screen.getByRole('button', { name: '실행' }) as HTMLButtonElement;
    fireEvent.click(button);

    await waitFor(() => {
      expect(button.disabled).toBe(true);
    });
    expect(screen.getByText(/처리 중/)).toBeTruthy();

    resolveFetch({
      ok: true,
      json: async () => ({
        backTranslation: 'Please confirm by tomorrow.',
        warnings: [],
        source: 'live',
      }),
    });

    await waitFor(() => {
      expect(button.disabled).toBe(false);
    });
  });

  // Major 4(QA 6차 NO-GO → 수정) — `docs/UX.md:924` "Personalization-off indicator"
  // (AC-059③/AC-066③): "the screen shows an explicit, visible statement that personalization
  // is off and only base conversion is applied." `route.ts`는 이미 `personalizationApplied`를
  // 반환하지만 화면이 무시했다.
  it('personalizationApplied가 false면 개인화 미적용 안내를 표시한다(AC-059③/AC-066③)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        backTranslation: 'Please confirm by tomorrow.',
        warnings: [],
        source: 'live',
        personalizationApplied: false,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MediationDemoForm />);

    fireEvent.change(screen.getByLabelText('메시지'), {
      target: { value: '내일까지 확인 부탁드립니다.' },
    });
    fireEvent.click(screen.getByRole('button', { name: '실행' }));

    await waitFor(() => {
      expect(screen.getByText('개인화 미적용 — 기본 변환만 적용되었습니다')).toBeTruthy();
    });
  });

  it('personalizationApplied가 true면 개인화 미적용 안내를 표시하지 않는다', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        backTranslation: 'Please confirm by tomorrow.',
        warnings: [],
        source: 'live',
        personalizationApplied: true,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MediationDemoForm />);

    fireEvent.change(screen.getByLabelText('메시지'), {
      target: { value: '내일까지 확인 부탁드립니다.' },
    });
    fireEvent.click(screen.getByRole('button', { name: '실행' }));

    await waitFor(() => {
      expect(screen.getByText('Please confirm by tomorrow.')).toBeTruthy();
    });
    expect(screen.queryByText('개인화 미적용 — 기본 변환만 적용되었습니다')).toBeNull();
  });

  it('API가 오류를 반환하면 실패 배너를 보여주고 원문 입력을 지우지 않는다(AC-029)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { code: 'INTERNAL', message: '처리 중 오류', retryable: true } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MediationDemoForm />);

    fireEvent.change(screen.getByLabelText('메시지'), { target: { value: '테스트 문구' } });
    fireEvent.click(screen.getByRole('button', { name: '실행' }));

    await waitFor(() => {
      expect(screen.getByText('처리에 실패했습니다')).toBeTruthy();
    });

    expect((screen.getByLabelText('메시지') as HTMLTextAreaElement).value).toBe('테스트 문구');
  });
});
