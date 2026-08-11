'use client';

import { LENGTH_COUNTER_SHOW_AT, SOFT_LENGTH_CAP } from '@cross-border/core';
import type { MediationResult, UrgencyLevel } from '@cross-border/core';
import { isValidEmailFormat } from '../lib/validate-email';
import { BackTranslationPreview } from './BackTranslationPreview';
import { ComparisonView } from './ComparisonView';
import { HolidayConflictWarning } from './HolidayConflictWarning';
import { MisreadRiskPanel } from './MisreadRiskPanel';
import { UrgencyPanel } from './UrgencyPanel';
import styles from './SenderPanel.module.css';

export interface SenderPanelProps {
  text: string;
  onTextChange: (value: string) => void;
  recipient: string;
  onRecipientChange: (value: string) => void;
  status: 'idle' | 'loading' | 'error' | 'success';
  result: MediationResult | null;
  urgencyOverride: UrgencyLevel | null;
  onOverride: (value: UrgencyLevel) => void;
  isOverridden: boolean;
  displayedUrgency: UrgencyLevel | null;
  /** 🔴 부모(`MediationWorkspace`)가 실제 `/api/mediate` 호출을 담당한다 — 이 컴포넌트는 클릭만 알린다. */
  onRunMediation: () => void;
  /**
   * 🔴 M-2(2026-08-05, reviewer REJECTED → 수정) — 승인 가능한 스냅샷(`approvalSnapshot`)이
   * 있는지. 결과 블록(등급/비교/오해 위험/역번역, 특히 폴백 배지)의 표시 여부를 `status==='success'`
   * 단독으로 판정하면, 재실행이 실패했을 때(`status==='error'`) 직전 성공 결과가 남아 있어도
   * 블록 전체가 사라진다 — `RecipientPanel`은 이미 `hasResult`(스냅샷 존재)로 승인 가능 여부를
   * 판정하므로, 그 사이에 "폴백 응답 사용 중" 라벨만 사라진 채로 승인 가능한 상태가 될 수 있었다
   * (AC-041 위반). `MediationWorkspace`의 `hasResult`(=`approvalSnapshot !== null`)를 그대로 받는다.
   */
  hasResult: boolean;
  /**
   * 🔴 MJ-5(사용자 지시 유지보수 라운드) — `ComparisonView`/`BackTranslationPreview`에 넘기는
   * 원문. 라이브 `text` state가 아니라 **승인 대상 스냅샷 시점의 원문**(`approvalSnapshot.text`,
   * `MediationWorkspace`)을 받는다. 재실행 실패 후(hasResult는 유지된 채) 원문을 편집하면,
   * 라이브 `text`는 이미 검토되지 않은 새 값이 되지만 `transformed`/`backTranslation`은 여전히
   * 스냅샷 시점의 원문을 기준으로 생성된 것이다 — 이 prop을 쓰면 원문·변환문·역번역이 항상 같은
   * 시점의 짝을 이룬다. (승인 자체는 `isStale`이 이미 막으므로 오발송으로 이어지지는 않았지만,
   * 화면에 잘못된 조합이 보이는 표시 결함이었다.)
   */
  originalTextSnapshot: string;
  /**
   * 🔴 T54/AC-057②③ — "이 마감일은 상대 국가 연휴 N일차입니다" 경고. `HolidayConflictWarning`이
   * 빈 배열이면 아무것도 렌더하지 않는다(AC-063①). CRITICAL 메시지에서는 부모(`MediationWorkspace`)
   * 가 이미 빈 배열을 넘긴다 — "기한 재협상" 링크가 열 UX-005 자체가 CRITICAL에서 존재할 수 없기
   * 때문(AC-005, T40과 같은 게이트). 기본값 `[]` — 기존 호출부를 깨지 않기 위한 선택적 prop이다.
   */
  holidayConflicts?: MediationResult['holidayConflicts'];
  /** "기한 재협상" 클릭 시 호출된다 — 모달을 그 기한으로 여는 것은 부모의 책임이다. */
  onNegotiateDeadline?: (deadlineIso: string) => void;
}

/**
 * T13 — UX-004 발신자 패널(AC-009 2패널 중 좌측). 메시지 작성 + 실행 + 결과(등급/비교/오해
 * 위험/역번역)를 담는다.
 *
 * Validation(`docs/UX.md` UX-004): 수신자 식별자 필수(이메일 형식), 메시지 텍스트 필수. 형식
 * 오류는 필드 아래 인라인 표시, 값이 유효해지면 사라진다. "실행"은 둘 다 유효할 때만 활성화된다.
 */
