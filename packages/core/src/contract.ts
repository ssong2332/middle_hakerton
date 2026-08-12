/**
 * 코어 I/O 계약 — 🔒 **Freeze Point 1 (F1)**
 *
 * `docs/Architecture.md` "동결 지점(Freeze Points)" 표의 F1이며, `docs/Tasks.md` T1의 산출물이다.
 * **프론트·백엔드·확장이 참조하는 스키마는 이 파일 하나뿐**이다(AC-027).
 * HTTP 표현(경로·상태코드·에러 봉투)은 `docs/API.md`가 소유하며, 그 문서의
 * `POST /api/mediate` Response 200 행이 *"`packages/core/src/contract.ts` 가 단일 출처"* 라고
 * 이 파일을 역참조한다 — 두 문서가 어긋나면 이 파일이 아니라 양쪽을 함께 고쳐야 한다.
 *
 * ## 이 파일이 지켜야 할 제약 (변경 전에 읽을 것)
 *
 * 1. **런타임 import 0개.** `zod`를 포함해 어떤 값도 import하지 않는다.
 *    입력 검증의 소유자는 HTTP 경계(`apps/web/lib/http.ts` 의 `withApi()`)이며
 *    core는 **이미 검증된 타입만** 받는다(`docs/Architecture.md` Security "Input validation
 *    boundaries" ①, `docs/API.md` Conventions "입력 검증"). core 안에 재검증을 만들지 않는다.
 * 2. **구현 코드·함수 본문 금지.** `docs/CodingRules.md` Directory Rules:
 *    *"`packages/core/src/contract.ts` … 타입·interface·enum 외의 export가 있으면 위반."*
 * 3. **필드 배치를 재설계하지 않는다.** `docs/Architecture.md:245` — *"필드 배치 판정은 이미
 *    Planning Decision #49 / T1이 확정했다 — architect는 이를 바꾸지 않고 형식만 고정한다."*
 *    아래 각 필드의 TSDoc이 그 판정의 근거를 담고 있으므로, "정리"·"통합" 목적의 변경은
 *    근거를 지우는 변경이다.
 * 4. **없는 값을 지어내지 않는다.** 빈 배열 `[]` / `null` / `'불명'` / `'없음'` 은 **정상값**이다
 *    (`docs/CodingRules.md` Error Handling 마지막 두 행, AC-020/043②/047②/050①/059②).
 *    기본값·추측값으로 채우는 코드가 곧 AC 위반이다.
 *
 * ## 선택적(`?`) 프로퍼티를 쓰지 않는 이유
 *
 * `docs/API.md` 는 HTTP 요청 body에서 `recipient?` · `urgencyOverride?` 처럼 선택적 표기를 쓰지만,
 * 이 파일은 **전부 필수 프로퍼티 + `| null`** 로 고정한다. `undefined`(키 없음)와 `null`(값 없음)이
 * 섞이면 "값이 비었다"를 판정하는 코드가 호출부마다 갈라지고, 그 갈라짐이 정확히 위 제약 4가
 * 막으려는 실수("비어 있으니 기본값을 채우자")를 부른다. zod 파싱 단계에서 누락 키를 `null` 로
 * 정규화해 core에 넘긴다.
 */

import type { DecisionAuthorityJudged } from './rules/decision-authority';

// ─────────────────────────────────────────────────────────────────────────────
// 공용 스칼라 타입
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 이 제품이 다루는 언어. **KO↔EN 2개뿐**이며 제3언어를 추가하지 않는다.
 * 근거: PRD의 변환 관련 AC가 전부 두 방향만 규정한다(AC-045 KO→EN / AC-046 EN→KO)
 * — `docs/API.md` 의 `languageDirection: 'ko-en' | 'en-ko'` 가 같은 사실의 HTTP 표현이다.
 */
export type LanguageCode = 'ko' | 'en';

/** 변환 방향. `'ko-en'` = 한국어 원문 → 영어 변환문. (`docs/API.md` `POST /api/mediate` Request) */
export type LanguageDirection = 'ko-en' | 'en-ko';

/**
 * 중재를 호출한 어댑터. 웹앱과 확장이 **같은 엔드포인트·같은 core**를 쓰고(AC-028),
 * 이 값은 분기용이 아니라 기록·표시용이다 — 이 값으로 변환 로직을 갈라놓으면
 * "동일 인터페이스로 두 어댑터에서 호출"이라는 AC-028의 판정이 무의미해진다.
 */
export type RequestChannel = 'web' | 'extension';

/** 긴급도 3단계 (AC-003). 사용자가 override할 수 있다(AC-004 · `RequestContext.urgencyOverride`). */
export type UrgencyLevel = 'CRITICAL' | 'NORMAL' | 'LOW';

/**
 * `UrgencyLevel`의 한국어 화면 표시 라벨 — 값 자체(`'CRITICAL'`/`'NORMAL'`/`'LOW'`)는 API
 * 계약·override `<select>`의 `value`로 계속 쓰이지만(변경 시 웹앱·확장·백엔드 3곳이 동시에
 * 깨진다), 사용자에게 보이는 텍스트는 이 리포의 다른 모든 UI 문구와 마찬가지로 한국어여야
 * 한다. (2026-08-12, 사용자가 확장 배지에서 "긴급도: NORMAL"이 그대로 노출된 것을 발견 —
 * 웹앱 `UrgencyPanel.tsx`도 같은 문제였다, 이 리포 전역에 이 값을 표시하는 곳이 둘 다 raw
 * enum을 그대로 렌더하고 있었다. 웹/확장이 각자 다른 라벨을 만들지 않도록 여기 한 곳에만
 * 정의한다.) */
export const URGENCY_LABELS: Record<UrgencyLevel, string> = {
  CRITICAL: '긴급',
  NORMAL: '보통',
  LOW: '낮음',
};

/**
 * 공휴일 데이터를 보유한 국가 (AC-057 — 한국·미국·일본·중국. **영국은 제외**되고 일본이 추가됐다).
 * 🔴 이 목록에 없는 국가는 타입으로 표현하지 않고 `null` 로 둔다 — "휴일 데이터 없음"은
 * **내부 상태로만** 존재하고 화면에는 어떤 라벨도 렌더하지 않는다(AC-063 ①②).
 * `docs/Database.md` `sent_messages.recipient_country` 의 CHECK 제약과 같은 어휘다.
 */
