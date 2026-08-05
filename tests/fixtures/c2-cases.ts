/**
 * T11 회귀 검증셋 — C2(T10) 관련 53건의 **픽스처**.
 *
 * 🔴 **단일 출처는 `docs/TestCases.md`(planner 소유)다.** 이 파일은 그 문서의 표 A(v1.0)와 표 B
 * (v1.2)에 이미 정의된 케이스를 실행 가능한 TypeScript 값으로 옮겨 적은 것일 뿐이며, **새 케이스를
 * 만들지 않는다**(`docs/Tasks.md` T11: "케이스 원문은 docs/TestCases.md를 단일 출처로 사용한다").
 * 각 케이스 옆 주석에 원본 표 위치를 남긴다 — 문서가 바뀌면 이 파일도 같이 갱신해야 한다.
 *
 * ## 이 파일이 포함하는 것 (`docs/Tasks.md` T11 원문 — "표 A 52건 중 T10 관련 46건 + 표 B의
 * T-P 7건 = 53건")
 * - 표 A(`docs/TestCases.md:31~168`)에서 **AC-047(호칭·직급 매핑, C5 소관) 6건을 제외**한 46건:
 *   AC-006(P-01~10) · AC-043(M-01~10) · AC-045(U-01~10) · AC-046(H-01~10) · AC-049(D-01~06).
 * - 표 B(`docs/TestCases.md:328~339`)의 T-P02~T-P08 7건(AC-006 축, T-P01은 P-01과 중복이라
 *   문서 자체가 채택하지 않았다 — 여기서도 만들지 않는다).
 *
 * ## 🔴 "필수 포함"을 문자열로 판정하는 것의 한계 (implementer 판단 — 근거를 남긴다)
 * `docs/TestCases.md` 판정 방법: *"필수 포함: 변환문에 이 값(또는 동등한 의미의 값)이 존재해야
 * 한다."* 이 문서의 "미확정 항목" 표(:454)가 스스로 인정한다 — *"'동등한 의미의 값' 판정을 사람이
 * 하는가 자동인가 … 문자열 완전일치로는 AC-006의 의미 보존을 판정할 수 없다 … T11 구현 시
 * architect/implementer 판단. 초기에는 사람 판정으로 시작하고 안정되면 자동화 권고(추정)."*
 * 이 판단을 다음과 같이 적용했다:
 * - 원문에 **날짜·숫자·고유명사**처럼 값이 고정된 항목은 `literal`/`anyOf`(허용 표기 목록)로
 *   자동 판정한다 — 이 부분은 실제로 문자열 매칭이 신뢰할 만하다.
 * - "스프린트 지연 영향", "요청 액션 문장" 처럼 **개념만 서술되고 리터럴 문구가 주어지지 않은
 *   항목**은 `humanJudgment`로 표시한다 — 억지로 키워드 목록을 만들면 과적합(TestCases.md 금지
 *   1항 "케이스를 통과시키기 위해 프롬프트를 케이스 문자열에 맞추지 말 것"과 반대 방향의 오류,
 *   즉 판정기를 케이스에 맞춰 느슨하게 짜 맞추는 것)이 된다. `runC2Regression`(`../regression-c2`)
 *   은 이런 항목이 하나라도 있는 케이스를 **`needs-human-review`**로 표시하고 `pass`로 집계하지
 *   않는다 — "구조 검사만으로 통과 처리하지 않는다"(`docs/CodingRules.md` Tests)의 직접 적용이다.
 */
import type { LanguageDirection } from '@cross-border/core';

export type RequiredItem =
  | { kind: 'literal'; text: string }
  | { kind: 'anyOf'; options: string[] }
  | { kind: 'humanJudgment'; note: string };

function lit(text: string): RequiredItem {
  return { kind: 'literal', text };
}
function anyOf(...options: string[]): RequiredItem {
  return { kind: 'anyOf', options };
}
function human(note: string): RequiredItem {
  return { kind: 'humanJudgment', note };
}

export interface PreservationCase {
  ac: 'AC-006';
  id: string;
  direction: LanguageDirection;
  input: string;
  required: RequiredItem[];
  forbidden: string[];
}

export interface MisreadRiskCase {
  ac: 'AC-043';
  id: string;
  direction: LanguageDirection;
  input: string;
  /** true = 위험 케이스(M-01~06, misreadRisks[] 비어있지 않아야 함). false = 중립 케이스(M-07~10, 빈 배열이어야 함). */
  expectRisk: boolean;
  /** 문서의 "예상되는 오해" 참고용 텍스트 — 자동 판정에 쓰지 않는다(의미 판정이라 사람 참고용). */
  expectedMisreadingHint?: string;
}