export function SenderPanel({
  text,
  onTextChange,
  recipient,
  onRecipientChange,
  status,
  result,
  onOverride,
  isOverridden,
  displayedUrgency,
  onRunMediation,
  hasResult,
  originalTextSnapshot,
  holidayConflicts = [],
  onNegotiateDeadline,
}: SenderPanelProps) {
  const trimmedRecipient = recipient.trim();
  const recipientFormatInvalid = trimmedRecipient !== '' && !isValidEmailFormat(trimmedRecipient);
  const canRun =
    text.trim() !== '' &&
    trimmedRecipient !== '' &&
    !recipientFormatInvalid &&
    status !== 'loading';

  return (
    <section aria-label="발신자 패널">
      <h2 className={styles.title}>발신자</h2>
      <div className={styles.fieldGroup}>
        <label htmlFor="sender-recipient">받는 사람</label>
        <input
          id="sender-recipient"
          type="text"
          value={recipient}
          onChange={(event) => onRecipientChange(event.target.value)}
        />
        {recipientFormatInvalid && (
          <p className={styles.fieldError}>받는 사람은 이메일 형식이어야 합니다.</p>
        )}
      </div>

      <div className={styles.fieldGroup}>
        <label htmlFor="sender-text">메시지</label>
        <textarea
          id="sender-text"
          className={styles.message}
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          aria-describedby={text.length >= LENGTH_COUNTER_SHOW_AT ? 'sender-text-counter' : undefined}
        />
        {/* AC-061 — 하드 차단 아님(②), 자문 전용. `docs/UX.md` v6.2 고정 문구·접근성(키
            입력마다 announce하지 않고 aria-describedby로만 연결). */}
        {text.length >= LENGTH_COUNTER_SHOW_AT && (
          <p id="sender-text-counter" className={styles.lengthCounter}>
            {text.length.toLocaleString('ko-KR')} / {SOFT_LENGTH_CAP.toLocaleString('ko-KR')}자
          </p>
        )}
      </div>

      {/* T16(AC-029, docs/UX.md:1015) — 실패 상태에서는 같은 버튼이 "다시 시도"로 바뀐다. 별도
          버튼을 추가하지 않는 이유: 핸들러(onRunMediation)가 동일하고("재시도 = 재실행"), 버튼을
          하나 더 두면 실패 상태에서 "실행"과 "다시 시도" 두 개가 동시에 보여 혼란을 준다. */}
      <button
        type="button"
        className={styles.runButton}
        onClick={onRunMediation}
        disabled={!canRun}
      >
        {status === 'error' ? '다시 시도' : '실행'}
      </button>
      {/* T16(AC-029, docs/UX.md:1013) — 단계 라벨 진행 표시. `docs/UX.md`의 예시 문구를 그대로
          쓰는 정적 텍스트다(타이머로 단계를 전환하지 않는다) — 판단 근거는
          `MediationWorkspace.tsx` 헤더 주석 "T16 — 진행 표시 방식" 참조. */}
      {status === 'loading' && (
        <p role="status" className={styles.loadingText}>
          분류 중 → 변환 중 → 역번역 중
        </p>
      )}
      {status === 'error' && (
        <p role="alert" className={styles.errorText}>
          처리에 실패했습니다
        </p>
      )}

      {/* M-2 — `status === 'success'` 단독이 아니라 `hasResult`(승인 가능한 스냅샷 존재)도
          함께 본다. 재실행이 실패해도(status==='error') 직전 성공 결과와 그 폴백 배지가
          유지되어야 RecipientPanel의 승인 가능 상태와 일치한다. */}
      {(status === 'success' || hasResult) && result && (
        <div className={styles.resultBlock}>
          {displayedUrgency && (
            // 🔴 (2026-08-05 — C-1, reviewer REJECTED → 수정, F1-e·ADR-0009 D3) `stepSources.c1`을
            // 넘긴다 — ADR-0009 D3 매핑표가 "c1 → UrgencyPanel.tsx"를 지정했는데 이전 배선에는 이
            // 컴포넌트에 출처를 넘기는 경로 자체가 없어, c1만 fallback이고 c2/c4가 live일 때 화면
            // 어디에도 폴백 배지가 뜨지 않는 AC-041 회귀가 있었다.
            <UrgencyPanel
              urgency={displayedUrgency}
              urgencyReason={result.urgencyReason}
              isOverridden={isOverridden}
              onOverride={onOverride}
              // Minor(방어적, 사용자 지시 유지보수 라운드) — 계약(F1)상 `stepSources`는 필수
              // 필드지만, 유일한 생산자(`route.ts`) 밖의 경로(배포 스큐, 향후 확장 어댑터 스텁 등)
              // 가 이 필드를 채우지 못한 응답을 보낼 가능성까지 방어한다.
              // 🔴 M1(reviewer round-3 비차단 Major, 2026-08-06 수정) — `?? 'live'`는 정보가 없는
              // 상황을 "라이브"로 지어내, 실제로는 `source:'fallback'`인 응답에서도 폴백 배지가
              // 뜨지 않게 만들었다(AC-041 위반, `docs/CodingRules.md` Error Handling: 없는 값을
              // 지어내지 않는다). 없으면 구 계약 필드인 집계 `source`로 degrade한다 —
              // ADR-0009 이전 동작(단일 `source` 기준 배지)으로 안전하게 물러날 뿐, 정보를
              // 지어내지 않는다.
              source={result.stepSources?.c1 ?? result.source}
            />
          )}
          {/* AC-008 — 원문/변환문/변환 이유 3열 비교 + AC-007 보존 항목 표시.
              MJ-5 — 원문은 스냅샷 시점 값(originalTextSnapshot)을 쓴다(라이브 text 아님).
              🔴 (2026-08-05 복원 — F1-e, DECISIONS #48 · ADR-0009) Major 2(2026-08-05)가 되돌렸던
              폴백 배지를 정확한 값으로 복원한다. `MediationResult.source`(C1/C2/C4를 합친 단일 값)
              대신 `result.stepSources.c2`를 넘긴다 — 이 영역이 보여주는 변환문/변환 이유는 C2
              산출물이므로 C2 전용 출처만 봐야 라이브 콘텐츠를 폴백으로 오표시하지 않는다
              (ADR-0009 D3 매핑표, `ComparisonView.tsx` 헤더 주석 참조). */}
          <ComparisonView
            originalText={originalTextSnapshot}
            transformed={result.transformed}
            reason={result.reason}
            preserved={result.preserved}
            // Minor(방어적) — SenderPanel.tsx의 UrgencyPanel 배선과 같은 이유.
            // M1(2026-08-06) — 같은 이유로 `?? result.source`로 수정(정보를 지어내지 않는다).
            source={result.stepSources?.c2 ?? result.source}
          />
          {/* AC-043 — 오해 사전 경고. 승인(Approve & Send, RecipientPanel) 이전 단계인 이 화면에서
              항상 먼저 렌더된다. 빈 배열이면 컴포넌트 자체가 아무것도 그리지 않는다.
              🔴 `variant="full"` 고정 — `docs/UX.md` UX-004 States "MisreadRisk"는 Full/Reduced 중
              어느 쪽이 live인지를 "구현/일정 판단이며 사용자별 설정이 아니다"로 명시한다(Planning
              Decision #57). 지금 이 태스크 범위(T12/T13/T14)에는 일정 압박으로 축소해야 한다는
              신호가 없으므로 정보량이 더 많은 Full을 기본으로 택했다 — Reduced로 바꾸는 것은
              `MisreadRiskPanel`의 `variant` prop 하나만 바꾸면 되고, 데이터 생성(T10)에는 영향이
              없다(같은 패턴이 이미 존재 — "표시만 축소되고 데이터는 항상 동일"). */}
          <MisreadRiskPanel risks={result.misreadRisks} variant="full" />
          {/* T54 — HolidayConflict 상태. `holidayConflicts`가 빈 배열이면(충돌 없음·데이터 없는
              국가 둘 다) 이 컴포넌트가 아무것도 렌더하지 않는다(AC-063①). */}
          <HolidayConflictWarning conflicts={holidayConflicts} onNegotiate={onNegotiateDeadline} />
          {/* MJ-5 — 여기도 스냅샷 시점 원문을 쓴다(역번역은 스냅샷 시점 변환문의 역번역이므로,
              라이브 text와 짝지으면 편집 후 원문·역번역이 서로 다른 시점의 값이 된다).
              🔴 (2026-08-05 갱신 — F1-e, DECISIONS #48 · ADR-0009) `result.source`(합산값) 대신
              `result.stepSources.c4`를 넘긴다 — 폴백 c4 문구는 폴백 c2 문구를 역번역한 고정
              문자열이라(`packages/core/src/data/fallback-responses.ts:58~62`·`:96~100`), C2가
              실제로 라이브면 그 역번역이 화면의 실제 변환문과 무관해지는 정확성 문제가 있다
              (AC-001/AC-002). C4 전용 출처를 봐야 이 영역의 안전장치 표시가 정확하다. */}
          <BackTranslationPreview
            originalText={originalTextSnapshot}
            backTranslation={result.backTranslation}
            warnings={result.warnings}
            // Minor(방어적) — SenderPanel.tsx의 UrgencyPanel 배선과 같은 이유.
            // M1(2026-08-06) — 같은 이유로 `?? result.source`로 수정(정보를 지어내지 않는다).
            source={result.stepSources?.c4 ?? result.source}
          />
          {result.personalizationApplied === false && (
            <p role="status" className={styles.personalizationNote}>
              개인화 미적용 — 기본 변환만 적용되었습니다
            </p>
          )}
        </div>
      )}
    </section>
  );
}