export type CountryCode = 'KR' | 'US' | 'JP' | 'CN';

/**
 * 이 응답이 어디서 나왔는가 (AC-041).
 * - `live` — OpenAI 실호출
 * - `cache` — `llm_cache` 적중(LLM 호출 0건)
 * - `fallback` — 🔴 API 실패·요청 상한 초과·크레딧 소진으로 **사전 준비된 데모 응답**을 쓴 상태.
 *   UI는 이 값을 읽어 "폴백 응답 사용 중" 배지를 띄운다 — 실제 LLM 결과처럼 보이면 AC-041 위반이다.
 */
export type ResponseSource = 'live' | 'cache' | 'fallback';

// ─────────────────────────────────────────────────────────────────────────────
// 입력 (Input)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * C3 자기신고 커뮤니케이션 프로필 (AC-011 · AC-046② · AC-059).
 * 값 어휘는 `docs/Database.md` `profiles` 테이블의 CHECK 제약과 **1:1로 일치**한다.
 *
 * 🔴 **빈 프로필이 정상 상태다.** 온보딩을 건너뛴 계정(AC-059 ①②)은 스타일 4개 필드가
 * 전부 `null` 이며, 여기에 기본값·추측값을 채우면 AC-059 ②를 깬다. 파이프라인은 이 상태에서
 * C3 단계를 **건너뛰고**(`docs/Architecture.md` Data Flow ③) `MediationResult.personalizationApplied`
 * 를 `false` 로 반환한다.
 */
export interface CommunicationProfile {
  /**
   * 🔴 `not_started`(아직 온보딩 화면에 가지 않음)와 `skipped`(보고 건너뜀)를 **합치지 않는다**
   * — `docs/Database.md` `profiles.onboarding_state`: *"같은 값으로 합치는 최적화는 금지."*
   * 두 값을 구분할 수 있어야 UX-004/016/009가 "개인화 미적용"을 정확히 렌더한다(AC-059 ③).
   */
  onboardingState: 'not_started' | 'skipped' | 'completed';
  /** 직설/완곡 성향. 미응답·스킵이면 `null`(AC-011). */
  directness: 'direct' | 'indirect' | null;
  /** 이모지 선호. AC-056 ② 이모지 경고 **억제** 판정의 입력. 미응답이면 `null`. */
  emojiPreference: 'likes' | 'neutral' | 'avoids' | null;
  /** 격식도. 미응답이면 `null`(AC-011). */
  formality: 'high' | 'medium' | 'low' | null;
  /**
   * 존댓말 레벨 — `hapsyo`(합쇼체) / `haeyo`(해요체). EN→KO 변환의 종결어미 레벨 기본값(AC-046 ②).
   * 미응답이면 `null` 이며, 이 경우에도 **한 메시지 안의 레벨 혼용은 0건**이어야 한다(AC-046 ①).
   * 해당 상대에 대한 쌍방 규약이 있으면 **규약이 이 값을 이긴다**(Planning Decision #26).
   */
  honorificLevel: 'hapsyo' | 'haeyo' | null;
}

/**
 * #24 쌍방 커뮤니케이션 규약 — 두 사람이 **합의해 확정한** 4축 (AC-037).
 * 값 어휘는 `docs/Database.md` `pair_protocols` 의 CHECK 제약과 일치한다.
 *
 * 🔴 **축을 5개로 늘리지 않는다** — AC-073 ②는 5번째 축이 물리적으로 존재할 수 없기를 요구하고,
 * `docs/API.md` `PUT /api/protocol` 은 축을 늘리는 요청을 400으로 거부한다.
 * 🔴 프로필(`CommunicationProfile`)과 충돌하면 **규약이 우선**한다(AC-037 · Planning Decision #26).
 *
 * `authorship_state`(누가 정한 규칙인가 — AC-075)는 **의도적으로 여기 없다**: 그것은 UX-011의
 * 배지와 AC-074 ④ 경합 판정의 입력이지 변환 로직의 입력이 아니다. core가 읽지 않는 값을
 * 계약에 넣으면 "core는 화면을 모른다"는 경계가 흐려진다.
 */
export interface PairProtocol {
  /** 직설 허용 여부. 합의된 값이 없으면 `null`(추측하지 않는다). */
  directnessAllowed: 'yes' | 'no' | null;
  /** 이모지 정책. `'ok'` 면 이모지 경고를 **띄우지 않는다**(AC-056 ②). 합의 없으면 `null`. */
  emojiPolicy: 'ok' | 'avoid' | null;
  /** 합의된 호칭 표기. 자유 문자열이며 합의 없으면 `null`(AC-047 ②의 추측 생성 금지와 같은 원칙). */
  addressForm: string | null;
  /** 합의된 마감 표현 방식. 합의 없으면 `null`. */
  deadlineStyle: string | null;
}

/**
 * 발신자 컨텍스트 — `docs/Architecture.md:224` 의 주석 *"프로필(빈 상태 가능) + 언어"* 를 형식화한 것.
 *
 * 🔴 **세션에서 도출되며 클라이언트가 body로 보내지 않는다**(`docs/API.md` `POST /api/mediate`
 * Request: *"`sender` 는 세션에서 도출하므로 body에 받지 않는다 — 클라이언트가 남을 사칭할 수 없게"*).
 */
export interface SenderContext {
  /** 발신자가 쓴 원문의 언어. `RequestContext.languageDirection` 의 앞쪽 값과 같다. */
  language: LanguageCode;
  /** C3 프로필. 🔴 **빈 상태(`skipped`/`not_started`)가 정상 입력이다**(AC-059). */
  profile: CommunicationProfile;
}

/**
 * 수신자 컨텍스트 — 개인화(프로필·규약·타임존)의 입력.
 *
 * 🔴 **`MediationInput.recipient` 자체가 `null` 일 수 있다**(AC-066 ①). 층 1 확장에서 수신자를
 * 지정하지 않아도 선택 → 중재 → 승인 → 클립보드 복사 전 경로가 완결되어야 하며, 이때
 * 시스템이 **추측으로 수신자를 만들어 채우지 않는다**(AC-066 ④). 그 상태의 결과는
 * `personalizationApplied: false` 로 나가고 패널이 "개인화 미적용"을 표시한다(AC-066 ③).
 */