export interface UrgencyRestorationCase {
  ac: 'AC-045';
  id: string;
  direction: LanguageDirection;
  input: string;
  required: RequiredItem[];
  forbidden: string[];
}

export interface HonorificCase {
  ac: 'AC-046';
  id: string;
  direction: LanguageDirection;
  input: string;
}

export interface DateNumberCase {
  ac: 'AC-049';
  id: string;
  direction: LanguageDirection;
  input: string;
  required: RequiredItem[];
  forbidden: string[];
}

export type C2Case =
  PreservationCase | MisreadRiskCase | UrgencyRestorationCase | HonorificCase | DateNumberCase;

// ─────────────────────────────────────────────────────────────────────────────
// AC-006 — 긴급도·정보 보존 (표 A, `docs/TestCases.md:31~48`, P-01~P-10)
// ─────────────────────────────────────────────────────────────────────────────
const AC006_CASES: PreservationCase[] = [
  {
    ac: 'AC-006',
    id: 'P-01',
    direction: 'ko-en',
    input: '금요일까지 안 주시면 다음 스프린트 전체가 밀립니다. 꼭 좀 부탁드려요.',
    required: [
      anyOf('Friday'),
      human('스프린트 지연 영향 서술 보존 여부'),
      human('요청 액션 문장 보존 여부'),
    ],
    forbidden: ['when you get a chance', 'no rush'],
  },
  {
    ac: 'AC-006',
    id: 'P-02',
    direction: 'ko-en',
    input: '결제 API 죽었습니다. 지금 주문 전부 실패 중이에요. 당장 확인 부탁드립니다.',
    required: [
      anyOf('payment API', 'payment system'),
      human('주문 전량 실패 서술 보존 여부'),
      human('즉시 확인 요청 보존 여부'),
    ],
    forbidden: ['if possible', 'at your convenience'],
  },
  {
    ac: 'AC-006',
    id: 'P-03',
    direction: 'ko-en',
    input: '8월 12일 14시에 릴리스 예정이니 그 전에 QA 결과 회신 부탁드립니다.',
    required: [
      anyOf('Aug 12, 2026', 'August 12, 2026', '12 Aug 2026'),
      anyOf('14:00', '2:00 PM', '2 PM'),
      anyOf('QA'),
      human('릴리스 전 회신 요청 보존 여부'),
    ],
    forbidden: [],
  },
  {
    ac: 'AC-006',
    id: 'P-04',
    direction: 'ko-en',
    input: '서버 응답이 평소 200ms에서 3초로 늘었습니다. 원인 확인이 필요합니다.',
    required: [lit('200ms'), anyOf('3 seconds', '3s', '3 sec'), human('원인 확인 요청 보존 여부')],
    forbidden: [],
  },
  {
    ac: 'AC-006',
    id: 'P-05',
    direction: 'ko-en',
    input: '예산이 5천만원에서 3천만원으로 줄었습니다. 범위 재조정이 필요합니다.',
    required: [
      anyOf('50,000,000 KRW', '5천만원', '50 million KRW'),
      anyOf('30,000,000 KRW', '3천만원', '30 million KRW'),
      human('범위 재조정 필요 보존 여부'),
    ],
    forbidden: ['USD'],
  },
  {
    ac: 'AC-006',
    id: 'P-06',
    direction: 'ko-en',
    input: '테스트 계정 3개가 필요합니다. 내일 오전까지 발급 부탁드립니다.',
    required: [lit('3'), anyOf('tomorrow morning', 'tomorrow AM'), human('발급 요청 보존 여부')],
    forbidden: ['some accounts', 'a few'],
  },
  {
    ac: 'AC-006',
    id: 'P-07',
    direction: 'ko-en',
    input: '이번 배포는 반드시 롤백 플랜을 첨부해 주세요.',
    required: [anyOf('must', 'required', 'mandatory'), anyOf('rollback plan')],
    forbidden: ['if you can', 'optionally'],
  },
  {
    ac: 'AC-006',
    id: 'P-08',
    direction: 'ko-en',
    input: '오류율이 0.3%에서 12%로 올랐습니다. 어제 배포 이후입니다.',
    required: [lit('0.3%'), lit('12%'), anyOf("yesterday's deploy", 'since yesterday')],
    forbidden: [],
  },
  {
    ac: 'AC-006',
    id: 'P-09',
    direction: 'ko-en',
    input: '계약서 초안은 8/8까지, 최종본은 8/15까지 필요합니다.',
    required: [anyOf('Aug 8, 2026', 'August 8, 2026'), anyOf('Aug 15, 2026', 'August 15, 2026')],
    forbidden: ['8/8', '8/15'],
  },
  {
    ac: 'AC-006',
    id: 'P-10',
    direction: 'ko-en',
    input: '미팅은 한국 시간 기준 오전 10시입니다. 링크는 별도로 보내드리겠습니다.',
    required: [
      anyOf('10:00 KST', '10 AM KST', '10:00 AM KST'),
      human('링크 별도 발송 서술 보존 여부'),
    ],
    forbidden: [],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// AC-006 축 — 표 B T-P02~T-P08 (`docs/TestCases.md:328~338`, T-P01은 P-01과 중복이라 미채택)
// ─────────────────────────────────────────────────────────────────────────────
const T_P_CASES: PreservationCase[] = [
  {
    ac: 'AC-006',
    id: 'T-P02',
    direction: 'ko-en',
    input: '내일 오후 2시 회의 전까지 데이터 부탁드립니다',
    required: [
      anyOf('tomorrow 2 PM', 'tomorrow at 2 PM', '2:00 PM tomorrow'),
      human('회의 전 데이터 요청 보존 여부'),
    ],
    forbidden: [],
  },
  {
    ac: 'AC-006',
    id: 'T-P03',
    direction: 'ko-en',
    input: '이 버그는 배포 전에 반드시 수정돼야 합니다',
    required: [
      anyOf('before deployment', 'before the release', 'pre-deployment'),
      anyOf('must', 'required'),
    ],
    forbidden: [],
  },
  {
    ac: 'AC-006',
    id: 'T-P04',
    direction: 'ko-en',
    input: '예산이 초과되어 승인 없이는 진행 불가합니다',
    required: [anyOf('budget', 'over budget', 'exceeded'), anyOf('approval', 'without approval')],
    forbidden: [],
  },
  {
    ac: 'AC-006',
    id: 'T-P05',
    direction: 'ko-en',
    input: '재발 방지책을 이번 주 내로 공유해 주세요',
    required: [anyOf('prevention plan', 'recurrence prevention'), anyOf('this week')],
    forbidden: [],
  },
  {
    ac: 'AC-006',
    id: 'T-P06',
    direction: 'ko-en',
    input: '8월 21일이 최종 마감이며 연장은 불가합니다',
    required: [
      anyOf('Aug 21, 2026', 'August 21, 2026'),
      anyOf('no extension', 'cannot be extended'),
    ],
    forbidden: ['8/21'],
  },
  {
    ac: 'AC-006',
    id: 'T-P07',
    direction: 'ko-en',
    input: '테스트 환경에서만 확인됐고 운영 반영은 안 했습니다',
    required: [
      anyOf('test environment', 'staging'),
      anyOf(
        'not deployed to production',
        'not in production',
        'has not been applied to production',
      ),
    ],
    forbidden: [],
  },
  {
    ac: 'AC-006',
    id: 'T-P08',
    direction: 'ko-en',
    input: '세 명 중 두 명이 반대해서 보류하기로 했습니다',
    required: [
      anyOf('two out of three', '2 of 3', 'two of the three'),
      anyOf('postponed', 'on hold', 'deferred'),
    ],
    forbidden: [],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// AC-043 — 오해 사전 경고 (표 A, `docs/TestCases.md:52~76`, M-01~M-10)
// ─────────────────────────────────────────────────────────────────────────────
const AC043_CASES: MisreadRiskCase[] = [
  {
    ac: 'AC-043',
    id: 'M-01',
    direction: 'ko-en',
    input: '확인 부탁드립니다.',
    expectRisk: true,
    expectedMisreadingHint: "상대가 '단순 참고'로 받아들여 아무 액션도 취하지 않을 수 있음",
  },
  {
    ac: 'AC-043',
    id: 'M-02',
    direction: 'ko-en',
    input: '가능하시면 검토해 주세요.',
    expectRisk: true,
    expectedMisreadingHint: '선택 사항으로 읽혀 우선순위에서 밀릴 수 있음',
  },
  {
    ac: 'AC-043',
    id: 'M-03',
    direction: 'ko-en',
    input: '이 부분은 좀 아쉽네요.',
    expectRisk: true,
    expectedMisreadingHint:
      '부정 평가인지 단순 감상인지 구분되지 않아 수정 요청으로 전달되지 않을 수 있음',
  },
  {
    ac: 'AC-043',
    id: 'M-04',
    direction: 'ko-en',
    input: '다음에 논의하시죠.',
    expectRisk: true,
    expectedMisreadingHint: '시점이 없어 무기한 보류로 읽힐 수 있음',
  },
  {
    ac: 'AC-043',
    id: 'M-05',
    direction: 'ko-en',
    input: '제 생각에는 A안이 나을 것 같습니다.',
    expectRisk: true,
    expectedMisreadingHint: '최종 결정인지 개인 의견인지 불명확해 결정이 안 된 채로 남을 수 있음',
  },
  {
    ac: 'AC-043',
    id: 'M-06',
    direction: 'ko-en',
    input: '괜찮습니다.',
    expectRisk: true,
    expectedMisreadingHint: '승인과 거절 양쪽으로 읽힐 수 있음',
  },
  {
    ac: 'AC-043',
    id: 'M-07',
    direction: 'ko-en',
    input: '8월 12일 14시에 릴리스합니다.',
    expectRisk: false,
  },
  {
    ac: 'AC-043',
    id: 'M-08',
    direction: 'ko-en',
    input: '테스트 계정 3개를 발급했습니다. 아이디는 메일로 보냈습니다.',
    expectRisk: false,
  },
  {
    ac: 'AC-043',
    id: 'M-09',
    direction: 'ko-en',
    input: '빌드가 성공했습니다.',
    expectRisk: false,
  },
  { ac: 'AC-043', id: 'M-10', direction: 'ko-en', input: '회의록 링크입니다.', expectRisk: false },
];

// ─────────────────────────────────────────────────────────────────────────────
// AC-045 — 어미에 숨은 긴급도 복원, KO→EN (표 A, `docs/TestCases.md:80~104`, U-01~U-10)
// ─────────────────────────────────────────────────────────────────────────────
const AC045_CASES: UrgencyRestorationCase[] = [
  {
    ac: 'AC-045',
    id: 'U-01',
    direction: 'ko-en',
    input: '혹시 오늘 중으로 가능하실까요?',
    required: [anyOf('today', 'EOD today', 'by end of day'), human('확인 요청 문장 존재 여부')],
    forbidden: ['maybe', 'if possible', 'whenever'],
  },
  {
    ac: 'AC-045',
    id: 'U-02',
    direction: 'ko-en',
    input: '가급적 내일 오전까지 부탁드립니다.',
    required: [anyOf('tomorrow morning'), human('요청 문장 존재 여부')],
    forbidden: ['if you can'],
  },
  {
    ac: 'AC-045',
    id: 'U-03',
    direction: 'ko-en',
    input: '시간 되실 때 한번 봐주시면 좋겠습니다만, 금요일 배포가 걸려 있습니다.',
    required: [anyOf('Friday'), human('배포 의존성 서술 보존 여부'), human('요청 문장 존재 여부')],
    forbidden: ['when you get a chance'],
  },
  {
    ac: 'AC-045',
    id: 'U-04',
    direction: 'ko-en',
    input: '되도록이면 이번 주 안에 회신 주시면 감사하겠습니다.',
    required: [anyOf('this week'), human('회신 요청 존재 여부')],
    forbidden: ['if you have time'],
  },
  {
    ac: 'AC-045',
    id: 'U-05',
    direction: 'ko-en',
    input: '조금 급한 건인데 언제쯤 확인 가능하실까요?',
    required: [anyOf('urgent'), human('확인 시점을 묻는 문장 존재 여부')],
    forbidden: ['slightly', 'a bit'],
  },
  {
    ac: 'AC-045',
    id: 'U-06',
    direction: 'ko-en',
    input: '혹시 지금 보고 계신 거라면 바로 알려주실 수 있을까요?',
    required: [anyOf('now', 'right away', 'immediately'), human('회신 요청 존재 여부')],
    forbidden: ['by any chance'],
  },
  {
    ac: 'AC-045',
    id: 'U-07',
    direction: 'ko-en',
    input: '바쁘신 와중에 죄송하지만, 결제 API 장애 건 확인 부탁드립니다.',
    required: [anyOf('payment API'), human('확인 요청 존재 여부')],
    forbidden: ['sorry to bother you'],
  },
  {
    ac: 'AC-045',
    id: 'U-08',
    direction: 'ko-en',
    input: '번거로우시겠지만 오늘 중 답변 주실 수 있을까요?',
    required: [anyOf('today'), human('답변 요청 존재 여부')],
    forbidden: ['I know this is a hassle'],
  },
  {
    ac: 'AC-045',
    id: 'U-09',
    direction: 'ko-en',
    input: '이런 말씀 드리기 조심스럽지만, 지난주 요청드린 건이 아직 반영되지 않았습니다.',
    required: [human('미반영 사실 보존 여부'), human('후속 조치 요청 존재 여부')],
    forbidden: ['I hate to say this'],
  },
  {
    ac: 'AC-045',
    id: 'U-10',
    direction: 'ko-en',
    input: '혹시 제가 놓친 부분이 있을까요? 금요일까지 승인이 안 되면 다음 스프린트가 밀립니다.',
    required: [
      anyOf('Friday'),
      human('승인 필요 서술 보존 여부'),
      human('스프린트 영향 서술 보존 여부'),
    ],
    forbidden: ['did I miss something'],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// AC-046 — 존댓말 레벨 일관성, EN→KO (표 A, `docs/TestCases.md:108~127`, H-01~H-10)
// 🔴 이 축은 required/forbidden 텍스트 매칭이 아니라 혼용 감지(`detectHonorificMixing`)로
// 판정한다 — `../regression-c2.ts` 참조.
// ─────────────────────────────────────────────────────────────────────────────
const AC046_CASES: HonorificCase[] = [
  { ac: 'AC-046', id: 'H-01', direction: 'en-ko', input: 'Can you check this by Friday?' },
  { ac: 'AC-046', id: 'H-02', direction: 'en-ko', input: 'Thanks for the quick turnaround.' },
  {
    ac: 'AC-046',
    id: 'H-03',
    direction: 'en-ko',
    input: "I disagree with this approach. Here's why.",
  },
  {
    ac: 'AC-046',
    id: 'H-04',
    direction: 'en-ko',
    input: 'Please review the attached spec and let me know.',
  },
  { ac: 'AC-046', id: 'H-05', direction: 'en-ko', input: 'We need to postpone the release.' },
  { ac: 'AC-046', id: 'H-06', direction: 'en-ko', input: 'Great work on the migration.' },
  {
    ac: 'AC-046',
    id: 'H-07',
    direction: 'en-ko',
    input: 'This is blocking our team. Can we prioritize it?',
  },
  { ac: 'AC-046', id: 'H-08', direction: 'en-ko', input: "I'll take care of it." },
  {
    ac: 'AC-046',
    id: 'H-09',
    direction: 'en-ko',
    input: 'Could you clarify what you meant in the last message?',
  },
  { ac: 'AC-046', id: 'H-10', direction: 'en-ko', input: 'The deadline moved to Aug 15.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// AC-049 — 날짜·숫자 형식 모호성 제거 (표 A, `docs/TestCases.md:155~168`, D-01~D-06)
// ─────────────────────────────────────────────────────────────────────────────
const AC049_CASES: DateNumberCase[] = [
  {
    ac: 'AC-049',
    id: 'D-01',
    direction: 'ko-en',
    input: '8/4까지 초안 부탁드립니다.',
    required: [anyOf('Aug 4, 2026', 'August 4, 2026')],
    forbidden: ['8/4', '04/08'],
  },
  {
    ac: 'AC-049',
    id: 'D-02',
    direction: 'ko-en',
    input: '2026.08.04 릴리스 예정입니다.',
    required: [anyOf('Aug 4, 2026', 'August 4, 2026')],
    forbidden: ['2026.08.04'],
  },
  {
    ac: 'AC-049',
    id: 'D-03',
    direction: 'ko-en',
    input: '계약서 초안은 8/8까지, 최종본은 8/15까지 필요합니다.',
    required: [anyOf('Aug 8, 2026', 'August 8, 2026'), anyOf('Aug 15, 2026', 'August 15, 2026')],
    forbidden: ['8/8', '8/15'],
  },
  {
    ac: 'AC-049',
    id: 'D-04',
    direction: 'ko-en',
    input: '비용은 3,000만원입니다.',
    required: [anyOf('30,000,000 KRW', '3,000만원', '3천만원')],
    forbidden: ['USD', '$'],
  },
  {
    ac: 'AC-049',
    id: 'D-05',
    direction: 'ko-en',
    input: '응답 시간이 200ms입니다.',
    required: [lit('200ms')],
    forbidden: ['0.2s', '0.2 s', '0.2 seconds'],
  },
  {
    ac: 'AC-049',
    id: 'D-06',
    direction: 'ko-en',
    input: '미팅은 9/1 오전 10시(KST)입니다.',
    required: [anyOf('Sep 1, 2026', 'September 1, 2026'), anyOf('10:00 KST', '10 AM KST')],
    forbidden: ['9/1'],
  },
];

/** 표 A(AC-047 제외 46건) + 표 B T-P(7건) = 53건. `docs/Tasks.md` T11의 실행 대상 전체. */
export const C2_REGRESSION_CASES: C2Case[] = [
  ...AC006_CASES,
  ...T_P_CASES,
  ...AC043_CASES,
  ...AC045_CASES,
  ...AC046_CASES,
  ...AC049_CASES,
];