export interface RecipientContext {
  /** 수신자 식별자(이메일 문자열). 🔴 **가입 회원이 아니어도 중재는 정상 완료된다**(AC-065 ①). */
  identifier: string;
  /** 이 상대와의 합의 규약. 없으면 `null` — 없음이 정상이며 기본 규약을 만들어 넣지 않는다(AC-037). */
  protocol: PairProtocol | null;
  /**
   * 마감일 ↔ 연휴 충돌 판정(AC-057)에 쓰는 수신자 국가.
   * 🔴 데이터가 없는 국가·미상이면 `null` 이고, 이 경우 `MediationResult.holidayConflicts` 는
   * **빈 배열**이 되며 화면에는 "휴일 데이터 없음" 라벨조차 렌더하지 않는다(AC-063 ①).
   */
  country: CountryCode | null;
  /**
   * IANA 타임존 문자열. 🔴 **사용자가 확정해야 채워진다** — `location` 문자열로부터 자동 확정하지
   * 않는다(AC-065 ④ / AC-071 ③). 미확정이면 `null`.
   */
  timezone: string | null;
}

/**
 * 요청 컨텍스트 — `docs/Architecture.md:226` 의 주석 *"채널·언어방향·override 등"* 을 형식화한 것.
 */
export interface RequestContext {
  /** 변환 방향(AC-045 KO→EN / AC-046 EN→KO). */
  languageDirection: LanguageDirection;
  /** 호출한 어댑터. 변환 로직 분기용이 아니다(AC-028 — `RequestChannel` 참조). */
  channel: RequestChannel;
  /**
   * 사용자가 C1 판정을 손으로 바꾼 값 (AC-004). 🔴 override가 있으면 **이후 변환·발송 처리가
   * 이 값을 따른다** — 특히 `CRITICAL` 은 예약·지연 경로를 건너뛴다(AC-005).
   * 사용자가 바꾸지 않았으면 `null`(= C1 판정을 그대로 쓴다).
   */
  urgencyOverride: UrgencyLevel | null;
  /**
   * 발신자가 입력한 "필요 기한"(AC-036). 연휴 충돌 판정(AC-057)과 기한 협상(UX-005)의 입력.
   * 입력하지 않았으면 `null` 이며, 이때 `holidayConflicts` 는 빈 배열이다 — 오류가 아니다
   * (`docs/UX.md` UX-004 Assumptions).
   */
  needDeadline: string | null;
}

/**
 * 중재 요청 입력 — AC-027이 규정한 `{ text, sender, recipient, context }` **4개 필드가 전부**다.
 * 형태는 `docs/Architecture.md:222~227` 의 F1 코드 블록이 고정했다.
 */
export interface MediationInput {
  /**
   * 발신자가 쓴 원문.
   * 🔴 **길이 상한 검증을 걸지 않는다** — 5,000자는 소프트 캡(문자 수 표시용)이며, 초과해도
   * 입력이 잘리거나 변환이 차단되는 코드 경로가 존재하지 않는다(AC-061 ②).
   */
  text: string;
  /** 발신자 컨텍스트. 세션에서 도출된다. */
  sender: SenderContext;
  /** 🔴 **nullable** — 층 1 수신자 미지정 경로(AC-066). `RecipientContext` 주석 참조. */
  recipient: RecipientContext | null;
  /** 채널·언어방향·override 등 요청 단위 정보. */
  context: RequestContext;
}

// ─────────────────────────────────────────────────────────────────────────────
// 응답 (Result) — 구성 요소
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 톤 변환 과정에서 **잃으면 안 되는 것**으로 먼저 추출·고정된 항목 (AC-006 / AC-007).
 * 제품의 KEY 1("톤 교정이 아니라 번역 손실 방지")이 코드에서 관측되는 지점이다.
 *
 * 🔴 **누락된 항목은 이 배열에 넣지 않는다 — 빈 문자열로 채우지 않는다.**
 * AC-006은 테스트 케이스 10건에서 **누락 0건(10/10)** 을 요구하므로, "보존에 실패한 항목"이라는
 * 원소는 정상 응답에 존재할 수 없다. 원문에 보존 대상이 없으면 `preserved` 는 **빈 배열**이고,
 * 원소가 하나라도 있으면 그 원소의 `sourceText`·`transformedText` 는 **둘 다 실제 표현**이다.
 * (빈 문자열을 넣으면 `preserved.length` 로 보존 건수를 세는 검증이 누락을 성공으로 집계한다.)
 */
export interface PreservedItem {
  /**
   * 보존 대상 종류 — 마감일 / 수치 / 필수 액션. PRD의 세 어휘와 1:1로 대응하며
   * 임의로 4번째 종류를 늘리지 않는다(AC-006).
   */
  kind: 'deadline' | 'number' | 'action';
  /** 원문에서의 표현. */
  sourceText: string;
  /**
   * 변환문에서 이 항목에 대응하는 표현.
   * 🔴 `sourceText` 와 **문자열이 같을 필요는 없다** — AC-006은 *"'유지'는 의미·값의 보존을 뜻하며
   * 문자열 동일성을 요구하지 않는다"* 이고, 날짜 표기 정규화는 AC-049가 관장한다(Planning
   * Decision #53). 두 필드를 따로 두는 이유가 이것이다 — 하나로 합치면 정규화된 케이스를
   * "누락"으로 오판하게 된다.
   * UI는 이 값을 굵게 표시하고 "(보존됨)" 라벨을 함께 붙인다(AC-007, `docs/UX.md` UX-004 접근성).
   */
  transformedText: string;
}

/**
 * `warnings[]` 의 종류. 🔴 **타입 없는 경고 한 덩어리를 만들지 않는다** — `docs/UX.md` UX-004
 * States: *"each labeled by type, never a single unlabeled 'warning' blob."*
 *
 * 이 3종이 `warnings[]` 를 **재사용**하는 근거(`docs/Tasks.md` T1 ⓐ): 셋 다 *변환 결과*의 문제다.
 * *원문*이 상대에게 어떻게 읽히는지는 `misreadRisks[]` 가 담는다 — `MisreadRisk` 주석 참조.
 */
export type WarningType =
  /** R1 이모지 위험 (AC-056). 위험도 `높음`/`중간` + 허용 규약·프로필 값 없음일 때만 발생한다. */
  | 'emojiRisk'
  /** 한 메시지 안에서 합쇼체/해요체가 섞였다 (AC-046 ③). */
  | 'honorificLevelMixed'
  /** 용어사전에 없는 인물의 호칭 (AC-047 ②). 원문 형태를 유지하고 추측 생성하지 않는다. */
  | 'honorificNotRegistered';

/** 변환 *결과*에 대한 비차단 경고 (AC-046 ③ / AC-047 ② / AC-056). */
export interface Warning {
  /** 경고 종류. UI는 종류별로 다른 문구·동작을 렌더한다(`WarningType` 주석 참조). */
  type: WarningType;
  /**
   * 사용자에게 보이는 문구.
   * 🔴 이모지 경고는 **고정 문구**("이 이모지는 해석이 갈릴 수 있습니다 — 상대와 합의된 규칙이
   * 없습니다")이며, 어떤 경고 문구에도 **국가·국민성 서술을 넣지 않는다**(AC-056 ③,
   * `docs/Architecture.md` Conventions 7 — grep으로 검증 가능해야 한다).
   */
  message: string;
  /**
   * 경고가 가리키는 대상 — 미등록 인물의 이름 또는 문제가 된 이모지 등.
   * 🔴 지목할 대상이 없으면 `null` 이며 **지어내지 않는다.**
   *
   * ⚠️ **이 필드의 근거는 규범 명세가 아니다 — ux-design 확인이 필요하다.**
   * 출처는 `docs/UX.md:1009` 이고, 그 줄은 **`## Claude Design Prompts` 절**(:953 — 외부 목업
   * 생성용 프롬프트)에 속한다. 같은 문서가 :954에서 *"Mockups are visual references only;
   * this document remains the authoritative spec"* 라고 밝힌다.
   * 규범 항목인 **UX-004 States(:420)·Business Rules(:430)와 AC-047 ②** 어디에도
   * "미등록 인물의 **이름을 표시**한다"는 요구는 없다 — 그 셋이 요구하는 것은
   * `warnings[]` 에 "호칭 미등록" 항목이 **존재**하는 것까지다.
   * 즉 이 필드는 **명세가 요구해서가 아니라 렌더에 쓸 수 있게 열어 둔 것**이며,
   * 규범 States 행에 반영할지는 ux-design이 판단한다(implementer가 정할 사항이 아니다).
   */
  subject: string | null;
}

/**
 * 오해 사전 경고 — **원문이 상대에게 어떻게 읽히는지** (AC-043, Planning Decision #49).
 *
 * ## 🔴 `warnings[]` 에 합치지 않는 이유 4가지 (`docs/Tasks.md` T1 원문 — 지우지 말 것)
 * 1. **대상이 다르다.** `warnings[]` 는 *변환 결과*의 문제(R1 이모지 경고 등)를 담고,
 *    `misreadRisks[]` 는 *원문*이 상대에게 어떻게 읽히는지를 담는다.
 * 2. **구조가 다르다.** 단일 문자열이 아니라 3요소 구조체가 필요하다.
 * 3. 🔴 **합치면 AC-043의 판정이 불가능해진다.** AC-043 ②는 *"중립 케이스 4건에서 빈 배열이
 *    반환되어 근거 없는 위험을 지어내지 않는다"* 를 판정 조건으로 쓴다. 이모지 경고 하나만
 *    있어도 배열이 비지 않으므로, 합치는 순간 "빈 배열 = 위험 없음"이라는 판정 자체가 죽는다.
 * 4. **`reason` 으로 대신할 수 없다.** `reason` 은 변환 이유 1건을 담는 단일 필드라
 *    다건 리스트를 담을 수 없다.
 *
 * ## 3요소가 전부 필수인 이유
 * AC-043 ①이 (a) 인용 구간 (b) 예상되는 오해 (c) 근거 **셋을 모두 갖춰** 출력될 것을 요구한다.
 * 셋 중 하나라도 optional이면 "근거 없는 위험"이 타입을 통과한다. **근거를 못 만들면 항목을
 * 만들지 말고 배열을 비운다** — 이것이 AC-043 ②의 hallucination 방지 조항이다.
 *
 * 표시 시점은 **사용자가 변환문을 승인하기 전**이다(AC-043 ③).
 */
export interface MisreadRisk {
  /** (a) 원문에서 문제가 되는 **인용 구간**. */
  quote: string;
  /** (b) **예상되는 오해** — 예: "확인 부탁드립니다" → 상대가 '단순 참고'로 받아들여 액션을 취하지 않을 수 있음. */
  misreading: string;
  /** (c) 그렇게 판단한 **근거**. */
  evidence: string;
}

/**
 * 마감일과 수신자 국가 연휴의 충돌 (AC-057, 구 AC-048 ②).
 *
 * 🔴 **`warnings[]` 가 아니라 별도 배열인 이유**(`docs/Tasks.md` T1 ⓑ): 이것은 변환문의 문제가
 * 아니라 **일정 사실**이고, "데이터 없는 국가는 경고를 만들지 않는다"는 판정(AC-048 ④)에
 * **빈 배열**이 필요하기 때문이다.
 *
 * 🔴 **빈 배열의 두 원인은 화면에서 구분되지 않는다** — ① 충돌이 없다 ② 수신자 국가에 휴일
 * 데이터가 아예 없다. 두 경우 모두 **아무것도 렌더하지 않는다**(라벨·회색 배지·빈 박스 전부
 * 금지 — AC-063 ①). 구분은 내부 상태(`RecipientContext.country === null`)와 테스트 출력에만
 * 존재한다(AC-063 ②).
 *
 * 데이터 출처는 리포 내 정적 파일이며 **외부 API 호출이 0건**이다(AC-048 ① / Planning Decision #52).
 * P2 기능이 이 배열을 채우지만 **스키마는 T1에서 확정**한다 — 나중에 바꾸면 프론트·백엔드
 * 통합 재작업이 생긴다(`docs/Tasks.md` T1 ⓑ).
 */
export interface HolidayConflict {
  /** 충돌한 날짜(마감일). */
  date: string;
  /** 수신자 국가. 데이터가 있는 4개국 중 하나여야 한다 — `CountryCode` 주석 참조(AC-057). */
  country: CountryCode;
  /** 해당 공휴일 이름. */
  holidayName: string;
  /** 연휴 N일차 — UI 문구 "이 마감일은 상대 국가 연휴 N일차입니다"의 N (AC-057 ①). */
  dayIndex: number;
}

/**
 * C6 티켓 옵션 게이트의 **판정 근거** (AC-058 / F1-a).
 *
 * - `signal_present` — 티켓 변환을 제시할 근거가 있다. 이 값일 때만 `offered: true` 다.
 * - `signal_absent` — 제시하지 않는 것이 **정상 판정**인 상태(AC-058 ① 대조군).
 * - `undetermined` — 판정 근거를 얻지 못했다(C2 호출 실패·폴백 응답 등). 🔴 **fail-closed**.
 *
 * 🔴 `signal_absent` 와 `undetermined` 를 한 값으로 합치지 않는다. 화면에서는 둘 다 똑같이
 * 아무것도 렌더하지 않지만, 합치면 **QA가 AC-058 대조군 통과와 파이프라인 고장을 구별할 수
 * 없다**(`docs/Architecture.md` F1-a 이유 2 — AC-063 ②가 공휴일에 적용한 것과 같은 선례).
 * `docs/TestCases.md` 표 B의 T-E03(대조군)이 `undetermined` 로 통과하면 **AC 통과가 아니라 고장**이다.
 */
export type TicketOptionBasis = 'signal_present' | 'signal_absent' | 'undetermined';

/**
 * C6 티켓 변환 옵션을 제시했는가 (AC-058, DECISIONS #35 · ADR-0005).
 *
 * 판정처는 UX-004(중재 화면) 한 곳이며, `POST /api/ticket` 은 **자체 게이트를 만들지 않는다**
 * — 판정기가 둘이면 같은 입력이 두 가지로 갈린다(`docs/API.md` `POST /api/ticket` 게이트 행).
 * 소비처도 UX-004 한 곳이다. 확장 패널(UX-016)은 이 필드를 읽지 않는다(UF-004를 담당하지 않는다).
 *
 * 🔴 **점수·라벨·자연어 서술을 이 계약에 두지 않는다 — 누락이 아니라 명시적 판단이다.**
 * 근거는 `docs/Architecture.md` Security "C6 게이트 판정과 EU AI Act 방어선"(DECISIONS #35):
 * ① 점수·라벨을 payload에 두면 산출물의 성격이 "옵션 제시"에서 **"사람의 상태에 대한 등급 판정"**
 * 으로 바뀌어 PRD Risks의 EU AI Act Article 5(1)(f) 방어선 서술과 어긋난다.
 * ② 그런 이름이 계약에 생기면 **AC-070 ②의 코드 검색 판정에 잡음이 섞여** 검증 자체가 흐려진다.
 * `basis` 는 **enum 3값이 전부**이며 자유 문자열 자리를 만들지 않는다.
 *
 * 🔴 **저장·로그 대상이 아니다**: `POST /api/mediate` 는 저장하지 않고, `sent_messages` 에 대응
 * 컬럼이 없으며(AC-070 ②), 구조화 로그 필드 목록에도 추가하지 않는다(DECISIONS #27 불변).
 * AC-058의 증거는 **T11 회귀 검증셋의 실행 출력**이지 운영 로그가 아니다.
 *
 * 🔴 **F1-c (DECISIONS #38 · ADR-0006) — 판별 유니온.** 불변식
 * `offered === true` ⟺ `basis === 'signal_present'` 이 이제 **타입으로 강제**된다
 * (`docs/Architecture.md:404~407`). 이 타입의 값을 만드는 유일한 통로는
 * `rules/ticket-gate.ts` 의 `ticketOptionFrom()` 뿐이다 — 짝을 손으로 조립하지 않는다
 * (Conventions 13 위반 판정 ②).
 *
 * - `{ offered: true; basis: 'signal_present' }` — **화면이 읽는 유일한 값이 `true` 일 때만**
 *   "Convert to Task Ticket" 링크를 렌더한다(AC-058 ①).
 * - `{ offered: false; basis: 'signal_absent' | 'undetermined' }` — `false` 면 레이아웃에서
 *   **완전히 제거**한다 — 비활성·회색 링크 금지(AC-058 ②, `docs/UX.md` UX-004 TicketLinkAbsent
 *   "Absent-not-disabled controls"). `basis` 는 **내부 상태·테스트 출력 전용**이며 화면에
 *   렌더하지 않는다(`TicketOptionBasis` 주석 참조).
 */
export type TicketOption =
  | { offered: true; basis: 'signal_present' }
  | { offered: false; basis: 'signal_absent' | 'undetermined' };

/**
 * 🔴 **F1-e (2026-08-05 · DECISIONS #48 · ADR-0009) — 스텝별 출처(provenance).**
 * `POST /api/mediate` 한 번은 LLM을 **3회** 호출하며(C1 긴급도 · C2 톤 변환 · C4 역번역,
 * `docs/Architecture.md` Data Flow 1의 고정 순서 — AC-032), **출처는 호출마다 따로 결정된다**:
 * `apps/web/lib/llm/openai.ts` 의 `complete()` 안에서 `:253`(cache) · `:323`(live) ·
 * `:335`(fallback)가 판정되고, 스텝 자신도 스키마 검증 실패 시 폴백으로 강등한다
 * (`steps/c1.ts:92` · `steps/c2.ts:172` · `steps/c4.ts:102`). 즉 **세 값이 같다는 보장이 없다.**
 *
 * ## 🔴 단일 `source` 만으로는 표시가 불가능한 이유 (이 필드를 만든 근거)
 *
 * 1. **AC-041이 요구하는 것은 "폴백 중임을 화면에 표시"이고, `docs/UX.md` Interaction Patterns
 *    (:920)는 그 라벨을 *"near the result"* 에 두라고 규정한다.** 결과가 세 영역(등급 / 변환문 /
 *    역번역)으로 나뉘어 렌더되므로, 어느 영역이 통조림인지 모르면 라벨을 어디에도 정확히 붙일 수 없다.
 * 2. **두 방향의 오표시가 실재한다(measured).** `combineSource`(`apps/web/app/api/mediate/route.ts:82`)
 *    가 "가장 신뢰도 낮은 쪽이 이긴다"로 합치므로 ⓐ C2 live + C4 fallback → 라이브 변환문 옆에
 *    폴백 배지가 뜰 수 있고 ⓑ C2 fallback + C4 live → 통조림 변환문에 배지가 붙지 않을 수 있다.
 *    2026-08-05 라운드의 `ComparisonView.tsx` 배지 추가가 ⓐ 때문에 원복된 것이 이 필드의 발단이다.
 * 3. 🔴 **가장 큰 손실은 배지가 아니라 AC-001/AC-002다.** 폴백 c4 문구는 **폴백 c2 문구를
 *    역번역해 만든 고정 문자열**이다(`data/fallback-responses.ts:58~62`·`:96~100`). 따라서
 *    C2 live + C4 fallback이면 `backTranslation` 은 **화면에 보이는 `transformed` 의 역번역이 아니다** —
 *    "역번역으로 큰 오역을 걸러낸다"는 안전장치가 조용히 무력화된다. 이 상태를 화면이 알아채려면
 *    스텝별 값이 필요하다.
 *
 * ## 이 형식을 택한 이유
 *
 * - **`source` 를 없애지 않고 덧붙인다.** 화면 레벨 단일 배지(`docs/UX.md` UX-004 States "Fallback")
 *   에는 합쳐진 한 값이 여전히 정확한 입력이고, 없애면 기존 소비처·목 데이터·확장 어댑터가 한꺼번에
 *   깨진다(F1-a가 `ticketOption` 을 12번째로 **덧붙인** 것과 같은 방식).
 * - **선택적(`?`) 프로퍼티를 쓰지 않는다.** 세 스텝은 AC-032 고정 순서상 `POST /api/mediate` 에서
 *   **항상 실행**되므로 "값이 없는 스텝"이 존재하지 않는다(파일 헤더 "선택적 프로퍼티를 쓰지 않는 이유").
 * - 🔴 **C6·C7을 여기에 넣지 않는다.** 둘은 별도 엔드포인트이고 각각 **LLM 호출이 1회**라
 *   `TicketResultBase.source` · `SummaryResult.source` 의 단일 값이 이미 정확하다. 합치는 순간
 *   "합쳐서 잃는 정보"가 없던 곳에까지 이 구조를 퍼뜨리게 된다.
 */
export interface StepSources {
  /** C1 긴급도 분류(`runUrgencyClassification`)의 출처. 산출물: `urgency`(판정분) · `urgencyReason`. */
  c1: ResponseSource;
  /** C2 톤 변환(`runToneTransform`)의 출처. 산출물: `transformed` · `reason` · `preserved[]` · `misreadRisks[]`. */
  c2: ResponseSource;
  /** C4 역번역(`runBackTranslation`)의 출처. 산출물: `backTranslation`. */
  c4: ResponseSource;
}

// ─────────────────────────────────────────────────────────────────────────────
// 응답 (Result) — 주 경로
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 중재 결과 — `POST /api/mediate` 의 응답 본문 (`docs/API.md` 가 이 타입을 역참조한다).
 * 형태는 `docs/Architecture.md:229~241` 의 F1 코드 블록이 고정했다.
 *
 * 🔴 **부분 실패는 실패가 아니다.** 공휴일 조회·이모지 판정이 실패해도 중재 전체를 실패시키지
 * 않는다 — 해당 배열이 비어 나가고 나머지는 정상 반환된다(`docs/Architecture.md` Error Handling
 * "Cross-boundary propagation" ④).
 */
export interface MediationResult {
  /** C1 긴급도 판정 결과 (AC-003). 사용자 override가 있으면 그 값이 반영된 결과다(AC-004). */
  urgency: UrgencyLevel;
  /**
   * 그 등급으로 판정한 **근거 문장** (AC-003).
   * 등급과 근거는 항상 함께 표시된다 — 근거 없는 등급은 사용자가 override할 판단 재료를 주지 않는다.
   */
  urgencyReason: string;
  /** 톤 변환된 메시지 본문. 보존 항목은 이 안에 살아 있어야 한다(AC-006). */
  transformed: string;
  /**
   * **변환 이유 1건**을 담는 단일 필드 (UX-004의 "변환 이유" 라인, AC-008).
   * 🔴 다건 리스트가 아니다 — 오해 위험 다건은 `misreadRisks[]` 가 담는다(Planning Decision #49 ④).
   */
  reason: string;
  /**
   * 보존된 항목들 (AC-006 / AC-007). 보존 대상이 원문에 없으면 빈 배열이며,
   * 🔴 **보존 항목이 조용히 누락되면 안 된다**(`docs/UX.md` UX-004 Business Rules).
   */
  preserved: PreservedItem[];
  /**
   * 변환문을 원어로 되돌린 역번역 (AC-001).
   * UI는 이 옆에 "완전한 검증이 아니라 큰 오역을 걸러내는 1차 안전장치" 한계 문구를 **상시** 표시한다(AC-002).
   */
  backTranslation: string;
  /**
   * 변환 *결과*의 문제 — 이모지·존댓말 혼용·호칭 미등록 (AC-046 ③ / AC-047 ② / AC-056).
   * 문제가 없으면 빈 배열. `misreadRisks` 와 대상이 다르므로 **합치지 않는다**(`MisreadRisk` 주석).
   */
  warnings: Warning[];
  /**
   * 🔴 **전용 필드** — *원문*이 상대에게 어떻게 읽히는지 (AC-043, Planning Decision #49).
   * 근거가 없으면 **빈 배열**이며 위험을 지어내지 않는다. 합치면 안 되는 이유 4가지는
   * `MisreadRisk` 주석에 있다.
   */
  misreadRisks: MisreadRisk[];
  /**
   * 마감일 ↔ 수신자 국가 연휴 충돌 (AC-057). 충돌이 없거나 **휴일 데이터가 없는 국가**면
   * 빈 배열이고, 두 경우 모두 화면에 아무것도 렌더하지 않는다(AC-063 ①) — `HolidayConflict` 주석 참조.
   */
  holidayConflicts: HolidayConflict[];
  /**
   * 🔴 개인화(프로필·쌍방 규약·타임존)가 실제로 적용됐는가.
   * `false` 가 되는 두 경우: ① 발신자 프로필이 비었거나 온보딩을 건너뛴 상태(AC-059 ③)
   * ② 수신자가 미지정(AC-066 ③). **UI가 "개인화 미적용"을 표시하는 유일한 근거**이며,
   * 무음 처리하면 "없는 것을 있는 것처럼 보이게" 하는 셈이라 AC-034와 같은 원칙에 걸린다.
   */
  personalizationApplied: boolean;
  /**
   * 🔴 이 응답 **전체**의 출처 (AC-041). `'live'` 가 아니면 UI가 화면 레벨 "폴백 응답 사용 중"
   * 배지를 렌더한다 — `ResponseSource` 주석 참조.
   *
   * 🔴 **`stepSources` 에서 파생되는 값이다(F1-e 불변식)**: `source` 는 `stepSources` 의 세 값 중
   * **가장 신뢰도가 낮은 것**과 같다(우선순위 `fallback` > `cache` > `live`). 이 규칙은
   * `apps/web/app/api/mediate/route.ts:82` 의 `combineSource` 가 명세 없이 쓰고 있던 것을
   * F1-e가 계약으로 승격한 것이다 — **어느 영역에 배지를 붙일지**는 이 필드가 아니라
   * `stepSources` 가 결정한다.
   */
  source: ResponseSource;
  /**
   * 🔴 **13번째 필드** (2026-08-05 추가 — DECISIONS #48 · ADR-0009 · `docs/Architecture.md` F1-e).
   * 스텝별 출처. `StepSources` 주석이 이 필드가 필요한 이유 3가지를 담고 있다.
   *
   * 🔴 **앞의 12개 필드는 이 추가로 바뀌지 않았다** — 순서·이름·타입·값 어휘 모두 그대로이고
   * 13번째로 덧붙었을 뿐이다(F1-a가 `ticketOption` 을 덧붙인 것과 같은 성격의 변경).
   *
   * 🔴 **불변식은 타입으로 강제되지 않는다 — 판별 유니온으로 표현할 수 없기 때문이다.**
   * F1-c의 기법은 *짝* 제약(`offered` ⟺ `basis`)에만 통하고, 여기 불변식은 **세 값의 집계**라
   * 유니온으로 쓰면 3³ = 27조합이 된다(가독성이 무너지고 지키려는 것보다 더 큰 사고 표면이 생긴다).
   * 대신 ① 파생을 **함수 하나**로만 하고 ② 그 함수의 테스트가 불변식의 근거가 된다 — 짝을 손으로
   * 조립하지 않는다는 Conventions 13의 취지와 같다.
   */
  stepSources: StepSources;
  /**
   * 🔴 **12번째 필드** (2026-08-04 추가 — DECISIONS #35 · `docs/Architecture.md` F1-a).
   * C6 티켓 옵션 게이트 판정 (AC-058). `TicketOption` 주석 참조.
   *
   * 🔴 **앞의 11개 필드는 이 추가로 바뀌지 않았다** — 순서·이름·타입 모두 그대로이고
   * 12번째로 덧붙었을 뿐이다(`docs/Architecture.md:241`). 위치는 원래
   * `docs/API.md` 의 `POST /api/ticket` 게이트 행이 확정해 두었고 **빠져 있던 것은 형식**이다.
   *
   * 🔴 `null` 이 아니라 **항상 존재하는 객체**다. `nullable boolean` 으로 두면 `if (x)` 에서
   * `null` 과 `false` 가 같아 보여 **부분 실패가 정상 판정으로 위장**된다(F1-a 이유 3).
   */
  ticketOption: TicketOption;
}

// ─────────────────────────────────────────────────────────────────────────────
// 응답 (Result) — C6 티켓 / C7 요약
// ─────────────────────────────────────────────────────────────────────────────

/**
 * C6 티켓의 4섹션 (AC-017 / AC-018 / AC-062).
 *
 * 🔴 **4개 섹션은 근거 유무와 무관하게 항상 존재한다.** 근거가 없는 섹션은 생략·빈 문자열이
 * 아니라 문자열 `"없음"` 으로 명시한다(AC-062). 없는 내용을 지어내 채우지도 않는다(AC-020 원칙).
 * 그래서 네 필드가 전부 필수 `string` 이고 `null` 을 허용하지 않는다 — nullable로 두면
 * "섹션 누락"과 "근거 없음"이 타입에서 구분되지 않는다.
 */
export interface TicketSections {
  /** [문제 정의] */
  problem: string;
  /** [영향·리스크] */
  impact: string;
  /** [요청 사항] */
  request: string;
  /**
   * [우려 수준] — 🔴 원문의 **감정 강도를 메타 정보로 보존**하는 자리다(AC-018).
   * 감정을 삭제해 중립화하는 것이 아니라 형태를 바꿔 남긴다(제품의 Border 04 대응).
   */
  concernLevel: string;
}

/** 티켓 결과의 공통부(4섹션 + 출처) — 불변식 2와 무관한 필드. `TicketAuthority` 와 결합해 `TicketResult` 가 된다. */
export interface TicketResultBase {
  /** 4섹션 본문. 항상 4개가 존재한다 — `TicketSections` 주석 참조(AC-062). */
  sections: TicketSections;
  /** 이 응답의 출처 (AC-041). */
  source: ResponseSource;
}

/**
 * 🔴 **F1-c (DECISIONS #38 · ADR-0006) — 불변식 2의 판별 유니온.** *ⓒ-1 — 티켓 1건에 대한
 * 최상위 단일값*(AC-064 ①). 티켓 하나당 상태가 하나이므로 배열이 아니다. enum·판정 로직은
 * `rules/decision-authority.ts` 를 C7과 **공유**한다(AC-064 ④ — C7이 별도 판정 파이프라인을
 * 만들지 않는다). 값을 만드는 유일한 통로는 `resolveAuthority()` 다 — 짝을 손으로 조립하지 않는다.
 *
 * - 판정값(`'확정'`/`'내부 승인 필요'`/`'검토 중'`)이면 **근거 문장이 반드시 함께 있다.**
 * - `'불명'` 이면 근거는 `null` 일 수 있다 — 🔴 **근거 없이 `'확정'` 같은 값이 오는 조합은
 *   타입에서 표현 불가능하다**(AC-064 ⑤ = AC-050 ①, 이전에는 주석으로만 존재하던 불변식).
 */
export type TicketAuthority =
  | { decisionAuthority: DecisionAuthorityJudged; decisionAuthorityEvidence: string }
  | { decisionAuthority: '불명'; decisionAuthorityEvidence: string | null };

/**
 * C6 하소연 → 태스크 티켓 변환 결과 (`POST /api/ticket`, UX-007).
 *
 * 🔴 **이 경로가 쓰는 결정 권한 필드 이름은 `decisionAuthority` 하나뿐이다** —
 * C7의 `SummaryResult.decisions[].authorityStatus` 와 **이름이 다르고 둘 다 존재**한다(AC-064 ③).
 * 두 이름을 통합·재사용하지 말 것: 자세한 이유는 `SummaryResult` 주석에 있다.
 */
export type TicketResult = TicketResultBase & TicketAuthority;

/** 결정 항목의 공통부(내용/담당자/기한) — 불변식 3와 무관한 필드. `ItemAuthority` 와 결합해 `DecisionItem` 이 된다. */
export interface DecisionItemBase {
  /** 결정 내용. */
  decision: string;
  /** 담당자. 🔴 스레드에 근거가 없으면 `null` — UI가 "미정"으로 렌더한다. 임의 생성 금지(AC-020). */
  owner: string | null;
  /** 기한. 🔴 근거가 없으면 `null` — 위와 동일(AC-020). */
  dueDate: string | null;
}

/**
 * 🔴 **F1-c (DECISIONS #38 · ADR-0006) — 불변식 3의 판별 유니온.** *ⓒ-2 — 결정 항목마다
 * 하나씩, `decisions[]` 배열의 각 객체 안*(AC-064 ②). 이름이 `decisionAuthority` 가 **아니다**.
 * enum·판정 로직은 C6와 공유한다(AC-064 ④). 값을 만드는 유일한 통로는 `resolveAuthority()` 다.
 *
 * 판정값이면 근거 문장이 반드시 함께 있고, `'불명'` 이면 근거는 `null` 일 수 있다 — 🔴 **근거
 * 없이 `'확정'` 같은 값이 오는 조합은 타입에서 표현 불가능하다**(AC-064 ⑤, 불변식 2와 같은
 * 문제의 C7쪽). UI는 `'불명'` 을 빈칸이 아니라 "불명"으로 명시 표기한다.
 */
export type ItemAuthority =
  | { authorityStatus: DecisionAuthorityJudged; authorityEvidence: string }
  | { authorityStatus: '불명'; authorityEvidence: string | null };

/**
 * C7 요약 표의 한 행 = 결정 항목 1건 (AC-019 / AC-020 / AC-064 ②).
 */
export type DecisionItem = DecisionItemBase & ItemAuthority;

/**
 * "합의된 것으로 보이나 담당자 또는 기한이 비어 있는" 항목 (AC-038).
 * 근거 없는 담당자·기한을 임의 생성하는 대신 **비었다는 사실을 명시**하는 자리다.
 */
export interface UnresolvedItem {
  /** 대상 결정 내용. */
  decision: string;
  /** 무엇이 비었는지. 🔴 어떤 필드가 비었는지 명시해야 한다(AC-038). */
  missingFields: ('owner' | 'dueDate')[];
}

/**
 * C7 결정사항 자동 요약 결과 (`POST /api/summary`, UX-008).
 *
 * ## 🔴 `decisions[].authorityStatus` 를 `TicketResult.decisionAuthority` 와 통합하면 안 되는 이유
 *
 * 1. **AC-064 ③이 "두 이름이 동시에 존재하고 어느 한쪽도 다른 쪽을 대체하지 않는다"를
 *    판정 조건으로 쓴다** — 스키마와 실제 payload를 grep해 두 이름이 각각 해당 경로에서만
 *    나타나는지 확인한다. 통합하면 그 판정이 실패한다.
 * 2. **단위가 다르다.** C6는 티켓 1건 = 상태 1개, C7은 결정 항목 N건 = 상태 N개다.
 *    단일값으로 통일하면 C7의 행별 구분이 사라지고, 배열로 통일하면 C6의 진짜 단일 상태가
 *    원소 1개짜리 배열이 된다(`docs/UX.md` Decision Log "Decision Authority Field Names Split"
 *    의 기각된 대안 (a)(b)).
 * 3. **같은 이름을 스코프만 달리 쓰는 안은 명시적으로 기각됐다**(같은 Decision Log의 대안 (c)) —
 *    프론트·백엔드가 어느 쪽을 읽는지 **코드에서 구분되지 않아** 스키마 불일치(재작업 최대 원인,
 *    `docs/Tasks.md` Rules 첫 줄)에 정면으로 걸린다.
 * 4. 이 분리는 사용자 결정이다(PRD v2.7 / Planning Decision #84 / AC-064). implementer·reviewer가
 *    "정리" 목적으로 되돌릴 수 있는 스타일 문제가 아니다.
 *
 * **공유되는 것은 enum과 판정 로직**이며(`rules/decision-authority.ts` 한 곳), 나뉘는 것은
 * **필드 이름과 배치**뿐이다(AC-064 ④, Planning Decision #8 불변).
 */
export interface SummaryResult {
  /** 결정 항목들. 근거가 없으면 빈 배열이며 항목을 지어내지 않는다(AC-020). */
  decisions: DecisionItem[];
  /** 담당자·기한이 비어 있는 항목들 (AC-038). 없으면 빈 배열. */
  unresolved: UnresolvedItem[];
  /** 이 응답의 출처 (AC-041). */
  source: ResponseSource;
}
